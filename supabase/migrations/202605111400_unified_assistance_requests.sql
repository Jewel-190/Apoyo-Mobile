-- Unified request storage: single `assistance_requests` table replaces the eight `*_requests`
-- tables. Apply together with app release that reads/writes `assistance_requests` only.
--
-- Preserves existing row UUIDs so `request_attachments.request_uid` stays aligned.
begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Primary table
-- ---------------------------------------------------------------------------

create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_key text not null references public.assistance_services (service_key) on update cascade,
  legacy_service_id text,
  status text not null default 'draft',
  request_code text,
  submitted_at timestamptz,
  case_study_date timestamptz,
  additional_info text,
  financial_request_type text,
  payload jsonb not null default '{}'::jsonb,
  payload_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistance_requests_user_updated_idx
  on public.assistance_requests (user_id, updated_at desc);

create index assistance_requests_service_status_idx
  on public.assistance_requests (service_key, status);

alter table public.assistance_requests enable row level security;

drop policy if exists assistance_requests_owner_all on public.assistance_requests;
create policy assistance_requests_owner_all on public.assistance_requests
  for all to authenticated
  using (auth.uid() = user_id or public.is_superadmin (auth.uid()))
  with check (auth.uid() = user_id or public.is_superadmin (auth.uid()));

grant select, insert, update, delete on public.assistance_requests to authenticated;
grant all on public.assistance_requests to service_role;

comment on table public.assistance_requests is
  'Canonical per-user assistance applications; supersedes eight *_requests legacy tables.';

-- ---------------------------------------------------------------------------
-- 2. Backfill (IDs preserved)
-- ---------------------------------------------------------------------------

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'hospital',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.hospitalization_requests r;

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'treatment',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.treatment_requests r;

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'operations',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.medical_requests r;

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'emergency-finance',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  r.financial_request_type::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.financial_requests r;

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'burial-money',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.monetary_requests r;

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'burial-site',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.burial_requests r;

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'cremation',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.cremation_requests r;

insert into public.assistance_requests (
  id, user_id, service_key, legacy_service_id, status, request_code,
  submitted_at, case_study_date, additional_info, financial_request_type,
  payload, created_at, updated_at
)
select
  r.id,
  r.user_id,
  'columbarium',
  r.service_id::text,
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  '{}'::jsonb,
  r.created_at,
  r.updated_at
from public.columbarium_requests r;

-- ---------------------------------------------------------------------------
-- 3. Attachments → FK to unified row
-- ---------------------------------------------------------------------------

alter table public.request_attachments
  add column if not exists assistance_request_id uuid;

update public.request_attachments ra
set assistance_request_id = ra.request_uid::uuid
where ra.assistance_request_id is null;

do $$
declare
  orphan_count bigint;
begin
  select count(*) into orphan_count
  from public.request_attachments ra
  where not exists (
    select 1 from public.assistance_requests ar where ar.id = ra.request_uid::uuid
  );
  if orphan_count > 0 then
    raise exception 'request_attachments has % orphan rows vs assistance_requests', orphan_count;
  end if;
end;
$$;

alter table public.request_attachments
  alter column assistance_request_id set not null;

alter table public.request_attachments
  drop constraint if exists request_attachments_assistance_request_id_fkey;

alter table public.request_attachments
  add constraint request_attachments_assistance_request_id_fkey
  foreign key (assistance_request_id) references public.assistance_requests (id) on delete cascade;

create unique index if not exists request_attachments_assistance_file_uidx
  on public.request_attachments (assistance_request_id, file_type);

create or replace function private.request_attachment_parent_exists(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.assistance_requests r where r.id = p_request_uid
  );
$$;

drop trigger if exists trg_enforce_request_attachment_parent_fk on public.request_attachments;

create trigger trg_enforce_request_attachment_parent_fk
before insert or update of request_table, request_uid, assistance_request_id
on public.request_attachments
for each row
execute function private.enforce_request_attachment_parent_fk();

-- ---------------------------------------------------------------------------
-- 4. Unified read view
-- ---------------------------------------------------------------------------

create or replace view public.requests_v as
select
  r.service_key as service_type,
  s.request_table::text as request_table,
  r.id,
  r.user_id,
  coalesce(r.legacy_service_id, r.service_key) as service_id,
  r.status,
  r.request_code,
  r.submitted_at,
  r.case_study_date,
  r.additional_info,
  r.financial_request_type,
  r.created_at,
  r.updated_at
from public.assistance_requests r
join public.assistance_services s on s.service_key = r.service_key;

