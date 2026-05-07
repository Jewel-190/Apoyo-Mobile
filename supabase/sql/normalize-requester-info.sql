-- Normalize requester information across service request tables.
-- Removes duplicated requester fields and enforces user_id -> auth.users(id).

begin;

create or replace function public._normalize_request_table(p_table text)
returns void
language plpgsql
as $$
declare
  fk_record record;
  null_count bigint;
begin
  execute format('alter table public.%I drop column if exists requester_name', p_table);
  execute format('alter table public.%I drop column if exists requester_contact_number', p_table);
  execute format('alter table public.%I drop column if exists requester_email', p_table);
  execute format('alter table public.%I drop column if exists requester_present_address', p_table);

  execute format('select count(*) from public.%I where user_id is null', p_table)
    into null_count;

  if null_count > 0 then
    raise exception 'Cannot set %.user_id NOT NULL: % rows have user_id = NULL', p_table, null_count;
  end if;

  execute format('alter table public.%I alter column user_id set not null', p_table);

  -- Drop any existing FK on user_id to re-attach it consistently to auth.users(id).
  for fk_record in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = p_table
      and c.contype = 'f'
      and a.attname = 'user_id'
  loop
    execute format('alter table public.%I drop constraint %I', p_table, fk_record.conname);
  end loop;

  execute format(
    'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
    p_table,
    p_table || '_user_id_fkey'
  );

  execute format(
    'create index if not exists %I on public.%I (user_id)',
    p_table || '_user_id_idx',
    p_table
  );
end;
$$;

select public._normalize_request_table('hospitalization_requests');
select public._normalize_request_table('treatment_requests');
select public._normalize_request_table('medical_requests');
select public._normalize_request_table('financial_requests');
select public._normalize_request_table('monetary_requests');
select public._normalize_request_table('burial_requests');
select public._normalize_request_table('cremation_requests');
select public._normalize_request_table('columbarium_requests');

drop function if exists public._normalize_request_table(text);

commit;
