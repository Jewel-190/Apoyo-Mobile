-- Backfill human-readable codes for unified rows submitted before submit RPC assigned them.

begin;

set search_path = public;

update public.assistance_requests r
set request_code = public.generate_request_code_for_service(
  case lower(trim(r.service_key))
    when 'hospital' then 'hospitalizationreq'
    when 'treatment' then 'treatmentreq'
    when 'operations' then 'medicalreq'
    when 'emergency-finance' then 'financialreq'
    when 'burial-money' then 'monetaryreq'
    when 'burial-site' then 'burialreq'
    when 'cremation' then 'cremationreq'
    when 'columbarium' then 'columbariumreq'
    else lower(trim(r.service_key))
  end,
  coalesce(r.submitted_at, r.updated_at, now())
)
where r.request_code is null
  and r.submitted_at is not null
  and nullif(trim(r.service_key), '') is not null
  and lower(coalesce(r.status, '')) <> 'draft';

commit;
