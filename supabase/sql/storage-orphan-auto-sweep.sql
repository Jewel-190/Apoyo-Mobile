-- Automatic orphan storage sweeper
-- Purpose:
-- 1) Keep event-based cleanup (already deployed) for immediate deletes.
-- 2) Add periodic reconciliation for files that no longer exist in DB reference tables.
--
-- Run this in Supabase SQL Editor.
-- Then insert your table/column mappings in private.storage_reference_sources.

create schema if not exists private;

create table if not exists private.storage_cleanup_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.storage_reference_sources (
  id bigserial primary key,
  bucket_id text not null,
  table_schema text not null default 'public',
  table_name text not null,
  column_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists private.storage_orphan_sweep_log (
  id bigserial primary key,
  bucket_id text not null,
  orphan_count integer not null,
  dispatched boolean not null,
  request_id bigint,
  sample_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Required config values
insert into private.storage_cleanup_config(key, value)
values
  ('function_url', 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/storage-cleanup'),
  ('hook_secret', 'YOUR_LONG_RANDOM_SECRET')
on conflict (key) do nothing;

-- Build one dynamic UNION query per bucket from the source mappings table.
create or replace function private.collect_referenced_paths(p_bucket text)
returns table(path text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  sql_text text;
begin
  select string_agg(
    format(
      'select trim(%1$I::text) as path from %2$I.%3$I where %1$I is not null and trim(%1$I::text) <> ''''',
      s.column_name,
      s.table_schema,
      s.table_name
    ),
    ' union all '
  )
  into sql_text
  from private.storage_reference_sources s
  where s.enabled = true
    and s.bucket_id = p_bucket;

  if sql_text is null then
    return;
  end if;

  return query execute format('select distinct path from (%s) q', sql_text);
end;
$$;

-- Find orphans in storage.objects and dispatch delete to the edge function in chunks.
create or replace function private.dispatch_orphan_cleanup(
  p_bucket text,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_url text;
  v_secret text;
  v_paths text[];
  v_req_id bigint;
  v_count integer := 0;
begin
  select value into v_url from private.storage_cleanup_config where key = 'function_url';
  select value into v_secret from private.storage_cleanup_config where key = 'hook_secret';

  if v_url is null or v_secret is null then
    raise exception 'Missing storage cleanup config. Set private.storage_cleanup_config.function_url and hook_secret';
  end if;

  with refs as (
    select path from private.collect_referenced_paths(p_bucket)
  ),
  orphans as (
    select o.name as path
    from storage.objects o
    left join refs r on r.path = o.name
    where o.bucket_id = p_bucket
      and r.path is null
    order by o.created_at asc
    limit greatest(p_limit, 1)
  )
  select array_agg(path), coalesce(count(*), 0)
  into v_paths, v_count
  from orphans;

  if v_count = 0 or v_paths is null then
    insert into private.storage_orphan_sweep_log(bucket_id, orphan_count, dispatched, sample_paths)
    values (p_bucket, 0, false, '{}'::text[]);

    return jsonb_build_object(
      'ok', true,
      'bucket', p_bucket,
      'orphans', 0,
      'dispatched', false
    );
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', v_secret
    ),
    body := jsonb_build_object(
      'bucket', p_bucket,
      'paths', v_paths,
      'op', 'SWEEP'
    )
  ) into v_req_id;

  insert into private.storage_orphan_sweep_log(bucket_id, orphan_count, dispatched, request_id, sample_paths)
  values (p_bucket, v_count, true, v_req_id, coalesce(v_paths[1:10], '{}'::text[]));

  return jsonb_build_object(
    'ok', true,
    'bucket', p_bucket,
    'orphans', v_count,
    'dispatched', true,
    'request_id', v_req_id
  );
end;
$$;

-- Sweep all buckets configured in storage_reference_sources.
create or replace function private.run_storage_orphan_sweep(
  p_limit_per_bucket integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  b text;
  results jsonb := '[]'::jsonb;
begin
  for b in
    select distinct bucket_id
    from private.storage_reference_sources
    where enabled = true
  loop
    results := results || jsonb_build_array(private.dispatch_orphan_cleanup(b, p_limit_per_bucket));
  end loop;

  return jsonb_build_object('ok', true, 'results', results);
end;
$$;

-- Optional: schedule every hour (requires pg_cron extension enabled in your project).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available in this project. Run private.run_storage_orphan_sweep() manually or use an external scheduler.';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'storage-orphan-sweep-hourly') then
      perform cron.unschedule('storage-orphan-sweep-hourly');
    end if;

    perform cron.schedule(
      'storage-orphan-sweep-hourly',
      '15 * * * *',
      $$select private.run_storage_orphan_sweep(500);$$
    );
  end if;
end
$$;

-- ===== Example source mappings (edit to your real tables/columns) =====
-- Insert one row per table+path-column that references files in a bucket.
--
-- Example:
-- insert into private.storage_reference_sources(bucket_id, table_schema, table_name, column_name)
-- values
--   ('medical-documents', 'public', 'medical_requests', 'file_path'),
--   ('hospitalization-documents', 'public', 'hospitalization_requests', 'proof_of_confinement_path'),
--   ('hospitalization-documents', 'public', 'hospitalization_requests', 'hospital_bill_path');
--
-- Manual test run:
-- select private.run_storage_orphan_sweep(200);
--
-- Check dispatch result:
-- select id, status_code, error_msg, created
-- from net._http_response
-- order by id desc
-- limit 20;
