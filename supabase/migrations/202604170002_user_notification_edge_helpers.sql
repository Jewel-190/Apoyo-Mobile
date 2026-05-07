-- Helper RPCs for edge-driven user_notification actions.

begin;

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
  join public.audit_logs al
    on al.id = un.audit_log_id
  where un.is_read = false
    and al.request_id is not null
    and private.user_notification_request_owner(al.request_table, al.request_id) = p_user_id;
$$;

grant execute on function public.get_unread_notification_count_for_user(uuid) to authenticated;
grant execute on function public.get_unread_notification_count_for_user(uuid) to service_role;

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
    and private.user_notification_request_owner(al.request_table, al.request_id) = p_user_id
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_request_notifications_read_for_user(uuid, uuid) to authenticated;
grant execute on function public.mark_request_notifications_read_for_user(uuid, uuid) to service_role;

commit;
