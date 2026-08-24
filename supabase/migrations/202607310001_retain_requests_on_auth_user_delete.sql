-- Retain assistance request data when an Auth account is deleted/deactivated.
-- Also harden the notification trigger so Auth user deletes cannot fail.
--
-- Before: assistance_requests.user_id ON DELETE CASCADE wiped requests (and then
-- audit/notification triggers crashed mid-delete).
-- After:  user_id becomes nullable + ON DELETE SET NULL so requests, attachments,
-- and audit history remain for admin records.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Keep request rows when auth.users is removed
-- ---------------------------------------------------------------------------

alter table public.assistance_requests
  alter column user_id drop not null;

alter table public.assistance_requests
  drop constraint if exists assistance_requests_user_id_fkey;

alter table public.assistance_requests
  add constraint assistance_requests_user_id_fkey
  foreign key (user_id)
  references auth.users (id)
  on delete set null;

comment on column public.assistance_requests.user_id is
  'Owning Auth user. Null after the account is deleted; request payload/attachments/audit are retained.';

-- ---------------------------------------------------------------------------
-- 2. Harden notification trigger (never block Auth/request teardown)
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

  -- Request teardown / account-cleanup audit events should not notify anyone.
  if upper(coalesce(new.action, '')) = 'DELETE' then
    return new;
  end if;

  v_new_status_normalized := lower(replace(coalesce(new.new_status, ''), '_', ' '));
  if v_new_status_normalized in ('draft', 'deleted') then
    return new;
  end if;

  v_owner := private.user_notification_request_owner(
    'assistance_requests',
    new.request_id
  );
  if v_owner is null then
    return new;
  end if;

  -- Owner account already gone (or mid-delete) — do not insert notifications.
  if not exists (select 1 from auth.users u where u.id = v_owner) then
    return new;
  end if;

  -- MOBILE RULE: only notify the applicant about admin/system-driven changes.
  if new.changed_by is not null and new.changed_by = v_owner then
    return new;
  end if;

  v_new_at := coalesce(new.changed_at, now());

  insert into public.user_notification (
    user_id,
    request_id,
    audit_log_id,
    action,
    old_status,
    new_status,
    is_read,
    created_at,
    updated_at
  )
  values (
    v_owner,
    new.request_id,
    new.id,
    new.action,
    new.old_status,
    new.new_status,
    false,
    v_new_at,
    now()
  )
  on conflict (user_id, request_id) do update
  set
    audit_log_id = excluded.audit_log_id,
    action = excluded.action,
    old_status = excluded.old_status,
    new_status = excluded.new_status,
    is_read = false,
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Skip DELETE audit rows when the request owner Auth user is already gone
--    (avoids useless orphan "deleted" notifications during edge cases).
--    Normal admin/user request deletes still log as before.
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
    -- If the owning Auth user no longer exists, this delete is almost certainly
    -- cascading from account removal. Requests should normally SET NULL instead;
    -- still skip noisy DELETE audit/notification work in that race.
    if OLD.user_id is not null
       and not exists (select 1 from auth.users u where u.id = OLD.user_id)
    then
      return OLD;
    end if;

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

commit;
