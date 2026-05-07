-- Simplify and normalize audit logging:
-- - Drop audit_request_refs indirection
-- - Replace table_name/record_id with request_table/request_id
-- - Keep backend-only trigger auditing for 8 service tables
-- - Use direct per-service FKs via request_table partitions

-- 1) Build new normalized audit table structure.
create table if not exists public.audit_logs_v2 (
  id uuid not null default gen_random_uuid(),
  request_table text not null,
  request_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_by_role text,
  changed_at timestamptz not null default now(),
  constraint audit_logs_v2_request_table_chk check (
    request_table in (
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    )
  ),
  constraint audit_logs_v2_pkey primary key (request_table, id)
) partition by list (request_table);

-- 2) Create one partition per audited service table.
create table if not exists public.audit_logs_hospitalization
  partition of public.audit_logs_v2
  for values in ('hospitalization_requests');

create table if not exists public.audit_logs_treatment
  partition of public.audit_logs_v2
  for values in ('treatment_requests');

create table if not exists public.audit_logs_medical
  partition of public.audit_logs_v2
  for values in ('medical_requests');

create table if not exists public.audit_logs_financial
  partition of public.audit_logs_v2
  for values in ('financial_requests');

create table if not exists public.audit_logs_monetary
  partition of public.audit_logs_v2
  for values in ('monetary_requests');

create table if not exists public.audit_logs_burial
  partition of public.audit_logs_v2
  for values in ('burial_requests');

create table if not exists public.audit_logs_cremation
  partition of public.audit_logs_v2
  for values in ('cremation_requests');

create table if not exists public.audit_logs_columbarium
  partition of public.audit_logs_v2
  for values in ('columbarium_requests');

-- 3) Direct FK from each partition to the actual service request table.
-- request_id is nullable to preserve DELETE audit rows while still enforcing direct FK for active rows.
alter table public.audit_logs_hospitalization
  drop constraint if exists audit_logs_hospitalization_request_id_fk;
alter table public.audit_logs_hospitalization
  add constraint audit_logs_hospitalization_request_id_fk
  foreign key (request_id)
  references public.hospitalization_requests (id)
  on update restrict
  on delete set null;

alter table public.audit_logs_treatment
  drop constraint if exists audit_logs_treatment_request_id_fk;
alter table public.audit_logs_treatment
  add constraint audit_logs_treatment_request_id_fk
  foreign key (request_id)
  references public.treatment_requests (id)
  on update restrict
  on delete set null;

alter table public.audit_logs_medical
  drop constraint if exists audit_logs_medical_request_id_fk;
alter table public.audit_logs_medical
  add constraint audit_logs_medical_request_id_fk
  foreign key (request_id)
  references public.medical_requests (id)
  on update restrict
  on delete set null;

alter table public.audit_logs_financial
  drop constraint if exists audit_logs_financial_request_id_fk;
alter table public.audit_logs_financial
  add constraint audit_logs_financial_request_id_fk
  foreign key (request_id)
  references public.financial_requests (id)
  on update restrict
  on delete set null;

alter table public.audit_logs_monetary
  drop constraint if exists audit_logs_monetary_request_id_fk;
alter table public.audit_logs_monetary
  add constraint audit_logs_monetary_request_id_fk
  foreign key (request_id)
  references public.monetary_requests (id)
  on update restrict
  on delete set null;

alter table public.audit_logs_burial
  drop constraint if exists audit_logs_burial_request_id_fk;
alter table public.audit_logs_burial
  add constraint audit_logs_burial_request_id_fk
  foreign key (request_id)
  references public.burial_requests (id)
  on update restrict
  on delete set null;

alter table public.audit_logs_cremation
  drop constraint if exists audit_logs_cremation_request_id_fk;
alter table public.audit_logs_cremation
  add constraint audit_logs_cremation_request_id_fk
  foreign key (request_id)
  references public.cremation_requests (id)
  on update restrict
  on delete set null;

alter table public.audit_logs_columbarium
  drop constraint if exists audit_logs_columbarium_request_id_fk;
alter table public.audit_logs_columbarium
  add constraint audit_logs_columbarium_request_id_fk
  foreign key (request_id)
  references public.columbarium_requests (id)
  on update restrict
  on delete set null;