comment on view public.requests_v is
  'Unified request rows (single assistance_requests source). Joins catalog for legacy request_table discriminator.';

grant select on public.requests_v to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 5. Audit + notification helpers (existence / owner by UUID only)
-- ---------------------------------------------------------------------------

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
  select exists (
    select 1 from public.assistance_requests r where r.id = p_request_id
  );
$$;

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
  select r.user_id
  from public.assistance_requests r
  where r.id = p_request_id;
$$;

-- ---------------------------------------------------------------------------
-- 6. Audit logger: only assistance_requests
-- ---------------------------------------------------------------------------

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
  if TG_TABLE_NAME is distinct from 'assistance_requests' then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  v_request_table := 'assistance_requests';
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
      request_table, request_id, action, old_status, new_status,
      changed_by, changed_by_role, changed_at
    )
    values (
      v_request_table, v_request_id, 'INSERT', v_old_status, v_new_status,
      v_changed_by, v_changed_by_role, now()
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
      request_table, request_id, action, old_status, new_status,
      changed_by, changed_by_role, changed_at
    )
    values (
      v_request_table, v_request_id, 'UPDATE', v_old_status, v_new_status,
      v_changed_by, v_changed_by_role, now()
    );
    return NEW;

  elsif TG_OP = 'DELETE' then
    v_request_id := OLD.id;
    v_old_status := coalesce(nullif(OLD.status, ''), 'unknown');
    v_new_status := 'deleted';
    insert into public.audit_logs (
      request_table, request_id, action, old_status, new_status,
      changed_by, changed_by_role, changed_at
    )
    values (
      v_request_table, v_request_id, 'DELETE', v_old_status, v_new_status,
      v_changed_by, v_changed_by_role, now()
    );
    return OLD;
  end if;

  return null;
end;
$$;

-- Drop legacy audit triggers on eight tables
drop trigger if exists trg_audit_hospitalization_requests_changes_ins_upd on public.hospitalization_requests;
drop trigger if exists trg_audit_hospitalization_requests_changes_del on public.hospitalization_requests;
drop trigger if exists trg_audit_treatment_requests_changes_ins_upd on public.treatment_requests;
drop trigger if exists trg_audit_treatment_requests_changes_del on public.treatment_requests;
drop trigger if exists trg_audit_medical_requests_changes_ins_upd on public.medical_requests;
drop trigger if exists trg_audit_medical_requests_changes_del on public.medical_requests;
drop trigger if exists trg_audit_financial_requests_changes_ins_upd on public.financial_requests;
drop trigger if exists trg_audit_financial_requests_changes_del on public.financial_requests;
drop trigger if exists trg_audit_monetary_requests_changes_ins_upd on public.monetary_requests;
drop trigger if exists trg_audit_monetary_requests_changes_del on public.monetary_requests;
drop trigger if exists trg_audit_burial_requests_changes_ins_upd on public.burial_requests;
drop trigger if exists trg_audit_burial_requests_changes_del on public.burial_requests;
drop trigger if exists trg_audit_cremation_requests_changes_ins_upd on public.cremation_requests;
drop trigger if exists trg_audit_cremation_requests_changes_del on public.cremation_requests;
drop trigger if exists trg_audit_columbarium_requests_changes_ins_upd on public.columbarium_requests;
drop trigger if exists trg_audit_columbarium_requests_changes_del on public.columbarium_requests;

-- Attachments cleanup triggers on legacy parents (replaced by ON DELETE CASCADE)
drop trigger if exists trg_delete_attachments_on_hospitalization_request_delete on public.hospitalization_requests;
drop trigger if exists trg_delete_attachments_on_treatment_request_delete on public.treatment_requests;
drop trigger if exists trg_delete_attachments_on_medical_request_delete on public.medical_requests;
drop trigger if exists trg_delete_attachments_on_financial_request_delete on public.financial_requests;
drop trigger if exists trg_delete_attachments_on_monetary_request_delete on public.monetary_requests;
drop trigger if exists trg_delete_attachments_on_burial_request_delete on public.burial_requests;
drop trigger if exists trg_delete_attachments_on_cremation_request_delete on public.cremation_requests;
drop trigger if exists trg_delete_attachments_on_columbarium_request_delete on public.columbarium_requests;

drop trigger if exists trg_audit_assistance_requests_ins_upd on public.assistance_requests;
drop trigger if exists trg_audit_assistance_requests_del on public.assistance_requests;
create trigger trg_audit_assistance_requests_ins_upd
after insert or update on public.assistance_requests
for each row execute function public.log_changes();
create trigger trg_audit_assistance_requests_del
before delete on public.assistance_requests
for each row execute function public.log_changes();

