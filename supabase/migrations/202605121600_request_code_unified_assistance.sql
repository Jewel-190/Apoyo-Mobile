-- Human-readable request codes for unified `assistance_requests`.
-- 1) Ensures sequences + generator RPCs exist (were only in supabase/sql/request-code-system.sql).
-- 2) Replaces invalid `CASE ... WHEN a, b` in generate_request_code_for_service with IF/ELSIF.
-- 3) Assigns request_code inside submit_assistance_request (legacy *_requests triggers never fire here).

begin;

set search_path = public;

-- Sequences (idempotent)
create sequence if not exists public.hospitalization_request_code_seq;
create sequence if not exists public.treatment_request_code_seq;
create sequence if not exists public.medical_request_code_seq;
create sequence if not exists public.financial_request_code_seq;
create sequence if not exists public.monetary_request_code_seq;
create sequence if not exists public.burial_request_code_seq;
create sequence if not exists public.cremation_request_code_seq;
create sequence if not exists public.columbarium_request_code_seq;

-- Shared formatter: PREFIX-MMyy-000001
create or replace function public.format_request_code(
  p_code text,
  p_ts timestamptz,
  p_seq bigint
)
returns text
language sql
immutable
as $$
  select upper(coalesce(p_code, ''))
         || '-' || to_char(p_ts, 'MMYY')
         || '-' || lpad(p_seq::text, 6, '0');
$$;

create or replace function public.generate_hospitalization_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.hospitalization_request_code_seq');
  return public.format_request_code('HOSP', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_treatment_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.treatment_request_code_seq');
  return public.format_request_code('TREAT', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_medical_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.medical_request_code_seq');
  return public.format_request_code('MED', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_financial_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.financial_request_code_seq');
  return public.format_request_code('FIN', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_monetary_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.monetary_request_code_seq');
  return public.format_request_code('MON', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_burial_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.burial_request_code_seq');
  return public.format_request_code('BUR', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_cremation_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.cremation_request_code_seq');
  return public.format_request_code('CREM', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_columbarium_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.columbarium_request_code_seq');
  return public.format_request_code('COLU', coalesce(p_ts, now()), v_seq);
end;
$$;

-- Edge function + callers: valid PL/pgSQL (simple CASE cannot list multiple WHEN values).
create or replace function public.generate_request_code_for_service(
  p_service text,
  p_timestamp timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service text := lower(trim(coalesce(p_service, '')));
begin
  if v_service in (
    'hospitalizationreq',
    'hospitalization',
    'hosp',
    'hospital',
    'hospitalization_requests'
  ) then
    return public.generate_hospitalization_request_code(p_timestamp);
  elsif v_service in (
    'treatmentreq',
    'treatment',
    'treat',
    'treatment_requests'
  ) then
    return public.generate_treatment_request_code(p_timestamp);
  elsif v_service in (
    'medicalreq',
    'medical',
    'med',
    'operations',
    'medical_requests'
  ) then
    return public.generate_medical_request_code(p_timestamp);
  elsif v_service in (
    'financialreq',
    'financial',
    'fin',
    'emergency-finance',
    'financial_requests'
  ) then
    return public.generate_financial_request_code(p_timestamp);
  elsif v_service in (
    'monetaryreq',
    'monetary',
    'mon',
    'burial-money',
    'monetary_requests'
  ) then
    return public.generate_monetary_request_code(p_timestamp);
  elsif v_service in (
    'burialreq',
    'burial',
    'bur',
    'burial-site',
    'burial_requests'
  ) then
    return public.generate_burial_request_code(p_timestamp);
  elsif v_service in (
    'cremationreq',
    'cremation',
    'crem',
    'cremation_requests'
  ) then
    return public.generate_cremation_request_code(p_timestamp);
  elsif v_service in (
    'columbariumreq',
    'columbarium',
    'colombarium',
    'colu',
    'columbarium_requests'
  ) then
    return public.generate_columbarium_request_code(p_timestamp);
  else
    raise exception 'Unsupported service type: %', p_service using errcode = '22023';
  end if;
end;
$$;

grant execute on function public.generate_request_code_for_service(text, timestamptz) to service_role;
grant execute on function public.generate_request_code_for_service(text, timestamptz) to authenticated;

create unique index if not exists assistance_requests_request_code_uq
  on public.assistance_requests (request_code)
  where request_code is not null;

-- Submit: same attachment checks as 202605121400 + assign request_code when first submitting.
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
  v_code_token text;
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

  v_code_token := case lower(trim(v_service_key))
    when 'hospital' then 'hospitalizationreq'
    when 'treatment' then 'treatmentreq'
    when 'operations' then 'medicalreq'
    when 'emergency-finance' then 'financialreq'
    when 'burial-money' then 'monetaryreq'
    when 'burial-site' then 'burialreq'
    when 'cremation' then 'cremationreq'
    when 'columbarium' then 'columbariumreq'
    else lower(trim(v_service_key))
  end;

  update public.assistance_requests r
  set
    status = 'pending',
    submitted_at = now(),
    request_code = coalesce(
      r.request_code,
      public.generate_request_code_for_service(v_code_token, now())
    )
  where r.id = p_request_id;
end;
$$;

comment on function public.submit_assistance_request(uuid) is
  'Sets pending + submitted_at + request_code when attachments satisfied; '
  'file_type resolution uses attachment_slot_map + legacy slot fallbacks.';

comment on function public.generate_request_code_for_service(text, timestamptz) is
  'Returns a new human-readable code for the service token (edge + DB submit).';

commit;
