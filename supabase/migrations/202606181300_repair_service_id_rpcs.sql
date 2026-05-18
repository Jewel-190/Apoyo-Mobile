-- Repair RPCs/RLS that still join on dropped assistance_services.service_key.
-- Idempotent when 202606181200 (UUID-only service_id) is already applied.

begin;

set search_path = public, private;

drop function if exists public.can_access_request_attachment(uuid);

create or replace function private.assistance_category_id_for_request(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.category_id
  from public.assistance_requests r
  join public.assistance_services s on s.id = r.service_id
  where r.id = p_request_id
  limit 1;
$$;

create or replace function public.can_access_request_attachment(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_uid
      and (
        r.user_id = auth.uid()
        or public.is_superadmin(auth.uid())
        or (
          public.is_medical_admin()
          and nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
          and exists (
            select 1
            from public.assistance_services s
            join public.assistance_categories c on c.id = s.category_id
            where s.id = r.service_id
              and c.slug = 'medical'
          )
        )
      )
  );
$$;

comment on function public.can_access_request_attachment(text, uuid) is
  'RLS gate for request_attachments: parent row is public.assistance_requests (id = request_uid / assistance_request_id).';

create or replace function public.submit_assistance_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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

create or replace function public.admin_request_op(
  op text,
  service_type text,
  request_id uuid,
  patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_uid uuid := auth.uid();
  audit_action text;
  old_status text;
  new_status text;
  result jsonb;
  v_request_table text := 'assistance_requests';
  effective_request_id uuid;
  v_service_id uuid;
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
    v_service_id := nullif(trim(coalesce(patch->>'service_id', '')), '')::uuid;

    if v_service_id is null and patch ? 'service_id' then
      raise exception 'admin_request_op: invalid service_id'
        using errcode = '22023';
    end if;

    if v_service_id is null then
      raise exception 'admin_request_op: patch.service_id is required'
        using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.assistance_services s where s.id = v_service_id
    ) then
      raise exception 'admin_request_op: unknown service_id %', v_service_id
        using errcode = '22023';
    end if;

    insert into public.assistance_requests (
      id, user_id, service_id, status, additional_info,
      financial_request_type, request_code, submitted_at, case_study_date, payload
    )
    values (
      coalesce(request_id, gen_random_uuid()),
      (patch->>'user_id')::uuid,
      v_service_id,
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
    effective_request_id := request_id;
    new_status := 'deleted';

    if not exists (
      select 1 from public.assistance_requests r where r.id = request_id
    ) then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      effective_request_id,
      'DELETE',
      coalesce(nullif(old_status, ''), 'unknown'),
      'deleted',
      caller_uid,
      now()
    );

    delete from public.assistance_requests r
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    if result is null then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;
  end if;

  if op is distinct from 'delete' then
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      effective_request_id,
      audit_action,
      old_status,
      new_status,
      caller_uid,
      now()
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

drop policy if exists assistance_requests_admin_select on public.assistance_requests;
drop policy if exists assistance_requests_admin_update on public.assistance_requests;

create policy assistance_requests_admin_select on public.assistance_requests
  for select
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and exists (
          select 1
          from public.assistance_services s
          join public.assistance_categories c on c.id = s.category_id
          where s.id = assistance_requests.service_id
            and coalesce(s.active, true) = true
            and (
              (a.category_id is not null and c.id = a.category_id)
              or (
                a.category_id is null
                and nullif(trim(lower(coalesce(a.role, ''))), '') is not null
                and nullif(trim(lower(coalesce(c.admin_role_key::text, ''))), '') is not null
                and (
                  lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text))
                  or lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text)) || '_admin'
                  or lower(trim(a.role::text)) = lower(trim(c.admin_role_key::text)) || '_admin'
                  or regexp_replace(lower(trim(c.admin_role_key::text)), '_admin$', '') =
                     regexp_replace(lower(trim(a.role::text)), '_admin$', '')
                )
              )
              or (
                a.category_id is null
                and (
                  nullif(trim(lower(coalesce(a.role, ''))), '') is null
                  or trim(coalesce(a.role, '')) = ''
                )
                and nullif(trim(lower(coalesce(a.service_type::text, ''))), '') is not null
                and lower(trim(c.slug::text)) = lower(trim(a.service_type::text))
              )
            )
        )
    )
  );

create policy assistance_requests_admin_update on public.assistance_requests
  for update
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and exists (
          select 1
          from public.assistance_services s
          join public.assistance_categories c on c.id = s.category_id
          where s.id = assistance_requests.service_id
            and coalesce(s.active, true) = true
            and (
              (a.category_id is not null and c.id = a.category_id)
              or (
                a.category_id is null
                and nullif(trim(lower(coalesce(a.role, ''))), '') is not null
                and nullif(trim(lower(coalesce(c.admin_role_key::text, ''))), '') is not null
                and (
                  lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text))
                  or lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text)) || '_admin'
                  or lower(trim(a.role::text)) = lower(trim(c.admin_role_key::text)) || '_admin'
                  or regexp_replace(lower(trim(c.admin_role_key::text)), '_admin$', '') =
                     regexp_replace(lower(trim(a.role::text)), '_admin$', '')
                )
              )
              or (
                a.category_id is null
                and (
                  nullif(trim(lower(coalesce(a.role, ''))), '') is null
                  or trim(coalesce(a.role, '')) = ''
                )
                and nullif(trim(lower(coalesce(a.service_type::text, ''))), '') is not null
                and lower(trim(c.slug::text)) = lower(trim(a.service_type::text))
              )
            )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and exists (
          select 1
          from public.assistance_services s
          join public.assistance_categories c on c.id = s.category_id
          where s.id = assistance_requests.service_id
            and coalesce(s.active, true) = true
            and (
              (a.category_id is not null and c.id = a.category_id)
              or (
                a.category_id is null
                and nullif(trim(lower(coalesce(a.role, ''))), '') is not null
                and nullif(trim(lower(coalesce(c.admin_role_key::text, ''))), '') is not null
                and (
                  lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text))
                  or lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text)) || '_admin'
                  or lower(trim(a.role::text)) = lower(trim(c.admin_role_key::text)) || '_admin'
                  or regexp_replace(lower(trim(c.admin_role_key::text)), '_admin$', '') =
                     regexp_replace(lower(trim(a.role::text)), '_admin$', '')
                )
              )
              or (
                a.category_id is null
                and (
                  nullif(trim(lower(coalesce(a.role, ''))), '') is null
                  or trim(coalesce(a.role, '')) = ''
                )
                and nullif(trim(lower(coalesce(a.service_type::text, ''))), '') is not null
                and lower(trim(c.slug::text)) = lower(trim(a.service_type::text))
              )
            )
        )
    )
  );

commit;
