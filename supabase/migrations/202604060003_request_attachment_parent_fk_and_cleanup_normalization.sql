begin;

-- Remove legacy per-request cleanup triggers that still reference old bucket names/legacy *_file_path columns.
-- Centralized cleanup now flows from request_attachments trigger + unified request-documents mapping.
drop trigger if exists trg_cleanup_hospitalization on public.hospitalization_requests;
drop trigger if exists trg_cleanup_treatment on public.treatment_requests;
drop trigger if exists trg_cleanup_medical on public.medical_requests;
drop trigger if exists trg_cleanup_financial on public.financial_requests;
drop trigger if exists trg_cleanup_monetary on public.monetary_requests;
drop trigger if exists trg_cleanup_burial on public.burial_requests;
drop trigger if exists trg_cleanup_cremation on public.cremation_requests;
drop trigger if exists trg_cleanup_columbarium on public.columbarium_requests;

-- One request_uid column cannot have native FK references to multiple parent tables.
-- Enforce equivalent FK integrity via table-aware parent existence checks.
create or replace function private.request_attachment_parent_exists(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case p_request_table
    when 'hospitalization_requests' then exists (select 1 from public.hospitalization_requests r where r.id = p_request_uid)
    when 'treatment_requests' then exists (select 1 from public.treatment_requests r where r.id = p_request_uid)
    when 'medical_requests' then exists (select 1 from public.medical_requests r where r.id = p_request_uid)
    when 'financial_requests' then exists (select 1 from public.financial_requests r where r.id = p_request_uid)
    when 'monetary_requests' then exists (select 1 from public.monetary_requests r where r.id = p_request_uid)
    when 'burial_requests' then exists (select 1 from public.burial_requests r where r.id = p_request_uid)
    when 'cremation_requests' then exists (select 1 from public.cremation_requests r where r.id = p_request_uid)
    when 'columbarium_requests' then exists (select 1 from public.columbarium_requests r where r.id = p_request_uid)
    else false
  end;
$$;

create or replace function private.enforce_request_attachment_parent_fk()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.request_uid is null then
    raise foreign_key_violation using
      message = 'request_attachments.request_uid cannot be null';
  end if;

  if not private.request_attachment_parent_exists(new.request_table, new.request_uid) then
    raise foreign_key_violation using
      message = 'insert or update on table "request_attachments" violates parent request reference',
      detail = format('No row in %I with id = %s', new.request_table, new.request_uid),
      hint = 'Ensure request_table and request_uid point to an existing request row.';
  end if;

  return new;
end;
$$;

-- Validate existing rows before enabling trigger enforcement.
do $$
declare
  invalid_count bigint;
begin
  select count(*)
  into invalid_count
  from public.request_attachments ra
  where not private.request_attachment_parent_exists(ra.request_table, ra.request_uid);

  if invalid_count > 0 then
    raise exception 'request_attachments contains % invalid parent reference(s); clean data before enabling parent FK enforcement', invalid_count;
  end if;
end;
$$;

drop trigger if exists trg_enforce_request_attachment_parent_fk on public.request_attachments;
create trigger trg_enforce_request_attachment_parent_fk
before insert or update of request_table, request_uid
on public.request_attachments
for each row
execute function private.enforce_request_attachment_parent_fk();

commit;