-- ---------------------------------------------------------------------------
-- 7. Superadmin RPC → unified table
-- ---------------------------------------------------------------------------

create or replace function public.admin_request_op(
  op text,
  service_type text,
  request_id uuid,
  patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_uid uuid := auth.uid();
  audit_action text;
  old_status text;
  new_status text;
  result jsonb;
  v_request_table text := 'assistance_requests';
  effective_request_id uuid;
begin
  if caller_uid is null then
    raise exception 'admin_request_op requires authenticated caller'
      using errcode = '42501';
  end if;

  if not public.is_superadmin(caller_uid) then
    raise exception 'admin_request_op requires super_admin role'
      using errcode = '42501';
  end if;

  if op not in ('insert', 'update', 'delete', 'transition_status') then
    raise exception 'admin_request_op: unsupported op %', op
      using errcode = '22023';
  end if;

  if op in ('update', 'delete', 'transition_status') and request_id is not null then
    select r.status into old_status
    from public.assistance_requests r
    where r.id = request_id;
  end if;

  if op = 'insert' then
    audit_action := 'INSERT';
    insert into public.assistance_requests (
      id, user_id, service_key, legacy_service_id, status, additional_info,
      financial_request_type, request_code, submitted_at, case_study_date, payload
    )
    values (
      coalesce(request_id, gen_random_uuid()),
      (patch->>'user_id')::uuid,
      service_type,
      coalesce(patch->>'service_id', service_type),
      coalesce(patch->>'status', 'pending'),
      patch->>'additional_info',
      patch->>'financial_request_type',
      patch->>'request_code',
      nullif(patch->>'submitted_at', '')::timestamptz,
      nullif(patch->>'case_study_date', '')::timestamptz,
      coalesce(patch->'payload', '{}'::jsonb)
    )
    returning to_jsonb(public.assistance_requests.*) into result;

    new_status := coalesce(patch->>'status', 'pending');
    effective_request_id := coalesce(request_id, (result->>'id')::uuid);

  elsif op = 'update' or op = 'transition_status' then
    audit_action := case when op = 'transition_status' then 'STATUS_CHANGE' else 'UPDATE' end;
    update public.assistance_requests r
    set
      status = coalesce(patch->>'status', r.status),
      additional_info = coalesce(patch->>'additional_info', r.additional_info),
      financial_request_type = coalesce(patch->>'financial_request_type', r.financial_request_type),
      submitted_at = coalesce(nullif(patch->>'submitted_at', '')::timestamptz, r.submitted_at),
      case_study_date = coalesce(nullif(patch->>'case_study_date', '')::timestamptz, r.case_study_date),
      request_code = coalesce(patch->>'request_code', r.request_code),
      payload = coalesce(patch->'payload', r.payload),
      updated_at = now()
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    if result is null then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    new_status := coalesce(patch->>'status', old_status);
    effective_request_id := request_id;

  elsif op = 'delete' then
    audit_action := 'DELETE';
    delete from public.assistance_requests r
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    if result is null then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    new_status := 'deleted';
    effective_request_id := request_id;
  end if;

  insert into public.audit_logs (
    action, request_table, request_id, old_status, new_status,
    changed_by, changed_by_role
  )
  values (
    audit_action,
    v_request_table,
    effective_request_id,
    old_status,
    new_status,
    caller_uid,
    'super_admin'
  );

  return jsonb_build_object(
    'op', op,
    'table', v_request_table,
    'request_id', effective_request_id,
    'old_status', old_status,
    'new_status', new_status,
    'row', result
  );
end;
$$;

comment on function public.admin_request_op(text, text, uuid, jsonb) is
  'Superadmin writes against public.assistance_requests only. Always writes audit_logs.';

-- ---------------------------------------------------------------------------
-- 8. Drop mirror + legacy physical tables (attachments FK cascade cleans rows)
-- ---------------------------------------------------------------------------

drop table if exists public.service_request_records cascade;

drop table if exists public.hospitalization_requests cascade;
drop table if exists public.treatment_requests cascade;
drop table if exists public.medical_requests cascade;
drop table if exists public.financial_requests cascade;
drop table if exists public.monetary_requests cascade;
drop table if exists public.burial_requests cascade;
drop table if exists public.cremation_requests cascade;
drop table if exists public.columbarium_requests cascade;

commit;
