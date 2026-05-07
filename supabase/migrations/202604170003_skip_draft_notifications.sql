-- Prevent draft transitions from generating user notifications.

begin;

create or replace function private.create_user_notification_from_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner uuid;
  v_new_status_normalized text;
begin
  if new.request_id is null then
    return new;
  end if;

  v_new_status_normalized := lower(replace(coalesce(new.new_status, ''), '_', ' '));
  if v_new_status_normalized = 'draft' then
    return new;
  end if;

  v_owner := private.user_notification_request_owner(new.request_table, new.request_id);
  if v_owner is null then
    return new;
  end if;

  insert into public.user_notification (
    audit_log_id,
    is_read,
    created_at
  )
  values (
    new.id,
    false,
    coalesce(new.changed_at, now())
  )
  on conflict (audit_log_id) do update
  set
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;

-- Remove any existing notifications that came from audit rows whose new status is draft.
delete from public.user_notification un
using public.audit_logs al
where un.audit_log_id = al.id
  and lower(replace(coalesce(al.new_status, ''), '_', ' ')) = 'draft';

commit;