-- 4) Copy historical data from old schema if audit_logs exists.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'audit_logs'
  ) then
    insert into public.audit_logs_v2 (
      id,
      request_table,
      request_id,
      action,
      old_data,
      new_data,
      changed_by,
      changed_by_role,
      changed_at
    )
    select
      al.id,
      al.table_name as request_table,
      case
        when al.action = 'DELETE' then null
        when al.table_name = 'hospitalization_requests'
          and exists (select 1 from public.hospitalization_requests r where r.id = al.record_id)
          then al.record_id
        when al.table_name = 'treatment_requests'
          and exists (select 1 from public.treatment_requests r where r.id = al.record_id)
          then al.record_id
        when al.table_name = 'medical_requests'
          and exists (select 1 from public.medical_requests r where r.id = al.record_id)
          then al.record_id
        when al.table_name = 'financial_requests'
          and exists (select 1 from public.financial_requests r where r.id = al.record_id)
          then al.record_id
        when al.table_name = 'monetary_requests'
          and exists (select 1 from public.monetary_requests r where r.id = al.record_id)
          then al.record_id
        when al.table_name = 'burial_requests'
          and exists (select 1 from public.burial_requests r where r.id = al.record_id)
          then al.record_id
        when al.table_name = 'cremation_requests'
          and exists (select 1 from public.cremation_requests r where r.id = al.record_id)
          then al.record_id
        when al.table_name = 'columbarium_requests'
          and exists (select 1 from public.columbarium_requests r where r.id = al.record_id)
          then al.record_id
        else null
      end as request_id,
      al.action,
      al.old_data,
      al.new_data,
      al.changed_by,
      al.changed_by_role,
      al.changed_at
    from public.audit_logs al
    where al.table_name in (
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    )
    on conflict (request_table, id) do nothing;
  end if;
end
$$;

-- 5) Swap old table out and replace with new normalized table name.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'audit_logs'
  ) then
    alter table public.audit_logs rename to audit_logs_legacy;
  end if;
end
$$;

alter table public.audit_logs_v2 rename to audit_logs;

drop table if exists public.audit_logs_legacy;

-- 6) Recreate operational indexes on the normalized table.
create index if not exists idx_audit_logs_request_table_request_id
  on public.audit_logs (request_table, request_id);

create index if not exists idx_audit_logs_changed_at_desc
  on public.audit_logs (changed_at desc);

create index if not exists idx_audit_logs_action
  on public.audit_logs (action);

-- 7) Replace trigger function to write normalized columns only.
create or replace function public.log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_table text;
  v_request_id uuid;
  v_changed_by uuid;
  v_claim_sub text;
  v_changed_by_role text;
begin
  if TG_TABLE_NAME = any (
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
  ) then
    v_request_table := TG_TABLE_NAME;
  else
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  -- Keep DELETE audit rows while retaining direct FK integrity for active rows.
  if TG_OP = 'DELETE' then
    v_request_id := null;
  else
    v_request_id := NEW.id;
  end if;

  v_changed_by_role := current_user;
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
    insert into public.audit_logs (
      request_table,
      request_id,
      action,
      old_data,
      new_data,
      changed_by,
      changed_by_role,
      changed_at
    )
    values (
      v_request_table,
      v_request_id,
      'INSERT',
      null,
      to_jsonb(NEW),
      v_changed_by,
      v_changed_by_role,
      now()
    );

    return NEW;
  elsif TG_OP = 'UPDATE' then
    if row_to_json(OLD) is distinct from row_to_json(NEW) then
      insert into public.audit_logs (
        request_table,
        request_id,
        action,
        old_data,
        new_data,
        changed_by,
        changed_by_role,
        changed_at
      )
      values (
        v_request_table,
        v_request_id,
        'UPDATE',
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_changed_by,
        v_changed_by_role,
        now()
      );
    end if;

    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_logs (
      request_table,
      request_id,
      action,
      old_data,
      new_data,
      changed_by,
      changed_by_role,
      changed_at
    )
    values (
      v_request_table,
      v_request_id,
      'DELETE',
      to_jsonb(OLD),
      null,
      v_changed_by,
      v_changed_by_role,
      now()
    );

    return OLD;
  end if;

  return null;
exception
  when others then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
end;
$$;

-- 8) Keep backend trigger coverage on all 8 service request tables.
drop trigger if exists trg_audit_hospitalization_requests_changes on public.hospitalization_requests;
create trigger trg_audit_hospitalization_requests_changes
after insert or update or delete on public.hospitalization_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_treatment_requests_changes on public.treatment_requests;
create trigger trg_audit_treatment_requests_changes
after insert or update or delete on public.treatment_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_medical_requests_changes on public.medical_requests;
create trigger trg_audit_medical_requests_changes
after insert or update or delete on public.medical_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_financial_requests_changes on public.financial_requests;
create trigger trg_audit_financial_requests_changes
after insert or update or delete on public.financial_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_monetary_requests_changes on public.monetary_requests;
create trigger trg_audit_monetary_requests_changes
after insert or update or delete on public.monetary_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_burial_requests_changes on public.burial_requests;
create trigger trg_audit_burial_requests_changes
after insert or update or delete on public.burial_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_cremation_requests_changes on public.cremation_requests;
create trigger trg_audit_cremation_requests_changes
after insert or update or delete on public.cremation_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_columbarium_requests_changes on public.columbarium_requests;
create trigger trg_audit_columbarium_requests_changes
after insert or update or delete on public.columbarium_requests
for each row execute function public.log_changes();

-- 9) Cleanup legacy indirection tables no longer needed.
drop table if exists public.audit_request_refs;
drop table if exists public.audit_service_tables;
