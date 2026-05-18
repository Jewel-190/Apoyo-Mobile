-- Notification system driven by audit_logs.
-- Each inserted audit_logs row is materialized into public.notifications.

begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  audit_log_id uuid not null unique references public.audit_logs(id) on delete cascade,
  request_table text not null check (
    request_table in (
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    )
  ),
  request_id uuid not null,
  "admin" uuid references auth.users(id) on update restrict on delete set null,
  "user" uuid not null references auth.users(id) on update restrict on delete cascade,
  is_read boolean not null default false,
  title text not null,
  body text not null,
  old_status text,
  new_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications ("user", created_at desc);

create index if not exists notifications_user_is_read_idx
  on public.notifications ("user", is_read, created_at desc);

create index if not exists notifications_request_idx
  on public.notifications (request_table, request_id, created_at desc);

create or replace function public.update_notifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at
before update on public.notifications
for each row
execute function public.update_notifications_updated_at();

create or replace function private.notification_request_owner(
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

create or replace function private.notification_service_label(
  p_request_table text
)
returns text
language sql
immutable
as $$
  select case p_request_table
    when 'hospitalization_requests' then 'Hospitalization'
    when 'treatment_requests' then 'Treatment'
    when 'medical_requests' then 'Medical Operations'
    when 'financial_requests' then 'Financial Relief'
    when 'monetary_requests' then 'Monetary Burial Aid'
    when 'burial_requests' then 'Burial Site Assistance'
    when 'cremation_requests' then 'Cremation Assistance'
    when 'columbarium_requests' then 'Columbarium Allocation'
    else 'Assistance'
  end;
$$;

create or replace function private.notification_status_label(
  p_status text
)
returns text
language sql
immutable
as $$
  select initcap(replace(coalesce(nullif(trim(p_status), ''), 'unknown'), '_', ' '));
$$;

create or replace function private.notification_title(
  p_request_table text,
  p_action text
)
returns text
language sql
immutable
as $$
  select case upper(coalesce(p_action, 'UPDATE'))
    when 'INSERT' then private.notification_service_label(p_request_table) || ' Request Submitted'
    when 'DELETE' then private.notification_service_label(p_request_table) || ' Request Deleted'
    else private.notification_service_label(p_request_table) || ' Request Updated'
  end;
$$;

create or replace function private.notification_body(
  p_request_table text,
  p_action text,
  p_old_status text,
  p_new_status text
)
returns text
language sql
immutable
as $$
  select case upper(coalesce(p_action, 'UPDATE'))
    when 'INSERT' then
      format(
        '%s request is now %s.',
        private.notification_service_label(p_request_table),
        private.notification_status_label(p_new_status)
      )
    when 'DELETE' then
      format('%s request has been deleted.', private.notification_service_label(p_request_table))
    else
      format(
        '%s request status changed from %s to %s.',
        private.notification_service_label(p_request_table),
        private.notification_status_label(p_old_status),
        private.notification_status_label(p_new_status)
      )
  end;
$$;

create or replace function private.create_notification_from_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_request_user uuid;
  v_request_admin uuid;
begin
  if new.request_id is null then
    return new;
  end if;

  v_request_user := private.notification_request_owner(new.request_table, new.request_id);

  if v_request_user is null then
    return new;
  end if;

  -- Current best effort: treat actor as admin when actor differs from request owner.
  v_request_admin := case
    when new.changed_by is not null and new.changed_by is distinct from v_request_user then new.changed_by
    else null
  end;

  insert into public.notifications (
    audit_log_id,
    request_table,
    request_id,
    "admin",
    "user",
    is_read,
    title,
    body,
    old_status,
    new_status,
    created_at
  )
  values (
    new.id,
    new.request_table,
    new.request_id,
    v_request_admin,
    v_request_user,
    false,
    private.notification_title(new.request_table, new.action),
    private.notification_body(new.request_table, new.action, new.old_status, new.new_status),
    new.old_status,
    new.new_status,
    coalesce(new.changed_at, now())
  )
  on conflict (audit_log_id) do update
  set
    request_table = excluded.request_table,
    request_id = excluded.request_id,
    "admin" = excluded."admin",
    "user" = excluded."user",
    title = excluded.title,
    body = excluded.body,
    old_status = excluded.old_status,
    new_status = excluded.new_status,
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_notifications_from_audit_logs on public.audit_logs;
create trigger trg_notifications_from_audit_logs
after insert on public.audit_logs
for each row
execute function private.create_notification_from_audit_log();

insert into public.notifications (
  audit_log_id,
  request_table,
  request_id,
  "admin",
  "user",
  is_read,
  title,
  body,
  old_status,
  new_status,
  created_at
)
select
  al.id,
  al.request_table,
  al.request_id,
  case
    when al.changed_by is not null and al.changed_by is distinct from req_owner.request_user then al.changed_by
    else null
  end as admin_user,
  req_owner.request_user,
  false,
  private.notification_title(al.request_table, al.action),
  private.notification_body(al.request_table, al.action, al.old_status, al.new_status),
  al.old_status,
  al.new_status,
  coalesce(al.changed_at, now())
from public.audit_logs al
cross join lateral (
  select private.notification_request_owner(al.request_table, al.request_id) as request_user
) req_owner
where al.request_id is not null
  and req_owner.request_user is not null
on conflict (audit_log_id) do nothing;

alter table public.notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
  on public.notifications
  for select
  to authenticated
  using ("user" = auth.uid());

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications
  for update
  to authenticated
  using ("user" = auth.uid())
  with check ("user" = auth.uid());

-- Remote may already define this RPC with a different OUT row type; replace requires drop first.
drop function if exists public.get_latest_notifications_for_user(uuid, integer);

create or replace function public.get_latest_notifications_for_user(
  p_user_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  request_id uuid,
  request_table text,
  "admin" uuid,
  "user" uuid,
  is_read boolean,
  title text,
  body text,
  old_status text,
  new_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (n.request_id)
      n.id,
      n.request_id,
      n.request_table,
      n."admin",
      n."user",
      n.is_read,
      n.title,
      n.body,
      n.old_status,
      n.new_status,
      n.created_at
    from public.notifications n
    where n."user" = p_user_id
    order by n.request_id, n.created_at desc
  )
  select
    l.id,
    l.request_id,
    l.request_table,
    l."admin",
    l."user",
    l.is_read,
    l.title,
    l.body,
    l.old_status,
    l.new_status,
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
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.notifications n
  set
    is_read = true,
    updated_at = now()
  where n.request_id = p_request_id
    and n."user" = auth.uid()
    and n.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_request_notifications_read(uuid) to authenticated;

commit;
