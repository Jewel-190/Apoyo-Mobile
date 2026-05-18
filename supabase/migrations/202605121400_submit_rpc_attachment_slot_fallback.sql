-- Client merges empty `attachment_slot_map` with per-`request_table` fallbacks
-- (see AppCore/CatalogLookupRuntime). RPC must use the same resolution or
-- required slots (e.g. barangay → barangay_endorsement_file) never match.

begin;

set search_path = public;

create or replace function public.submit_assistance_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_key text;
  v_user_id uuid;
  v_missing text[];
  /* Mirrors ATTACHMENT_SLOT_FALLBACK_BY_REQUEST_TABLE in CatalogLookupRuntime.ts */
  v_slot_fallback constant jsonb :=
    '{
      "hospitalization_requests": {
        "abstract": "abstract_file",
        "bill": "bill_file",
        "letter": "letter_file",
        "voterId": "voter_id_file",
        "birthCert": "birth_cert_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "attachment_file"
      },
      "treatment_requests": {
        "medCert": "med_cert_file",
        "rx": "rx_file",
        "lab": "lab_file",
        "letter": "letter_file",
        "voterId": "voter_id_file",
        "birthCert": "birth_cert_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "attachment_file"
      },
      "medical_requests": {
        "medCert": "med_cert_file",
        "prescription": "prescription_file",
        "quotation": "quotation_file",
        "letter": "letter_file",
        "voterId": "voter_id_file",
        "birthCert": "birth_cert_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "attachment_file"
      },
      "financial_requests": {
        "letter": "letter_file",
        "voterId": "voter_id_file",
        "validId": "valid_id_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "attachment_file"
      },
      "monetary_requests": {
        "letter": "letter_file",
        "voterId": "voters_id_or_cert_file",
        "birthCert": "valid_id_or_birth_cert_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "additional_attachment_file"
      },
      "burial_requests": {
        "deathCert": "death_cert_file",
        "validId": "valid_id_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "attachment_file"
      },
      "cremation_requests": {
        "deathCert": "death_cert_file",
        "validId": "valid_id_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "attachment_file"
      },
      "columbarium_requests": {
        "deathCert": "death_cert_file",
        "validId": "valid_id_file",
        "cremationCert": "cremation_cert_file",
        "barangay": "barangay_endorsement_file",
        "indigency": "indigency_cert_file",
        "attachment": "attachment_file"
      }
    }'::jsonb;
begin
  select r.service_key, r.user_id
    into v_service_key, v_user_id
  from public.assistance_requests r
  where r.id = p_request_id;

  if v_service_key is null then
    raise exception 'request_not_found';
  end if;

  if v_user_id <> auth.uid() and not public.is_superadmin(auth.uid()) then
    raise exception 'not_allowed';
  end if;

  select array_agg(req.slot_key order by req.sort_order)
    into v_missing
  from public.assistance_services s
  join public.assistance_requirements req
    on req.service_id = s.id
  where s.service_key = v_service_key
    and coalesce(req.required, true) = true
    and not exists (
      select 1
      from public.request_attachments a
      where a.request_table = 'assistance_requests'
        and a.assistance_request_id = p_request_id
        and a.file_type = coalesce(
          nullif(trim(s.attachment_slot_map ->> req.slot_key), ''),
          nullif(trim(v_slot_fallback -> s.request_table ->> req.slot_key), ''),
          req.slot_key
        )
        and nullif(trim(a.path), '') is not null
    );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'missing_required_attachments: %', array_to_string(v_missing, ',');
  end if;

  update public.assistance_requests
  set status = 'pending',
      submitted_at = now()
  where id = p_request_id;
end;
$$;

comment on function public.submit_assistance_request(uuid) is
  'Marks pending when required attachments exist; resolves file_type from '
  'assistance_services.attachment_slot_map, then legacy request_table slot fallbacks '
  '(must match mobile CatalogLookupRuntime.ATTACHMENT_SLOT_FALLBACK_BY_REQUEST_TABLE).';

commit;
