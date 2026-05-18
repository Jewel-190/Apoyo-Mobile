-- `legacy_service_id` duplicated `service_key`; keep a single canonical column.
-- Recreate `admin_request_op` insert so it does not reference the dropped column.
-- `patch->>'service_id'` (when non-empty) still overrides the RPC `service_type` arg for `service_key`.

begin;

create or replace function public.admin_request_op(
  op text,
  service_type text,
  request_id uuid,
  patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_uid uuid := auth.uid();
  audit_action text;
  old_status text;
  new_status text;
  result jsonb;
  v_request_table text := 'assistance_requests';
  effective_request_id uuid;
  v_service_key text;
begin
  if caller_uid is null then
    raise exception 'admin_request_op requires authenticated caller'
      using errcode = '42501';
  end if;

  if not public.is_superadmin(caller_uid) then
    raise exception 'admin_request_op requires super_admin role'
      using errcode = '42501';
  end if;

  if op not in ('insert', 'update', 'delete', 'transition_status') then
    raise exception 'admin_request_op: unsupported op %', op
      using errcode = '22023';
  end if;

  if op in ('update', 'delete', 'transition_status') and request_id is not null then
    select r.status into old_status
    from public.assistance_requests r
    where r.id = request_id;
  end if;

  if op = 'insert' then
    audit_action := 'INSERT';
    v_service_key := nullif(trim(coalesce(patch->>'service_id', '')), '');
    if v_service_key is null then
      v_service_key := service_type;
    end if;

    insert into public.assistance_requests (
      id, user_id, service_key, status, additional_info,
      financial_request_type, request_code, submitted_at, case_study_date, payload
    )
    values (
      coalesce(request_id, gen_random_uuid()),
      (patch->>'user_id')::uuid,
      v_service_key,
      coalesce(patch->>'status', 'pending'),
      patch->>'additional_info',
      patch->>'financial_request_type',
      patch->>'request_code',
      nullif(patch->>'submitted_at', '')::timestamptz,
      nullif(patch->>'case_study_date', '')::timestamptz,
      coalesce(patch->'payload', '{}'::jsonb)
    )
    returning to_jsonb(public.assistance_requests.*) into result;

    new_status := coalesce(patch->>'status', 'pending');
    effective_request_id := coalesce(request_id, (result->>'id')::uuid);

  elsif op = 'update' or op = 'transition_status' then
    audit_action := case when op = 'transition_status' then 'STATUS_CHANGE' else 'UPDATE' end;
    update public.assistance_requests r
    set
      status = coalesce(patch->>'status', r.status),
      additional_info = coalesce(patch->>'additional_info', r.additional_info),
      financial_request_type = coalesce(patch->>'financial_request_type', r.financial_request_type),
      submitted_at = coalesce(nullif(patch->>'submitted_at', '')::timestamptz, r.submitted_at),
      case_study_date = coalesce(nullif(patch->>'case_study_date', '')::timestamptz, r.case_study_date),
      request_code = coalesce(patch->>'request_code', r.request_code),
      payload = coalesce(patch->'payload', r.payload),
      updated_at = now()
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    if result is null then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    new_status := coalesce(patch->>'status', old_status);
    effective_request_id := request_id;

  elsif op = 'delete' then
    audit_action := 'DELETE';
    delete from public.assistance_requests r
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    if result is null then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    new_status := 'deleted';
    effective_request_id := request_id;
  end if;

  insert into public.audit_logs (
    action, request_table, request_id, old_status, new_status,
    changed_by, changed_by_role
  )
  values (
    audit_action,
    v_request_table,
    effective_request_id,
    old_status,
    new_status,
    caller_uid,
    'super_admin'
  );

  return jsonb_build_object(
    'op', op,
    'table', v_request_table,
    'request_id', effective_request_id,
    'old_status', old_status,
    'new_status', new_status,
    'row', result
  );
end;
$$;

comment on function public.admin_request_op(text, text, uuid, jsonb) is
  'Superadmin writes against public.assistance_requests only. Always writes audit_logs.';

alter table public.assistance_requests
  drop column if exists legacy_service_id;

commit;
