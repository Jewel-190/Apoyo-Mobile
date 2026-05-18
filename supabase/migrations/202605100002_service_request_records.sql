-- 202605100002_service_request_records.sql
-- Unified denormalized mirror of all eight *_requests tables for modular reads
-- (MODULAR_PLATFORM_PLAN). Does NOT replace legacy tables; mobile/admin keep using them.
-- Attachments remain keyed by request_attachments.request_table + request_uid (legacy).

begin;

set search_path = public;

create table if not exists public.service_request_records (
  id uuid primary key default gen_random_uuid(),
  legacy_request_table text not null check (
    legacy_request_table in (
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
  legacy_request_id uuid not null,
  service_key text not null references public.assistance_services (service_key),
  user_id uuid not null,
  legacy_service_id text,
  status text,
  request_code text,
  submitted_at timestamptz,
  case_study_date timestamptz,
  additional_info text,
  financial_request_type text,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (legacy_request_table, legacy_request_id)
);

create index if not exists service_request_records_user_id_idx
  on public.service_request_records (user_id);
create index if not exists service_request_records_service_key_idx
  on public.service_request_records (service_key);
create index if not exists service_request_records_status_idx
  on public.service_request_records (status);

comment on table public.service_request_records is
  'Denormalized snapshot of rows from the eight *_requests tables. Populated by migration backfill; '
  'optional incremental sync can be added later. Join attachments via legacy_request_table + legacy_request_id.';

alter table public.service_request_records enable row level security;

grant select on public.service_request_records to authenticated;

drop policy if exists service_request_records_select on public.service_request_records;
create policy service_request_records_select on public.service_request_records
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.is_superadmin(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Backfill / upsert (idempotent)
-- ---------------------------------------------------------------------------

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'hospitalization_requests',
  r.id,
  'hospital',
  r.user_id,
  coalesce(r.service_id::text, 'hospital'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  r.created_at,
  r.updated_at
from public.hospitalization_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'treatment_requests',
  r.id,
  'treatment',
  r.user_id,
  coalesce(r.service_id::text, 'treatment'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  r.created_at,
  r.updated_at
from public.treatment_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'medical_requests',
  r.id,
  'operations',
  r.user_id,
  coalesce(r.service_id::text, 'operations'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  r.created_at,
  r.updated_at
from public.medical_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'financial_requests',
  r.id,
  'emergency-finance',
  r.user_id,
  coalesce(r.service_id::text, 'emergency-finance'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  r.financial_request_type::text,
  r.created_at,
  r.updated_at
from public.financial_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'monetary_requests',
  r.id,
  'burial-money',
  r.user_id,
  coalesce(r.service_id::text, 'burial-money'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  r.created_at,
  r.updated_at
from public.monetary_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'burial_requests',
  r.id,
  'burial-site',
  r.user_id,
  coalesce(r.service_id::text, 'burial-site'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  r.created_at,
  r.updated_at
from public.burial_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'cremation_requests',
  r.id,
  'cremation',
  r.user_id,
  coalesce(r.service_id::text, 'cremation'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  r.created_at,
  r.updated_at
from public.cremation_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

insert into public.service_request_records (
  legacy_request_table,
  legacy_request_id,
  service_key,
  user_id,
  legacy_service_id,
  status,
  request_code,
  submitted_at,
  case_study_date,
  additional_info,
  financial_request_type,
  legacy_created_at,
  legacy_updated_at
)
select
  'columbarium_requests',
  r.id,
  'columbarium',
  r.user_id,
  coalesce(r.service_id::text, 'columbarium'),
  r.status::text,
  r.request_code::text,
  r.submitted_at,
  r.case_study_date,
  r.additional_info::text,
  null::text,
  r.created_at,
  r.updated_at
from public.columbarium_requests r
on conflict (legacy_request_table, legacy_request_id) do update set
  service_key = excluded.service_key,
  user_id = excluded.user_id,
  legacy_service_id = excluded.legacy_service_id,
  status = excluded.status,
  request_code = excluded.request_code,
  submitted_at = excluded.submitted_at,
  case_study_date = excluded.case_study_date,
  additional_info = excluded.additional_info,
  financial_request_type = excluded.financial_request_type,
  legacy_created_at = excluded.legacy_created_at,
  legacy_updated_at = excluded.legacy_updated_at,
  synced_at = now();

commit;
