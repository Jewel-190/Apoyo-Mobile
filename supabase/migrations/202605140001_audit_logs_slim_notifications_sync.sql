-- Sync triggers/RPCs/policies with slim `audit_logs` (no `request_table`, no `changed_by_role`).
-- Current columns: id, request_id, action, changed_by, changed_at, old_status, new_status.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- Request existence (trigger + helpers): unified `assistance_requests` only
-- ---------------------------------------------------------------------------

create or replace function private.audit_log_request_exists(
  p_request_table text,
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assistance_requests r where r.id = p_request_id
  );
$$;

create or replace function private.enforce_audit_log_request_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.request_id is null then
    raise exception 'request_id cannot be null for audit log entries';
  end if;

  if not exists (
    select 1 from public.assistance_requests r where r.id = new.request_id
  ) then
    raise foreign_key_violation using
      message = 'audit_logs request reference does not exist',
      detail = format('No assistance_requests row with id = %s', new.request_id),
      hint = 'request_id must point to an existing assistance_requests row.';
  end if;

  return new;
end;
$$;

create or replace function private.user_notification_request_owner(
  p_request_table text,
  p_request_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.user_id
  from public.assistance_requests r
  where r.id = p_request_id;
$$;

create or replace function private.can_access_user_notification(
  p_audit_log_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from public.audit_logs al
      where al.id = p_audit_log_id
        and al.request_id is not null
        and private.user_notification_request_owner(
          'assistance_requests',
          al.request_id
        ) = auth.uid()
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- audit_logs → user_notification
-- ---------------------------------------------------------------------------

create or replace function private.create_user_notification_from_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner uuid;
  v_new_status_normalized text;
  v_new_at timestamptz;
begin
  if new.request_id is null then
    return new;
  end if;

  v_new_status_normalized := lower(replace(coalesce(new.new_status, ''), '_', ' '));
  if v_new_status_normalized = 'draft' then
    return new;
  end if;

  v_owner := private.user_notification_request_owner(
    'assistance_requests',
    new.request_id
  );
  if v_owner is null then
    return new;
  end if;

  v_new_at := coalesce(new.changed_at, now());

  insert into public.user_notification (
    audit_log_id,
    is_read,
    created_at
  )
  values (
    new.id,
    false,
    v_new_at
  )
  on conflict (audit_log_id) do update
  set
    created_at = excluded.created_at,
    updated_at = now();

  delete from public.user_notification un_old
  using public.audit_logs al_old
  where un_old.audit_log_id = al_old.id
    and al_old.request_id = new.request_id
    and un_old.audit_log_id <> new.id
    and coalesce(al_old.changed_at, un_old.created_at) < v_new_at;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- User notification RPCs (edge function)
-- ---------------------------------------------------------------------------

create or replace function public.get_latest_notifications_for_user(
  p_user_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  audit_log_id uuid,
  request_id uuid,
  request_table text,
  action text,
  old_status text,
  new_status text,
  is_read boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, private
as $$
  with scoped as (
    select
      un.id,
      un.audit_log_id,
      al.request_id,
      'assistance_requests'::text as request_table,
      al.action,
      al.old_status,
      al.new_status,
      un.is_read,
      coalesce(al.changed_at, un.created_at) as created_at
    from public.user_notification un
    join public.audit_logs al on al.id = un.audit_log_id
    where al.request_id is not null
      and private.user_notification_request_owner(
        'assistance_requests',
        al.request_id
      ) = p_user_id
  ),
  latest as (
    select distinct on (s.request_id)
      s.id,
      s.audit_log_id,
      s.request_id,
      s.request_table,
      s.action,
      s.old_status,
      s.new_status,
      s.is_read,
      s.created_at
    from scoped s
    order by s.request_id, s.created_at desc
  )
  select
    l.id,
    l.audit_log_id,
    l.request_id,
    l.request_table,
    l.action,
    l.old_status,
    l.new_status,
    l.is_read,
    l.created_at
  from latest l
  order by l.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

create or replace function public.get_unread_notification_count_for_user(
  p_user_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select count(*)::integer
  from public.user_notification un
  join public.audit_logs al on al.id = un.audit_log_id
  where un.is_read = false
    and al.request_id is not null
    and private.user_notification_request_owner(
      'assistance_requests',
      al.request_id
    ) = p_user_id;
$$;

create or replace function public.mark_request_notifications_read_for_user(
  p_user_id uuid,
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer := 0;
begin
  update public.user_notification un
  set
    is_read = true,
    updated_at = now()
  from public.audit_logs al
  where un.audit_log_id = al.id
    and al.request_id = p_request_id
    and private.user_notification_request_owner(
      'assistance_requests',
      al.request_id
    ) = p_user_id
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_request_notifications_read(
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.user_notification un
  set
    is_read = true,
    updated_at = now()
  from public.audit_logs al
  where un.audit_log_id = al.id
    and al.request_id = p_request_id
    and private.user_notification_request_owner(
      'assistance_requests',
      al.request_id
    ) = auth.uid()
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.cleanup_user_notifications(
  p_read_retention interval default interval '30 days',
  p_remove_superseded boolean default true
)
returns table (
  deleted_orphaned integer,
  deleted_superseded integer,
  deleted_expired_read integer,
  total_deleted integer
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_orphaned integer := 0;
  v_superseded integer := 0;
  v_expired integer := 0;
begin
  delete from public.user_notification un
  using public.audit_logs al
  where un.audit_log_id = al.id
    and (
      al.request_id is null
      or private.user_notification_request_owner(
        'assistance_requests',
        al.request_id
      ) is null
    );
  get diagnostics v_orphaned = row_count;

  if p_remove_superseded then
    with latest as (
      select distinct on (al.request_id)
        un.id
      from public.user_notification un
      join public.audit_logs al on al.id = un.audit_log_id
      where al.request_id is not null
      order by
        al.request_id,
        coalesce(al.changed_at, un.created_at) desc,
        un.created_at desc,
        un.id desc
    )
    delete from public.user_notification un
    where exists (
      select 1
      from public.audit_logs al
      where al.id = un.audit_log_id
        and al.request_id is not null
    )
      and not exists (
        select 1
        from latest l
        where l.id = un.id
      );

    get diagnostics v_superseded = row_count;
  end if;

  delete from public.user_notification
  where is_read = true
    and created_at < now() - coalesce(p_read_retention, interval '30 days');
  get diagnostics v_expired = row_count;

  return query
  select
    v_orphaned,
    v_superseded,
    v_expired,
    v_orphaned + v_superseded + v_expired;
end;
$$;

-- ---------------------------------------------------------------------------
-- audit_logs RLS: `request_table` column removed — pass literal discriminator
-- ---------------------------------------------------------------------------

create or replace function public.can_read_audit_log(
  p_request_table text,
  p_request_id uuid
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
    where r.id = p_request_id
      and (
        r.user_id = auth.uid()
        or (
          public.is_medical_admin()
          and coalesce(nullif(trim(r.status), ''), '') <> 'draft'
        )
      )
  );
$$;

drop policy if exists "Users can read request audit logs" on public.audit_logs;
create policy "Users can read request audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.can_read_audit_log('assistance_requests', request_id));

-- ---------------------------------------------------------------------------
-- assistance_requests audit trigger
-- ---------------------------------------------------------------------------

create or replace function public.log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_id uuid;
  v_old_status text;
  v_new_status text;
  v_changed_by uuid;
  v_claim_sub text;
begin
  if TG_TABLE_NAME is distinct from 'assistance_requests' then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  v_claim_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  if v_claim_sub is null then
    begin
      v_claim_sub := nullif(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
        ''
      );
    exception
      when others then
        v_claim_sub := null;
    end;
  end if;

  if v_claim_sub is not null
     and v_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_changed_by := v_claim_sub::uuid;
  else
    v_changed_by := null;
  end if;

  if TG_OP = 'INSERT' then
    v_request_id := NEW.id;
    v_old_status := null;
    v_new_status := nullif(NEW.status, '');
    if v_new_status is null then
      return NEW;
    end if;
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      v_request_id, 'INSERT', v_old_status, v_new_status, v_changed_by, now()
    );
    return NEW;

  elsif TG_OP = 'UPDATE' then
    v_request_id := NEW.id;
    v_old_status := nullif(OLD.status, '');
    v_new_status := nullif(NEW.status, '');
    if v_old_status is not distinct from v_new_status then
      return NEW;
    end if;
    if v_new_status is null then
      return NEW;
    end if;
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      v_request_id, 'UPDATE', v_old_status, v_new_status, v_changed_by, now()
    );
    return NEW;

  elsif TG_OP = 'DELETE' then
    v_request_id := OLD.id;
    v_old_status := coalesce(nullif(OLD.status, ''), 'unknown');
    v_new_status := 'deleted';
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      v_request_id, 'DELETE', v_old_status, v_new_status, v_changed_by, now()
    );
    return OLD;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Superadmin RPC audit row
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

comment on function public.admin_request_op(text, text, uuid, jsonb) is
  'Superadmin writes against public.assistance_requests only. Always writes audit_logs.';

grant execute on function public.get_latest_notifications_for_user(uuid, integer) to authenticated;
grant execute on function public.get_latest_notifications_for_user(uuid, integer) to service_role;

grant execute on function public.get_unread_notification_count_for_user(uuid) to authenticated;
grant execute on function public.get_unread_notification_count_for_user(uuid) to service_role;

grant execute on function public.mark_request_notifications_read_for_user(uuid, uuid) to authenticated;
grant execute on function public.mark_request_notifications_read_for_user(uuid, uuid) to service_role;

grant execute on function public.mark_request_notifications_read(uuid) to authenticated;

grant execute on function public.cleanup_user_notifications(interval, boolean) to service_role;

commit;
