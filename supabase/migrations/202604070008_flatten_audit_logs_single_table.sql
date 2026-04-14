-- Flatten audit logs into a single non-partitioned table.
-- Keeps backend trigger logging and normalized request_table/request_id shape.

begin;

create table if not exists public.audit_logs_single (
  id uuid primary key default gen_random_uuid(),
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
  request_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_by_role text,
  changed_at timestamptz not null default now(),
  constraint audit_logs_single_action_request_id_chk check (
    (action in ('INSERT', 'UPDATE') and request_id is not null)
    or (action = 'DELETE')
  )
);

insert into public.audit_logs_single (
  id,
  request_table,
  request_id,
  action,
  old_data,
  new_data,
  changed_by,
  changed_by_role,
  changed_at
)
select
  s.id,
  s.request_table,
  s.resolved_request_id,
  s.action,
  s.old_data,
  s.new_data,
  s.changed_by,
  s.changed_by_role,
  s.changed_at
from (
  select
    al.id,
    al.request_table,
    case
      when al.request_id is not null then al.request_id
      when coalesce(al.new_data ->> 'id', al.old_data ->> 'id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (coalesce(al.new_data ->> 'id', al.old_data ->> 'id'))::uuid
      else null
    end as resolved_request_id,
    al.action,
    al.old_data,
    al.new_data,
    al.changed_by,
    al.changed_by_role,
    al.changed_at
  from public.audit_logs al
) s
where (
  s.action = 'DELETE'
  or s.resolved_request_id is not null
)
on conflict (id) do nothing;

alter table public.audit_logs rename to audit_logs_partitioned_legacy;
alter table public.audit_logs_single rename to audit_logs;

drop table if exists public.audit_logs_partitioned_legacy cascade;

create index if not exists idx_audit_logs_request_table_request_id
  on public.audit_logs (request_table, request_id);

create index if not exists idx_audit_logs_changed_at_desc
  on public.audit_logs (changed_at desc);

create index if not exists idx_audit_logs_action
  on public.audit_logs (action);

-- Single-table reference integrity (FK-equivalent) for request_table/request_id.
create or replace function private.audit_log_request_exists(
  p_request_table text,
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_request_table
    when 'hospitalization_requests' then exists (select 1 from public.hospitalization_requests r where r.id = p_request_id)
    when 'treatment_requests' then exists (select 1 from public.treatment_requests r where r.id = p_request_id)
    when 'medical_requests' then exists (select 1 from public.medical_requests r where r.id = p_request_id)
    when 'financial_requests' then exists (select 1 from public.financial_requests r where r.id = p_request_id)
    when 'monetary_requests' then exists (select 1 from public.monetary_requests r where r.id = p_request_id)
    when 'burial_requests' then exists (select 1 from public.burial_requests r where r.id = p_request_id)
    when 'cremation_requests' then exists (select 1 from public.cremation_requests r where r.id = p_request_id)
    when 'columbarium_requests' then exists (select 1 from public.columbarium_requests r where r.id = p_request_id)
    else false
  end;
$$;

create or replace function private.enforce_audit_log_request_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.request_id is null then
    if new.action in ('INSERT', 'UPDATE') then
      raise exception 'request_id cannot be null for % action', new.action;
    end if;
    return new;
  end if;

  if not private.audit_log_request_exists(new.request_table, new.request_id) then
    raise foreign_key_violation using
      message = 'audit_logs request reference does not exist',
      detail = format('No row in %I with id = %s', new.request_table, new.request_id),
      hint = 'request_table/request_id must point to an existing request row.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_audit_log_request_reference on public.audit_logs;
create trigger trg_enforce_audit_log_request_reference
before insert or update of request_table, request_id, action
on public.audit_logs
for each row
execute function private.enforce_audit_log_request_reference();

commit;
