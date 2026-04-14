begin;

-- Fix upload-time permission error: authenticated users must not need direct access
-- to schema private when request_attachments triggers run.
create or replace function private.request_attachment_parent_exists(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
security definer
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
security definer
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

commit;
