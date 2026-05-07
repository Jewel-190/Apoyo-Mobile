begin;

create or replace function private.set_request_attachment_uid_reference(
  p_request_table text,
  p_request_uid uuid,
  p_file_type text,
  p_attachment_uid uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_column_exists boolean;
begin
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = p_request_table
      and c.column_name = p_file_type
  ) into v_column_exists;

  if not v_column_exists then
    return;
  end if;

  execute format(
    'update public.%I set %I = %L where id = %L::uuid',
    p_request_table,
    p_file_type,
    p_attachment_uid::text,
    p_request_uid::text
  );
end;
$$;

create or replace function private.clear_request_attachment_uid_reference(
  p_request_table text,
  p_request_uid uuid,
  p_file_type text,
  p_attachment_uid uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_column_exists boolean;
begin
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = p_request_table
      and c.column_name = p_file_type
  ) into v_column_exists;

  if not v_column_exists then
    return;
  end if;

  execute format(
    'update public.%I set %I = null where id = %L::uuid and %I = %L',
    p_request_table,
    p_file_type,
    p_request_uid::text,
    p_file_type,
    p_attachment_uid::text
  );
end;
$$;

create or replace function private.sync_request_table_file_uid_from_attachment()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    perform private.set_request_attachment_uid_reference(
      new.request_table,
      new.request_uid,
      new.file_type,
      new.uid
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.request_table is distinct from new.request_table
      or old.request_uid is distinct from new.request_uid
      or old.file_type is distinct from new.file_type
    then
      perform private.clear_request_attachment_uid_reference(
        old.request_table,
        old.request_uid,
        old.file_type,
        old.uid
      );
    end if;

    perform private.set_request_attachment_uid_reference(
      new.request_table,
      new.request_uid,
      new.file_type,
      new.uid
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.clear_request_attachment_uid_reference(
      old.request_table,
      old.request_uid,
      old.file_type,
      old.uid
    );
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_request_table_file_uid_from_attachment on public.request_attachments;
create trigger trg_sync_request_table_file_uid_from_attachment
after insert or update or delete on public.request_attachments
for each row
execute function private.sync_request_table_file_uid_from_attachment();

-- Backfill existing request rows so their *_file columns hold request_attachments.uid values.
do $$
declare
  r record;
begin
  for r in
    select uid, request_table, request_uid, file_type
    from public.request_attachments
  loop
    perform private.set_request_attachment_uid_reference(
      r.request_table,
      r.request_uid,
      r.file_type,
      r.uid
    );
  end loop;
end
$$;

commit;
