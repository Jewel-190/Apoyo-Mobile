-- Fix empty audit logs and enforce status-change event logging semantics.
-- Root fix: restore changed_by_role column and remove silent trigger failures.

begin;

alter table public.audit_logs
  add column if not exists changed_by_role text,
  add column if not exists old_status text,
  add column if not exists new_status text;

-- If legacy rows exist, normalize status values where possible.
update public.audit_logs
set old_status = nullif(old_status, ''),
    new_status = nullif(new_status, '');

-- Remove legacy/conflicting checks before applying stricter event semantics.
alter table public.audit_logs
  drop constraint if exists audit_logs_action_request_id_chk;

alter table public.audit_logs
  drop constraint if exists audit_logs_single_action_check;

alter table public.audit_logs
  drop constraint if exists audit_logs_status_change_chk;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in ('INSERT', 'UPDATE', 'DELETE'));

alter table public.audit_logs
  add constraint audit_logs_event_shape_chk
  check (
    (
      action = 'INSERT'
      and request_id is not null
      and new_status is not null
    )
    or (
      action = 'UPDATE'
      and request_id is not null
      and new_status is not null
      and old_status is distinct from new_status
    )
    or (
      action = 'DELETE'
      and request_id is not null
      and old_status is not null
      and new_status = 'deleted'
    )
  );

-- Actor FK: changed_by should reference authenticated actor (user or admin account).
alter table public.audit_logs
  drop constraint if exists audit_logs_changed_by_fkey;

alter table public.audit_logs
  add constraint audit_logs_changed_by_fkey
  foreign key (changed_by)
  references auth.users(id)
  on update restrict
  on delete set null
  not valid;

alter table public.audit_logs
  validate constraint audit_logs_changed_by_fkey;

-- Keep single-table FK-equivalent request reference checks.
create or replace function private.enforce_audit_log_request_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.request_id is null then
    raise exception 'request_id cannot be null for audit log entries';
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

-- Recreate enforcement trigger idempotently.
drop trigger if exists trg_enforce_audit_log_request_reference on public.audit_logs;
create trigger trg_enforce_audit_log_request_reference
before insert or update of request_table, request_id, action
on public.audit_logs
for each row
execute function private.enforce_audit_log_request_reference();

-- Backend-only logging function for all 8 service tables:
-- - INSERT logs creation status
-- - UPDATE logs only status transitions
-- - DELETE logs deletion event with old status -> deleted
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
    v_request_id := OLD.id;
    v_old_status := coalesce(nullif(OLD.status, ''), 'unknown');
    v_new_status := 'deleted';

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
      'DELETE',
      v_old_status,
      v_new_status,
      v_changed_by,
      v_changed_by_role,
      now()
    );

    return OLD;
  end if;

  return null;
end;
$$;

-- Rebind service triggers so DELETE is logged before row removal.
drop trigger if exists trg_audit_hospitalization_requests_changes on public.hospitalization_requests;
drop trigger if exists trg_audit_hospitalization_requests_changes_ins_upd on public.hospitalization_requests;
drop trigger if exists trg_audit_hospitalization_requests_changes_del on public.hospitalization_requests;
create trigger trg_audit_hospitalization_requests_changes_ins_upd
after insert or update on public.hospitalization_requests
for each row execute function public.log_changes();
create trigger trg_audit_hospitalization_requests_changes_del
before delete on public.hospitalization_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_treatment_requests_changes on public.treatment_requests;
drop trigger if exists trg_audit_treatment_requests_changes_ins_upd on public.treatment_requests;
drop trigger if exists trg_audit_treatment_requests_changes_del on public.treatment_requests;
create trigger trg_audit_treatment_requests_changes_ins_upd
after insert or update on public.treatment_requests
for each row execute function public.log_changes();
create trigger trg_audit_treatment_requests_changes_del
before delete on public.treatment_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_medical_requests_changes on public.medical_requests;
drop trigger if exists trg_audit_medical_requests_changes_ins_upd on public.medical_requests;
drop trigger if exists trg_audit_medical_requests_changes_del on public.medical_requests;
create trigger trg_audit_medical_requests_changes_ins_upd
after insert or update on public.medical_requests
for each row execute function public.log_changes();
create trigger trg_audit_medical_requests_changes_del
before delete on public.medical_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_financial_requests_changes on public.financial_requests;
drop trigger if exists trg_audit_financial_requests_changes_ins_upd on public.financial_requests;
drop trigger if exists trg_audit_financial_requests_changes_del on public.financial_requests;
create trigger trg_audit_financial_requests_changes_ins_upd
after insert or update on public.financial_requests
for each row execute function public.log_changes();
create trigger trg_audit_financial_requests_changes_del
before delete on public.financial_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_monetary_requests_changes on public.monetary_requests;
drop trigger if exists trg_audit_monetary_requests_changes_ins_upd on public.monetary_requests;
drop trigger if exists trg_audit_monetary_requests_changes_del on public.monetary_requests;
create trigger trg_audit_monetary_requests_changes_ins_upd
after insert or update on public.monetary_requests
for each row execute function public.log_changes();
create trigger trg_audit_monetary_requests_changes_del
before delete on public.monetary_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_burial_requests_changes on public.burial_requests;
drop trigger if exists trg_audit_burial_requests_changes_ins_upd on public.burial_requests;
drop trigger if exists trg_audit_burial_requests_changes_del on public.burial_requests;
create trigger trg_audit_burial_requests_changes_ins_upd
after insert or update on public.burial_requests
for each row execute function public.log_changes();
create trigger trg_audit_burial_requests_changes_del
before delete on public.burial_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_cremation_requests_changes on public.cremation_requests;
drop trigger if exists trg_audit_cremation_requests_changes_ins_upd on public.cremation_requests;
drop trigger if exists trg_audit_cremation_requests_changes_del on public.cremation_requests;
create trigger trg_audit_cremation_requests_changes_ins_upd
after insert or update on public.cremation_requests
for each row execute function public.log_changes();
create trigger trg_audit_cremation_requests_changes_del
before delete on public.cremation_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_columbarium_requests_changes on public.columbarium_requests;
drop trigger if exists trg_audit_columbarium_requests_changes_ins_upd on public.columbarium_requests;
drop trigger if exists trg_audit_columbarium_requests_changes_del on public.columbarium_requests;
create trigger trg_audit_columbarium_requests_changes_ins_upd
after insert or update on public.columbarium_requests
for each row execute function public.log_changes();
create trigger trg_audit_columbarium_requests_changes_del
before delete on public.columbarium_requests
for each row execute function public.log_changes();

create index if not exists idx_audit_logs_actor_time
  on public.audit_logs (changed_by, changed_at desc);

commit;
