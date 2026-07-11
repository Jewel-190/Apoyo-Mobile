-- Mobile notification overhaul:
--   1. Denormalize `user_notification` (user_id, request_id, cached status) so it is
--      Realtime-filterable and self-contained (no audit_logs join on the hot path).
--   2. Invert the notify direction for applicants: only notify the request OWNER about
--      ADMIN/SYSTEM-initiated status changes, NOT the applicant's own edits.
--   3. Move to one row per (user_id, request_id) via upsert (mirror of admin_notification).
--   4. Simplify RLS to `user_id = auth.uid()` and add the table to the Realtime publication.
--   5. Add `user_push_token` + RPCs to prime future Expo/FCM/APNs push delivery.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Denormalize user_notification
-- ---------------------------------------------------------------------------

alter table public.user_notification
  add column if not exists user_id uuid,
  add column if not exists request_id uuid,
  add column if not exists action text,
  add column if not exists old_status text,
  add column if not exists new_status text;

-- audit_log_id is now just the "latest event" pointer; a request has one notif row.
alter table public.user_notification
  alter column audit_log_id drop not null;

-- Backfill new columns from the existing audit_logs link.
update public.user_notification un
set
  request_id = al.request_id,
  user_id = r.user_id,
  action = al.action,
  old_status = al.old_status,
  new_status = al.new_status
from public.audit_logs al
join public.assistance_requests r on r.id = al.request_id
where un.audit_log_id = al.id
  and (un.user_id is null or un.request_id is null);

-- Drop rows we cannot attribute to a live owner/request.
delete from public.user_notification
where user_id is null or request_id is null;

-- Collapse to one row per (user_id, request_id), keeping the newest.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, request_id
      order by created_at desc, updated_at desc, id desc
    ) as rn
  from public.user_notification
)
delete from public.user_notification un
using ranked
where un.id = ranked.id
  and ranked.rn > 1;

alter table public.user_notification
  alter column user_id set not null,
  alter column request_id set not null;

-- Foreign keys.
do $$ begin
  alter table public.user_notification
    add constraint user_notification_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.user_notification
    add constraint user_notification_request_id_fkey
    foreign key (request_id) references public.assistance_requests (id) on delete cascade;
exception when duplicate_object then null; end $$;

-- Old model was one row per audit event (unique audit_log_id); new model is per request.
alter table public.user_notification
  drop constraint if exists user_notification_audit_log_id_key;

do $$ begin
  alter table public.user_notification
    add constraint user_notification_user_request_key unique (user_id, request_id);
exception when duplicate_object then null; end $$;

create index if not exists user_notification_user_id_idx
  on public.user_notification (user_id);
create index if not exists user_notification_user_unread_idx
  on public.user_notification (user_id) where is_read = false;
create index if not exists user_notification_request_id_idx
  on public.user_notification (request_id);

-- Realtime needs the filter column present in the WAL image for UPDATE/DELETE.
alter table public.user_notification replica identity full;

-- ---------------------------------------------------------------------------
-- 2. Trigger: audit_logs → user_notification (inverted direction)
-- ---------------------------------------------------------------------------

create or replace function private.create_user_notification_from_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner uuid;
  v_new_status_normalized text;
  v_new_at timestamptz;
begin
  if new.request_id is null then
    return new;
  end if;

  v_new_status_normalized := lower(replace(coalesce(new.new_status, ''), '_', ' '));
  if v_new_status_normalized = 'draft' then
    return new;
  end if;

  v_owner := private.user_notification_request_owner(
    'assistance_requests',
    new.request_id
  );
  if v_owner is null then
    return new;
  end if;

  -- MOBILE RULE (inverse of admin): the applicant is only notified about
  -- admin/system-driven movements. If the change was made BY the owner
  -- (their own submit/resubmit/edit), do not notify them.
  -- changed_by IS NULL => system/service-role change => notify.
  if new.changed_by is not null and new.changed_by = v_owner then
    return new;
  end if;

  v_new_at := coalesce(new.changed_at, now());

  insert into public.user_notification (
    user_id,
    request_id,
    audit_log_id,
    action,
    old_status,
    new_status,
    is_read,
    created_at,
    updated_at
  )
  values (
    v_owner,
    new.request_id,
    new.id,
    new.action,
    new.old_status,
    new.new_status,
    false,
    v_new_at,
    now()
  )
  on conflict (user_id, request_id) do update
  set
    audit_log_id = excluded.audit_log_id,
    action = excluded.action,
    old_status = excluded.old_status,
    new_status = excluded.new_status,
    is_read = false,
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS: filter directly by user_id (fast + Realtime friendly)
-- ---------------------------------------------------------------------------

