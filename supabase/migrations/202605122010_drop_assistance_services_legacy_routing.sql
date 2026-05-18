-- Drop per-line routing columns from `assistance_services`. Slot → DB column mapping
-- lives only in `attachment_slot_map` (CMS). Submit RPC no longer uses `request_table` fallbacks.

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
  'Marks pending when required attachments exist; resolves file_type from '
  'assistance_services.attachment_slot_map (or requirement slot_key).';

alter table public.assistance_services
  drop constraint if exists assistance_services_request_table_chk;

alter table public.assistance_services
  drop column if exists request_table,
  drop column if exists service_key_aliases;

commit;
