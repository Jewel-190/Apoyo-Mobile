-- submit_assistance_request compared request_attachments.file_type (DB column
-- names, e.g. letter_file) to assistance_requirements.slot_key (UI keys, e.g.
-- letter). Align checks with assistance_services.attachment_slot_map.

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

  update public.assistance_requests
  set status = 'pending',
      submitted_at = now()
  where id = p_request_id;
end;
$$;

comment on function public.submit_assistance_request(uuid) is
  'Marks a request as pending only if all required request_attachments exist; '
  'file_type is matched via assistance_services.attachment_slot_map (slot_key → column name).';

commit;
