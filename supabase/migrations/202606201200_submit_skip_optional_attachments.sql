-- Submit: honor assistance_requirements.required=false and optional attachment slot keys.

begin;

set search_path = public, private;

create or replace function private.is_optional_attachment_requirement(
  p_slot_key text,
  p_required boolean
)
returns boolean
language sql
immutable
as $$
  select coalesce(p_required, true) = false
    or lower(trim(coalesce(p_slot_key, ''))) in (
      'attachment',
      'attachments',
      'additional_attachment',
      'additionalattachment'
    );
$$;

create or replace function public.submit_assistance_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_service_id uuid;
  v_user_id uuid;
  v_missing text[];
  v_code_token text;
begin
  select r.service_id, r.user_id
    into v_service_id, v_user_id
  from public.assistance_requests r
  where r.id = p_request_id;

  if v_service_id is null then
    raise exception 'request_not_found';
  end if;

  if v_user_id <> auth.uid() and not public.is_superadmin(auth.uid()) then
    raise exception 'not_allowed';
  end if;

  select coalesce(
    nullif(trim(s.request_code_token), ''),
    lower(replace(s.id::text, '-', ''))
  )
    into v_code_token
  from public.assistance_services s
  where s.id = v_service_id;

  select array_agg(req.slot_key order by req.sort_order)
    into v_missing
  from public.assistance_services s
  join public.assistance_requirements req on req.service_id = s.id
  where s.id = v_service_id
    and not private.is_optional_attachment_requirement(req.slot_key, req.required)
    and not exists (
      select 1
      from public.request_attachments a
      where a.assistance_request_id = p_request_id
        and a.file_type in (
          coalesce(
            nullif(trim(s.attachment_slot_map ->> req.slot_key), ''),
            req.slot_key
          ),
          req.slot_key
        )
        and nullif(trim(a.path), '') is not null
    );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'missing_required_attachments: %', array_to_string(v_missing, ',');
  end if;

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
  'Pending when required slots are uploaded; skips optional slots and attachment/attachments aliases.';

commit;
