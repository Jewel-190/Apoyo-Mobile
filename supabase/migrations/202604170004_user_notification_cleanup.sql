-- Automatic and on-demand cleanup for user_notification rows.

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
  v_new_at timestamptz;
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

  -- Keep only the freshest notification rows for the same request.
  delete from public.user_notification un_old
  using public.audit_logs al_old
  where un_old.audit_log_id = al_old.id
    and al_old.request_table = new.request_table
    and al_old.request_id = new.request_id
    and un_old.audit_log_id <> new.id
    and coalesce(al_old.changed_at, un_old.created_at) < v_new_at;

  return new;
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
  -- Rows whose request no longer resolves to an owner are no longer usable.
  delete from public.user_notification un
  using public.audit_logs al
  where un.audit_log_id = al.id
    and (
      al.request_id is null
      or private.user_notification_request_owner(al.request_table, al.request_id) is null
    );
  get diagnostics v_orphaned = row_count;

  if p_remove_superseded then
    with latest as (
      select distinct on (al.request_table, al.request_id)
        un.id
      from public.user_notification un
      join public.audit_logs al
        on al.id = un.audit_log_id
      where al.request_id is not null
      order by
        al.request_table,
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

  -- Old read notifications are already consumed by users and can be retired.
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

grant execute on function public.cleanup_user_notifications(interval, boolean) to service_role;

-- One-time cleanup pass on deploy.
do $$
begin
  perform public.cleanup_user_notifications(interval '30 days', true);
end
$$;

commit;
