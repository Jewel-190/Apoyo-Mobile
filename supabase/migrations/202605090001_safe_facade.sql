-- 202605090001_safe_facade.sql
--
-- Phase 2 of the modular refactor. Purely additive — does not change any
-- existing column, constraint, RLS policy, or function. Safe to apply at
-- any time; safe to roll back by running the DROP block at the bottom of
-- this file in psql.
--
-- Adds:
--   * Postgres enums that capture the de-facto string vocabularies the
--     app already uses (request_status, service_type_id,
--     attachment_file_type, attachment_status). Existing columns stay
--     `text` for now — Phase 10 may swap them.
--   * View `public.requests_v` — UNION ALL across the eight *_requests
--     tables, exposing only the shared skeleton columns plus a
--     `service_type` discriminator and the source `request_table` text.
--     Defaults to SECURITY INVOKER, so RLS on the underlying tables is
--     respected for every caller.
--   * Helper `public.is_superadmin(uid uuid)` that consults
--     `admins.role`.
--   * RPC `public.admin_request_op(op, service_type, request_id, patch)`
--     — SECURITY DEFINER, gated by is_superadmin(auth.uid()), dispatches
--     INSERT / UPDATE / DELETE / TRANSITION_STATUS to the correct
--     `*_requests` table and writes a corresponding `audit_logs` row.
--
-- Designed for the future superadmin "manipulate any request" UI but
-- usable by any cross-cutting admin tool today.

begin;

-- =====================================================================
-- 1. Enums
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type public.request_status as enum (
      'draft',
      'pending',
      'in progress',
      'action required',
      'resubmitted',
      'for approval',
      'scheduled',
      'case study',
      'approved'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'service_type_id') then
    create type public.service_type_id as enum (
      'hospital',
      'treatment',
      'operations',
      'emergency-finance',
      'burial-money',
      'burial-site',
      'cremation',
      'columbarium'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'attachment_file_type') then
    -- Mirrors the UI-side keys in shared/domain/fileTypes.ts. Keep in sync.
    create type public.attachment_file_type as enum (
      'letter',
      'voterId',
      'validId',
      'birthCert',
      'barangay',
      'indigency',
      'abstract',
      'bill',
      'medCert',
      'rx',
      'lab',
      'prescription',
      'quotation',
      'deathCert',
      'cremationCert',
      'attachment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'attachment_status') then
    create type public.attachment_status as enum (
      'pending',
      'in progress',
      'in_progress',
      'approved',
      'action_required',
      'resubmitted'
    );
  end if;
end$$;

-- =====================================================================
-- 2. is_superadmin helper
-- =====================================================================

create or replace function public.is_superadmin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select lower(coalesce(a.role, '')) = 'super_admin'
      from public.admins a
      where a.user_id = uid
      limit 1
    ),
    false
  );
$$;

revoke all on function public.is_superadmin(uuid) from public;
grant execute on function public.is_superadmin(uuid) to authenticated, service_role;

-- =====================================================================
-- 3. Unified read view: requests_v
-- =====================================================================
--
-- Exposes the shared skeleton across all eight *_requests tables. A
-- view is the right call here (vs a materialized view) because we want
-- live reads and we want RLS on the underlying tables to apply
-- automatically — SECURITY INVOKER is the default for views.

