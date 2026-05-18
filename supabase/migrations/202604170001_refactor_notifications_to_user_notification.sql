-- Refactor notifications table into a user-only table anchored by audit_log_id.

begin;

-- Rename old table if present.
do $$
begin
  if to_regclass('public.user_notification') is null
     and to_regclass('public.notifications') is not null then
    execute 'alter table public.notifications rename to user_notification';
  end if;
end
$$;

-- Ensure target table exists.
create table if not exists public.user_notification (
  id uuid primary key default gen_random_uuid(),
  audit_log_id uuid not null unique references public.audit_logs(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Remove legacy policies that depend on soon-to-be removed columns.
do $$
begin
  if to_regclass('public.user_notification') is not null then
    execute 'drop policy if exists "Users can read own notifications" on public.user_notification';
    execute 'drop policy if exists "Users can update own notifications" on public.user_notification';
  end if;

  if to_regclass('public.notifications') is not null then
    execute 'drop policy if exists "Users can read own notifications" on public.notifications';
    execute 'drop policy if exists "Users can update own notifications" on public.notifications';
  end if;
end
$$;

-- Remove redundant columns from previous shape.
alter table public.user_notification
  drop column if exists "admin",
  drop column if exists "user",
  drop column if exists request_id,
  drop column if exists request_table,
  drop column if exists title,
  drop column if exists body,
  drop column if exists old_status,
  drop column if exists new_status;

-- Ensure required core columns exist.
alter table public.user_notification
  add column if not exists audit_log_id uuid,
  add column if not exists is_read boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_notification
  alter column audit_log_id set not null;

-- Recreate FK/unique constraints consistently.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.user_notification'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.user_notification drop constraint %I', r.conname);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_notification'::regclass
      and conname = 'user_notification_audit_log_id_key'
  ) then
    alter table public.user_notification
      add constraint user_notification_audit_log_id_key unique (audit_log_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_notification'::regclass
      and conname = 'user_notification_audit_log_id_fkey'
  ) then
    alter table public.user_notification
      add constraint user_notification_audit_log_id_fkey
      foreign key (audit_log_id)
      references public.audit_logs(id)
      on delete cascade;
  end if;
end
$$;

-- Replace old indexes with new table indexes.
drop index if exists public.notifications_user_created_idx;
drop index if exists public.notifications_user_is_read_idx;
drop index if exists public.notifications_request_idx;

create index if not exists user_notification_created_idx
  on public.user_notification (created_at desc);

create index if not exists user_notification_is_read_idx
  on public.user_notification (is_read, created_at desc);

-- Updated-at trigger.
drop trigger if exists trg_notifications_updated_at on public.notifications;
drop trigger if exists trg_notifications_updated_at on public.user_notification;
drop trigger if exists trg_user_notification_updated_at on public.user_notification;

drop function if exists public.update_notifications_updated_at();

create or replace function public.update_user_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_user_notification_updated_at
before update on public.user_notification
for each row
execute function public.update_user_notification_updated_at();

