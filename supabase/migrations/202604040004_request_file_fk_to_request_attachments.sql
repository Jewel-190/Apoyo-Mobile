begin;

-- Convert all *_file columns in the 8 request tables to UUID and wire FK to request_attachments(uid).
do $$
declare
  r record;
  v_constraint text;
  v_existing_fk text;
  v_index text;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = any (
        array[
          'hospitalization_requests',
          'treatment_requests',
          'medical_requests',
          'financial_requests',
          'monetary_requests',
          'burial_requests',
          'cremation_requests',
          'columbarium_requests'
        ]
      )
      and right(c.column_name, 5) = '_file'
    order by c.table_name, c.ordinal_position
  loop
    execute format(
      'alter table public.%I alter column %I type uuid using case when %I is null then null when %I::text ~* %L then %I::uuid else null end',
      r.table_name,
      r.column_name,
      r.column_name,
      r.column_name,
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      r.column_name
    );

    for v_existing_fk in
      select con.conname
      from pg_constraint con
      join pg_class t on t.oid = con.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(con.conkey)
      where con.contype = 'f'
        and n.nspname = 'public'
        and t.relname = r.table_name
        and a.attname = r.column_name
    loop
      execute format('alter table public.%I drop constraint %I', r.table_name, v_existing_fk);
    end loop;

    v_constraint := format('fk_%s_%s_ra_uid', r.table_name, r.column_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.request_attachments(uid) on delete set null',
      r.table_name,
      v_constraint,
      r.column_name
    );

    v_index := format('idx_%s_%s', r.table_name, r.column_name);
    execute format('create index if not exists %I on public.%I (%I)', v_index, r.table_name, r.column_name);
  end loop;
end
$$;

commit;
