-- Make audit_logs status-change focused for all 8 service request tables.
-- Keeps backend-only trigger auditing and actor attribution.

begin;

alter table public.audit_logs
  add column if not exists old_status text,
  add column if not exists new_status text;

-- Backfill status transitions from legacy snapshots before removing them.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and column_name = 'old_data'
  ) then
    update public.audit_logs
    set old_status = coalesce(old_status, nullif(old_data ->> 'status', '')),
        new_status = coalesce(new_status, nullif(new_data ->> 'status', ''));

    update public.audit_logs
    set request_id = case
      when request_id is not null then request_id
      when coalesce(new_data ->> 'id', old_data ->> 'id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (coalesce(new_data ->> 'id', old_data ->> 'id'))::uuid
      else null
    end
    where request_id is null;
  end if;
end
$$;

-- Keep only true status transitions.
delete from public.audit_logs
where action = 'DELETE'
   or request_id is null
   or new_status is null
   or old_status is not distinct from new_status;

-- Remove old full-row snapshots as requested.
alter table public.audit_logs
  drop column if exists old_data,
  drop column if exists new_data;

-- Tighten table constraints to status-transition semantics.
alter table public.audit_logs
  alter column request_id set not null;

alter table public.audit_logs
  drop constraint if exists audit_logs_single_action_request_id_chk;

alter table public.audit_logs
  drop constraint if exists audit_logs_action_request_id_chk;

alter table public.audit_logs
  add constraint audit_logs_action_request_id_chk
  check (
    action in ('INSERT', 'UPDATE')
    and request_id is not null
  );

alter table public.audit_logs
  drop constraint if exists audit_logs_status_change_chk;

alter table public.audit_logs
  add constraint audit_logs_status_change_chk
  check (
    new_status is not null
    and old_status is distinct from new_status
  );

-- Rework integrity enforcement trigger for strict request references.
create or replace function private.enforce_audit_log_request_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.request_id is null then
    raise exception 'request_id cannot be null for status log entries';
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

-- Backend-only trigger function: log only status changes.
create or replace function public.log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_table text;
  v_request_id uuid;
  v_old_status text;
  v_new_status text;
  v_changed_by uuid;
  v_claim_sub text;
  v_changed_by_role text;
begin
  if TG_TABLE_NAME = any (
    array[
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    ]
  ) then
    v_request_table := TG_TABLE_NAME;
  else
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  v_changed_by_role := current_user;
  v_claim_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  if v_claim_sub is null then
    begin
      v_claim_sub := nullif(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
        ''
      );
    exception
      when others then
        v_claim_sub := null;
    end;
  end if;

  if v_claim_sub is not null
     and v_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_changed_by := v_claim_sub::uuid;
  else
    v_changed_by := null;
  end if;

  if TG_OP = 'INSERT' then
    v_request_id := NEW.id;
    v_old_status := null;
    v_new_status := nullif(NEW.status, '');

    if v_new_status is null then
      return NEW;
    end if;

    insert into public.audit_logs (
      request_table,
      request_id,
      action,
      old_status,
      new_status,
      changed_by,
      changed_by_role,
      changed_at
    )
    values (
      v_request_table,
      v_request_id,
      'INSERT',
      v_old_status,
      v_new_status,
      v_changed_by,
      v_changed_by_role,
      now()
    );

    return NEW;
  elsif TG_OP = 'UPDATE' then
    v_request_id := NEW.id;
    v_old_status := nullif(OLD.status, '');
    v_new_status := nullif(NEW.status, '');

    if v_old_status is not distinct from v_new_status then
      return NEW;
    end if;

    if v_new_status is null then
      return NEW;
    end if;

    insert into public.audit_logs (
      request_table,
      request_id,
      action,
      old_status,
      new_status,
      changed_by,
      changed_by_role,
      changed_at
    )
    values (
      v_request_table,
      v_request_id,
      'UPDATE',
      v_old_status,
      v_new_status,
      v_changed_by,
      v_changed_by_role,
      now()
    );

    return NEW;
  elsif TG_OP = 'DELETE' then
    -- Status log only: deletion is not a status transition.
    return OLD;
  end if;

  return null;
exception
  when others then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
end;
$$;

drop index if exists idx_audit_logs_action;

create index if not exists idx_audit_logs_status_transition
  on public.audit_logs (request_table, request_id, changed_at desc);

create index if not exists idx_audit_logs_new_status
  on public.audit_logs (new_status, changed_at desc);

commit;