create or replace view public.requests_v as
  select
    'hospital'::text         as service_type,
    'hospitalization_requests'::text as request_table,
    r.id,
    r.user_id,
    r.service_id,
    r.status,
    r.request_code,
    r.submitted_at,
    r.case_study_date,
    r.additional_info,
    null::text               as financial_request_type,
    r.created_at,
    r.updated_at
  from public.hospitalization_requests r
  union all
  select
    'treatment',
    'treatment_requests',
    r.id, r.user_id, r.service_id, r.status, r.request_code,
    r.submitted_at, r.case_study_date, r.additional_info,
    null::text,
    r.created_at, r.updated_at
  from public.treatment_requests r
  union all
  select
    'operations',
    'medical_requests',
    r.id, r.user_id, r.service_id, r.status, r.request_code,
    r.submitted_at, r.case_study_date, r.additional_info,
    null::text,
    r.created_at, r.updated_at
  from public.medical_requests r
  union all
  select
    'emergency-finance',
    'financial_requests',
    r.id, r.user_id, r.service_id, r.status, r.request_code,
    r.submitted_at, r.case_study_date, r.additional_info,
    r.financial_request_type,
    r.created_at, r.updated_at
  from public.financial_requests r
  union all
  select
    'burial-money',
    'monetary_requests',
    r.id, r.user_id, r.service_id, r.status, r.request_code,
    r.submitted_at, r.case_study_date, r.additional_info,
    null::text,
    r.created_at, r.updated_at
  from public.monetary_requests r
  union all
  select
    'burial-site',
    'burial_requests',
    r.id, r.user_id, r.service_id, r.status, r.request_code,
    r.submitted_at, r.case_study_date, r.additional_info,
    null::text,
    r.created_at, r.updated_at
  from public.burial_requests r
  union all
  select
    'cremation',
    'cremation_requests',
    r.id, r.user_id, r.service_id, r.status, r.request_code,
    r.submitted_at, r.case_study_date, r.additional_info,
    null::text,
    r.created_at, r.updated_at
  from public.cremation_requests r
  union all
  select
    'columbarium',
    'columbarium_requests',
    r.id, r.user_id, r.service_id, r.status, r.request_code,
    r.submitted_at, r.case_study_date, r.additional_info,
    null::text,
    r.created_at, r.updated_at
  from public.columbarium_requests r;

comment on view public.requests_v is
  'Unified read shape across the eight *_requests tables. Backs cross-cutting admin/superadmin lists. SECURITY INVOKER — RLS on the underlying tables applies.';

grant select on public.requests_v to authenticated, anon, service_role;

-- =====================================================================
-- 4. admin_request_op(op, service_type, request_id, patch) RPC
-- =====================================================================
--
-- Single entry point for cross-cutting writes from the planned
-- superadmin "manipulate any request" UI. SECURITY DEFINER so it can
-- write to any *_requests table regardless of caller's per-table RLS,
-- BUT only if the caller is a super_admin (verified inside the function
-- against the live `admins` table).
--
-- Operations:
--   * 'insert'            — patch must include user_id + status.
--   * 'update'            — partial patch of the shared skeleton columns.
--   * 'delete'            — hard delete by request_id.
--   * 'transition_status' — patch must include {status, [reason]}.
--
-- Always writes a row to public.audit_logs.

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
  table_name text;
  audit_action text;
  old_status text;
  new_status text;
  result jsonb;