alter table public.user_notification enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'user_notification'
  loop
    execute format('drop policy if exists %I on public.user_notification', pol.policyname);
  end loop;
end $$;

create policy "user_notification_select_own"
  on public.user_notification
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_notification_update_own"
  on public.user_notification
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Realtime publication
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table public.user_notification;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- publication not present in some local stacks
end $$;

-- ---------------------------------------------------------------------------
-- 5. RPCs read/write denormalized columns directly (no audit_logs join)
-- ---------------------------------------------------------------------------

create or replace function public.get_latest_notifications_for_user(
  p_user_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  audit_log_id uuid,
  request_id uuid,
  request_table text,
  action text,
  old_status text,
  new_status text,
  is_read boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    un.id,
    un.audit_log_id,
    un.request_id,
    'assistance_requests'::text as request_table,
    un.action,
    un.old_status,
    un.new_status,
    un.is_read,
    un.created_at
  from public.user_notification un
  where un.user_id = p_user_id
  order by un.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

create or replace function public.get_unread_notification_count_for_user(
  p_user_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.user_notification un
  where un.user_id = p_user_id
    and un.is_read = false;
$$;

create or replace function public.mark_request_notifications_read_for_user(
  p_user_id uuid,
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.user_notification un
  set
    is_read = true,
    updated_at = now()
  where un.user_id = p_user_id
    and un.request_id = p_request_id
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_request_notifications_read(
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.user_notification un
  set
    is_read = true,
    updated_at = now()
  where un.user_id = auth.uid()
    and un.request_id = p_request_id
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.cleanup_user_notifications(
  p_read_retention interval default interval '30 days',
  p_remove_superseded boolean default true
)
returns table (
  deleted_orphaned integer,
  deleted_superseded integer,
  deleted_expired_read integer,
  total_deleted integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orphaned integer := 0;
  v_expired integer := 0;
begin
  -- Orphans (request/user removed) are handled by ON DELETE CASCADE, but sweep
  -- any stragglers whose request no longer exists.
  delete from public.user_notification un
  where not exists (
    select 1 from public.assistance_requests r where r.id = un.request_id
  );
  get diagnostics v_orphaned = row_count;

  -- One row per (user_id, request_id) is enforced by a unique constraint, so
  -- "superseded" duplicates no longer accumulate; keep the param for compatibility.

  delete from public.user_notification
  where is_read = true
    and created_at < now() - coalesce(p_read_retention, interval '30 days');
  get diagnostics v_expired = row_count;

  return query
  select v_orphaned, 0, v_expired, v_orphaned + v_expired;
end;
$$;

grant execute on function public.get_latest_notifications_for_user(uuid, integer) to authenticated;
grant execute on function public.get_latest_notifications_for_user(uuid, integer) to service_role;
grant execute on function public.get_unread_notification_count_for_user(uuid) to authenticated;
grant execute on function public.get_unread_notification_count_for_user(uuid) to service_role;
grant execute on function public.mark_request_notifications_read_for_user(uuid, uuid) to authenticated;
grant execute on function public.mark_request_notifications_read_for_user(uuid, uuid) to service_role;
grant execute on function public.mark_request_notifications_read(uuid) to authenticated;
grant execute on function public.cleanup_user_notifications(interval, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Push tokens (primed for Expo / FCM / APNs delivery)
-- ---------------------------------------------------------------------------

create table if not exists public.user_push_token (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text,
  device_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists user_push_token_user_id_idx
  on public.user_push_token (user_id);
create index if not exists user_push_token_enabled_idx
  on public.user_push_token (user_id) where enabled = true;

alter table public.user_push_token enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'user_push_token'
  loop
    execute format('drop policy if exists %I on public.user_push_token', pol.policyname);
  end loop;
end $$;

create policy "user_push_token_select_own"
  on public.user_push_token
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_push_token_modify_own"
  on public.user_push_token
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.upsert_user_push_token(
  p_token text,
  p_platform text default null,
  p_device_id text default null,
  p_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'upsert_user_push_token requires an authenticated caller'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_token), '') = '' then
    raise exception 'push token is required'
      using errcode = '22023';
  end if;

  insert into public.user_push_token (user_id, token, platform, device_id, enabled)
  values (v_uid, p_token, p_platform, p_device_id, coalesce(p_enabled, true))
  on conflict (user_id, token) do update
  set
    platform = excluded.platform,
    device_id = excluded.device_id,
    enabled = excluded.enabled,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.disable_user_push_token(
  p_token text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  update public.user_push_token
  set enabled = false, updated_at = now()
  where user_id = v_uid
    and token = p_token
    and enabled = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.upsert_user_push_token(text, text, text, boolean) to authenticated;
grant execute on function public.disable_user_push_token(text) to authenticated;

commit;
