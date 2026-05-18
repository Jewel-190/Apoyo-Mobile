-- Fix draft delete / unified audits: allow request_table = 'assistance_requests' on audit_logs,
-- and repair admin_request_op (audit row before delete; valid action for transitions).

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1) audit_logs.request_table CHECK (legacy name: audit_logs_single_request_table_check)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'audit_logs'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%request_table%'
  loop
    execute format('alter table public.audit_logs drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.audit_logs
  add constraint audit_logs_request_table_chk check (
    request_table in (
      'assistance_requests',
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) admin_request_op: audit before delete; transition uses action UPDATE
-- ---------------------------------------------------------------------------

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
  v_audit_done boolean := false;
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
    insert into public.assistance_requests (
      id, user_id, service_key, legacy_service_id, status, additional_info,
      financial_request_type, request_code, submitted_at, case_study_date, payload
    )
    values (
      coalesce(request_id, gen_random_uuid()),
      (patch->>'user_id')::uuid,
      service_type,
      coalesce(patch->>'service_id', service_type),
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
    audit_action := 'UPDATE';
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
    effective_request_id := request_id;

    if not exists (select 1 from public.assistance_requests r where r.id = request_id) then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    insert into public.audit_logs (
      action, request_table, request_id, old_status, new_status,
      changed_by, changed_by_role
    )
    values (
      'DELETE',
      v_request_table,
      effective_request_id,
      coalesce(nullif(old_status, ''), 'unknown'),
      'deleted',
      caller_uid,
      'super_admin'
    );

    v_audit_done := true;

    delete from public.assistance_requests r
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    new_status := 'deleted';
  end if;

  if not v_audit_done then
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
  end if;

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
  'Superadmin writes against public.assistance_requests. audit_logs.action in (INSERT,UPDATE,DELETE); delete audits before row removal.';

commit;