-- Request owner resolver (user-only notification ownership).
create or replace function private.user_notification_request_owner(
  p_request_table text,
  p_request_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_request_table = 'hospitalization_requests' then (
      select r.user_id from public.hospitalization_requests r where r.id = p_request_id
    )
    when p_request_table = 'treatment_requests' then (
      select r.user_id from public.treatment_requests r where r.id = p_request_id
    )
    when p_request_table = 'medical_requests' then (
      select r.user_id from public.medical_requests r where r.id = p_request_id
    )
    when p_request_table = 'financial_requests' then (
      select r.user_id from public.financial_requests r where r.id = p_request_id
    )
    when p_request_table = 'monetary_requests' then (
      select r.user_id from public.monetary_requests r where r.id = p_request_id
    )
    when p_request_table = 'burial_requests' then (
      select r.user_id from public.burial_requests r where r.id = p_request_id
    )
    when p_request_table = 'cremation_requests' then (
      select r.user_id from public.cremation_requests r where r.id = p_request_id
    )
    when p_request_table = 'columbarium_requests' then (
      select r.user_id from public.columbarium_requests r where r.id = p_request_id
    )
    else null
  end;
$$;

create or replace function private.can_access_user_notification(
  p_audit_log_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from public.audit_logs al
      where al.id = p_audit_log_id
        and al.request_id is not null
        and private.user_notification_request_owner(al.request_table, al.request_id) = auth.uid()
    )
  end;
$$;

-- Audit-log -> user_notification materialization.
create or replace function private.create_user_notification_from_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner uuid;
begin
  if new.request_id is null then
    return new;
  end if;

  v_owner := private.user_notification_request_owner(new.request_table, new.request_id);
  if v_owner is null then
    return new;
  end if;

  insert into public.user_notification (
    audit_log_id,
    is_read,
    created_at
  )
  values (
    new.id,
    false,
    coalesce(new.changed_at, now())
  )
  on conflict (audit_log_id) do update
  set
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_notifications_from_audit_logs on public.audit_logs;
drop trigger if exists trg_user_notification_from_audit_logs on public.audit_logs;

create trigger trg_user_notification_from_audit_logs
after insert on public.audit_logs
for each row
execute function private.create_user_notification_from_audit_log();

-- Backfill for old audit log rows.
insert into public.user_notification (
  audit_log_id,
  is_read,
  created_at
)
select
  al.id,
  false,
  coalesce(al.changed_at, now())
from public.audit_logs al
where al.request_id is not null
  and private.user_notification_request_owner(al.request_table, al.request_id) is not null
on conflict (audit_log_id) do nothing;

alter table public.user_notification enable row level security;

drop policy if exists "Users can read own user_notification" on public.user_notification;
create policy "Users can read own user_notification"
  on public.user_notification
  for select
  to authenticated
  using (private.can_access_user_notification(audit_log_id));

drop policy if exists "Users can update own user_notification" on public.user_notification;
create policy "Users can update own user_notification"
  on public.user_notification
  for update
  to authenticated
  using (private.can_access_user_notification(audit_log_id))
  with check (private.can_access_user_notification(audit_log_id));

-- Latest notification per request, derived by joining audit_logs.
drop function if exists public.get_latest_notifications_for_user(uuid, integer);

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
set search_path = public, private
as $$
  with scoped as (
    select
      un.id,
      un.audit_log_id,
      al.request_id,
      al.request_table,
      al.action,
      al.old_status,
      al.new_status,
      un.is_read,
      coalesce(al.changed_at, un.created_at) as created_at
    from public.user_notification un
    join public.audit_logs al
      on al.id = un.audit_log_id
    where al.request_id is not null
      and private.user_notification_request_owner(al.request_table, al.request_id) = p_user_id
  ),
  latest as (
    select distinct on (s.request_id)
      s.id,
      s.audit_log_id,
      s.request_id,
      s.request_table,
      s.action,
      s.old_status,
      s.new_status,
      s.is_read,
      s.created_at
    from scoped s
    order by s.request_id, s.created_at desc
  )
  select
    l.id,
    l.audit_log_id,
    l.request_id,
    l.request_table,
    l.action,
    l.old_status,
    l.new_status,
    l.is_read,
    l.created_at
  from latest l
  order by l.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.get_latest_notifications_for_user(uuid, integer) to authenticated;
grant execute on function public.get_latest_notifications_for_user(uuid, integer) to service_role;

create or replace function public.mark_request_notifications_read(
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
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
  from public.audit_logs al
  where un.audit_log_id = al.id
    and al.request_id = p_request_id
    and private.user_notification_request_owner(al.request_table, al.request_id) = auth.uid()
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_request_notifications_read(uuid) to authenticated;

-- Remove old table alias if both exist after migration.
do $$
begin
  if to_regclass('public.notifications') is not null
     and to_regclass('public.user_notification') is not null then
    execute 'drop table public.notifications cascade';
  end if;
end
$$;

commit;
