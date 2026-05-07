begin;

create table if not exists public.request_attachments (
  uid uuid primary key default gen_random_uuid(),
  request_uid uuid not null,
  request_table text not null,
  file_type text not null,
  path text not null,
  status text not null default 'pending',
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  constraint request_attachments_request_table_chk check (
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
  constraint request_attachments_status_chk check (
    status in ('pending', 'approved', 'action_required')
  ),
  constraint request_attachments_path_chk check (btrim(path) <> '')
);

create unique index if not exists request_attachments_request_scope_uq
  on public.request_attachments (request_table, request_uid, file_type);

create index if not exists request_attachments_request_lookup_idx
  on public.request_attachments (request_table, request_uid);

create index if not exists request_attachments_status_idx
  on public.request_attachments (status);

create index if not exists request_attachments_path_idx
  on public.request_attachments (path);

create or replace function public.update_request_attachments_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated := now();
  return new;
end;
$$;

drop trigger if exists request_attachments_updated on public.request_attachments;
create trigger request_attachments_updated
before update on public.request_attachments
for each row
execute function public.update_request_attachments_updated();

create or replace function public.can_access_request_attachment(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when auth.uid() is null then false

    when p_request_table = 'hospitalization_requests' then exists (
      select 1
      from public.hospitalization_requests r
      where r.id = p_request_uid
        and (
          r.user_id = auth.uid()
          or (public.is_medical_admin() and r.status <> 'draft')
        )
    )

    when p_request_table = 'treatment_requests' then exists (
      select 1
      from public.treatment_requests r
      where r.id = p_request_uid
        and (
          r.user_id = auth.uid()
          or (public.is_medical_admin() and r.status <> 'draft')
        )
    )

    when p_request_table = 'medical_requests' then exists (
      select 1
      from public.medical_requests r
      where r.id = p_request_uid
        and (
          r.user_id = auth.uid()
          or (public.is_medical_admin() and r.status <> 'draft')
        )
    )

    when p_request_table = 'financial_requests' then exists (
      select 1
      from public.financial_requests r
      where r.id = p_request_uid
        and r.user_id = auth.uid()
    )

    when p_request_table = 'monetary_requests' then exists (
      select 1
      from public.monetary_requests r
      where r.id = p_request_uid
        and r.user_id = auth.uid()
    )

    when p_request_table = 'burial_requests' then exists (
      select 1
      from public.burial_requests r
      where r.id = p_request_uid
        and r.user_id = auth.uid()
    )

    when p_request_table = 'cremation_requests' then exists (
      select 1
      from public.cremation_requests r
      where r.id = p_request_uid
        and r.user_id = auth.uid()
    )

    when p_request_table = 'columbarium_requests' then exists (
      select 1
      from public.columbarium_requests r
      where r.id = p_request_uid
        and r.user_id = auth.uid()
    )

    else false
  end;
$$;

alter table public.request_attachments enable row level security;

drop policy if exists "Users can manage their own request attachments" on public.request_attachments;
create policy "Users can manage their own request attachments"
  on public.request_attachments
  for all
  to authenticated
  using (public.can_access_request_attachment(request_table, request_uid))
  with check (public.can_access_request_attachment(request_table, request_uid));

create or replace function private.bucket_for_request_table(p_request_table text)
returns text
language sql
immutable
as $$
  select case p_request_table
    when 'hospitalization_requests' then 'hospitalization-documents'
    when 'treatment_requests' then 'treatment-documents'
    when 'medical_requests' then 'medical-documents'
    when 'financial_requests' then 'financial-documents'
    when 'monetary_requests' then 'monetary-documents'
    when 'burial_requests' then 'burial-documents'
    when 'cremation_requests' then 'cremation-documents'
    when 'columbarium_requests' then 'columbarium-documents'
    else null
  end;
$$;

create or replace function private.dispatch_request_attachment_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  bucket_name text;
  endpoint text;
  hook_secret text;
  old_path text;
  new_path text;
  req_id bigint;
  rowid text;
begin
  bucket_name := private.bucket_for_request_table(coalesce(old.request_table, new.request_table));
  if bucket_name is null then
    return coalesce(new, old);
  end if;

  old_path := private.extract_storage_path(old.path);

  if tg_op = 'DELETE' then
    if old_path is null then
      return old;
    end if;
  elsif tg_op = 'UPDATE' then
    new_path := private.extract_storage_path(new.path);
    if old_path is null or old_path is not distinct from new_path then
      return new;
    end if;
  else
    return coalesce(new, old);
  end if;

  select value into endpoint
  from private.storage_cleanup_config
  where key = 'function_url'
  limit 1;

  select value into hook_secret
  from private.storage_cleanup_config
  where key = 'hook_secret'
  limit 1;

  if endpoint is null or hook_secret is null then
    raise exception 'Missing storage cleanup config. Set function_url and hook_secret in private.storage_cleanup_config';
  end if;

  rowid := coalesce(old.uid::text, new.uid::text);

  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', hook_secret
    ),
    body := jsonb_build_object(
      'bucket', bucket_name,
      'paths', jsonb_build_array(old_path),
      'table', tg_table_name,
      'op', tg_op,
      'row_id', rowid
    )
  ) into req_id;

  insert into private.storage_cleanup_dispatch_log(table_name, op, row_id, bucket, paths, request_id)
  values (tg_table_name, tg_op, rowid, bucket_name, jsonb_build_array(old_path), req_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_cleanup_request_attachments on public.request_attachments;
create trigger trg_cleanup_request_attachments
after update or delete on public.request_attachments
for each row
execute function private.dispatch_request_attachment_cleanup();

insert into public.request_attachments (request_uid, request_table, file_type, path, status, created, updated)
select
  src.request_uid,
  src.request_table,
  src.file_type,
  src.path,
  'pending'::text,
  coalesce(src.created_at, now()),
  coalesce(src.updated_at, now())
from (
  select id as request_uid, 'hospitalization_requests'::text as request_table, 'abstract'::text as file_type, private.extract_storage_path(abstract_file_path) as path, created_at, updated_at from public.hospitalization_requests
  union all
  select id, 'hospitalization_requests', 'bill', private.extract_storage_path(bill_file_path), created_at, updated_at from public.hospitalization_requests
  union all
  select id, 'hospitalization_requests', 'letter', private.extract_storage_path(letter_file_path), created_at, updated_at from public.hospitalization_requests
  union all
  select id, 'hospitalization_requests', 'voterId', private.extract_storage_path(voter_id_file_path), created_at, updated_at from public.hospitalization_requests
  union all
  select id, 'hospitalization_requests', 'birthCert', private.extract_storage_path(birth_cert_file_path), created_at, updated_at from public.hospitalization_requests
  union all
  select id, 'hospitalization_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.hospitalization_requests
  union all
  select id, 'hospitalization_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.hospitalization_requests
  union all
  select id, 'hospitalization_requests', 'attachment', private.extract_storage_path(attachment_file_path), created_at, updated_at from public.hospitalization_requests

  union all
  select id, 'treatment_requests', 'medCert', private.extract_storage_path(med_cert_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'rx', private.extract_storage_path(rx_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'lab', private.extract_storage_path(lab_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'letter', private.extract_storage_path(letter_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'voterId', private.extract_storage_path(voter_id_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'birthCert', private.extract_storage_path(birth_cert_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.treatment_requests
  union all
  select id, 'treatment_requests', 'attachment', private.extract_storage_path(attachment_file_path), created_at, updated_at from public.treatment_requests

  union all
  select id, 'medical_requests', 'medCert', private.extract_storage_path(med_cert_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'prescription', private.extract_storage_path(prescription_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'quotation', private.extract_storage_path(quotation_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'letter', private.extract_storage_path(letter_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'voterId', private.extract_storage_path(voter_id_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'birthCert', private.extract_storage_path(birth_cert_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.medical_requests
  union all
  select id, 'medical_requests', 'attachment', private.extract_storage_path(attachment_file_path), created_at, updated_at from public.medical_requests

  union all
  select id, 'financial_requests', 'letter', private.extract_storage_path(letter_file_path), created_at, updated_at from public.financial_requests
  union all
  select id, 'financial_requests', 'voterId', private.extract_storage_path(voter_id_file_path), created_at, updated_at from public.financial_requests
  union all
  select id, 'financial_requests', 'validId', private.extract_storage_path(valid_id_file_path), created_at, updated_at from public.financial_requests
  union all
  select id, 'financial_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.financial_requests
  union all
  select id, 'financial_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.financial_requests
  union all
  select id, 'financial_requests', 'attachment', private.extract_storage_path(attachment_file_path), created_at, updated_at from public.financial_requests

  union all
  select id, 'monetary_requests', 'letter', private.extract_storage_path(letter_file_path), created_at, updated_at from public.monetary_requests
  union all
  select id, 'monetary_requests', 'voterId', private.extract_storage_path(voters_id_or_cert_file_path), created_at, updated_at from public.monetary_requests
  union all
  select id, 'monetary_requests', 'birthCert', private.extract_storage_path(valid_id_or_birth_cert_file_path), created_at, updated_at from public.monetary_requests
  union all
  select id, 'monetary_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.monetary_requests
  union all
  select id, 'monetary_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.monetary_requests
  union all
  select id, 'monetary_requests', 'attachment', private.extract_storage_path(additional_attachment_file_path), created_at, updated_at from public.monetary_requests

  union all
  select id, 'burial_requests', 'deathCert', private.extract_storage_path(death_cert_file_path), created_at, updated_at from public.burial_requests
  union all
  select id, 'burial_requests', 'validId', private.extract_storage_path(valid_id_file_path), created_at, updated_at from public.burial_requests
  union all
  select id, 'burial_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.burial_requests
  union all
  select id, 'burial_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.burial_requests
  union all
  select id, 'burial_requests', 'attachment', private.extract_storage_path(attachment_file_path), created_at, updated_at from public.burial_requests

  union all
  select id, 'cremation_requests', 'deathCert', private.extract_storage_path(death_cert_file_path), created_at, updated_at from public.cremation_requests
  union all
  select id, 'cremation_requests', 'validId', private.extract_storage_path(valid_id_file_path), created_at, updated_at from public.cremation_requests
  union all
  select id, 'cremation_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.cremation_requests
  union all
  select id, 'cremation_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.cremation_requests
  union all
  select id, 'cremation_requests', 'attachment', private.extract_storage_path(attachment_file_path), created_at, updated_at from public.cremation_requests

  union all
  select id, 'columbarium_requests', 'deathCert', private.extract_storage_path(death_cert_file_path), created_at, updated_at from public.columbarium_requests
  union all
  select id, 'columbarium_requests', 'validId', private.extract_storage_path(valid_id_file_path), created_at, updated_at from public.columbarium_requests
  union all
  select id, 'columbarium_requests', 'cremationCert', private.extract_storage_path(cremation_cert_file_path), created_at, updated_at from public.columbarium_requests
  union all
  select id, 'columbarium_requests', 'barangay', private.extract_storage_path(barangay_endorsement_file_path), created_at, updated_at from public.columbarium_requests
  union all
  select id, 'columbarium_requests', 'indigency', private.extract_storage_path(indigency_cert_file_path), created_at, updated_at from public.columbarium_requests
  union all
  select id, 'columbarium_requests', 'attachment', private.extract_storage_path(attachment_file_path), created_at, updated_at from public.columbarium_requests
) src
where src.path is not null
  and btrim(src.path) <> ''
on conflict (request_table, request_uid, file_type)
do update
set path = excluded.path,
    updated = excluded.updated;

commit;