begin
  if caller_uid is null then
    raise exception 'admin_request_op requires authenticated caller'
      using errcode = '42501';
  end if;

  if not public.is_superadmin(caller_uid) then
    raise exception 'admin_request_op requires super_admin role'
      using errcode = '42501';
  end if;

  table_name := case lower(coalesce(service_type, ''))
    when 'hospital'           then 'hospitalization_requests'
    when 'hospitalization'    then 'hospitalization_requests'
    when 'treatment'          then 'treatment_requests'
    when 'operations'         then 'medical_requests'
    when 'medical'            then 'medical_requests'
    when 'emergency-finance'  then 'financial_requests'
    when 'financial'          then 'financial_requests'
    when 'burial-money'       then 'monetary_requests'
    when 'monetary'           then 'monetary_requests'
    when 'burial-site'        then 'burial_requests'
    when 'burial'             then 'burial_requests'
    when 'cremation'          then 'cremation_requests'
    when 'columbarium'        then 'columbarium_requests'
    when 'colombarium'        then 'columbarium_requests'
    else null
  end;

  if table_name is null then
    raise exception 'admin_request_op: unknown service_type %', service_type
      using errcode = '22023';
  end if;

  if op not in ('insert', 'update', 'delete', 'transition_status') then
    raise exception 'admin_request_op: unsupported op %', op
      using errcode = '22023';
  end if;

  -- Capture old status if the row exists.
  if op in ('update', 'delete', 'transition_status') and request_id is not null then
    execute format(
      'select status from public.%I where id = $1',
      table_name
    ) into old_status using request_id;
  end if;

  if op = 'insert' then
    audit_action := 'INSERT';
    new_status := coalesce(patch->>'status', 'pending');
    execute format(
      $sql$
        insert into public.%I (id, user_id, service_id, status, additional_info, financial_request_type, request_code, submitted_at, case_study_date)
        values (
          coalesce($1, gen_random_uuid()),
          ($2->>'user_id')::uuid,
          coalesce($2->>'service_id', $3),
          coalesce($2->>'status', 'pending'),
          $2->>'additional_info',
          $2->>'financial_request_type',
          $2->>'request_code',
          nullif($2->>'submitted_at','')::timestamptz,
          nullif($2->>'case_study_date','')::timestamptz
        )
        returning to_jsonb(public.%I.*)
      $sql$,
      table_name,
      table_name
    ) into result using request_id, patch, service_type;

  elsif op = 'update' or op = 'transition_status' then
    audit_action := case when op = 'transition_status' then 'STATUS_CHANGE' else 'UPDATE' end;
    new_status := coalesce(patch->>'status', old_status);
    execute format(
      $sql$
        update public.%I r
        set
          status            = coalesce($2->>'status',            r.status),
          additional_info   = coalesce($2->>'additional_info',   r.additional_info),
          submitted_at      = coalesce(nullif($2->>'submitted_at','')::timestamptz, r.submitted_at),
          case_study_date   = coalesce(nullif($2->>'case_study_date','')::timestamptz, r.case_study_date),
          request_code      = coalesce($2->>'request_code',      r.request_code),
          updated_at        = now()
        where r.id = $1
        returning to_jsonb(r.*)
      $sql$,
      table_name
    ) into result using request_id, patch;

    if result is null then
      raise exception 'admin_request_op: % not found in %', request_id, table_name
        using errcode = 'P0002';
    end if;

  elsif op = 'delete' then
    audit_action := 'DELETE';
    new_status := 'deleted';
    execute format(
      $sql$
        delete from public.%I
        where id = $1
        returning to_jsonb(public.%I.*)
      $sql$,
      table_name,
      table_name
    ) into result using request_id;

    if result is null then
      raise exception 'admin_request_op: % not found in %', request_id, table_name
        using errcode = 'P0002';
    end if;
  end if;

  -- Always audit. audit_logs has a CHECK that constrains valid event shapes.
  insert into public.audit_logs (
    action, request_table, request_id, old_status, new_status,
    changed_by, changed_by_role
  ) values (
    audit_action,
    table_name,
    request_id,
    old_status,
    new_status,
    caller_uid,
    'super_admin'
  );

  return jsonb_build_object(
    'op',           op,
    'table',        table_name,
    'request_id',   request_id,
    'old_status',   old_status,
    'new_status',   new_status,
    'row',          result
  );
end;
$$;

revoke all on function public.admin_request_op(text, text, uuid, jsonb) from public;
grant execute on function public.admin_request_op(text, text, uuid, jsonb)
  to authenticated, service_role;

comment on function public.admin_request_op(text, text, uuid, jsonb) is
  'Cross-cutting write API for the eight *_requests tables. SECURITY DEFINER, gated by is_superadmin(auth.uid()). Always writes audit_logs.';

commit;

-- =====================================================================
-- Rollback (run manually if needed)
-- =====================================================================
-- begin;
--   drop function if exists public.admin_request_op(text, text, uuid, jsonb);
--   drop view if exists public.requests_v;
--   drop function if exists public.is_superadmin(uuid);
--   drop type if exists public.attachment_status;
--   drop type if exists public.attachment_file_type;
--   drop type if exists public.service_type_id;
--   drop type if exists public.request_status;
-- commit;
