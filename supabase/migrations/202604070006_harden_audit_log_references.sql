-- Harden audit logging references and actor tracking for backend-only auditing.
-- Scope: 8 service request tables only.

create table if not exists public.audit_service_tables (
  table_name text primary key
);

insert into public.audit_service_tables (table_name)
values
  ('hospitalization_requests'),
  ('treatment_requests'),
  ('medical_requests'),
  ('financial_requests'),
  ('monetary_requests'),
  ('burial_requests'),
  ('cremation_requests'),
  ('columbarium_requests')
on conflict do nothing;

create table if not exists public.audit_request_refs (
  request_table text not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint audit_request_refs_pkey primary key (request_table, request_id)
);

alter table public.audit_request_refs
  add column if not exists ref_id uuid;

update public.audit_request_refs
set ref_id = gen_random_uuid()
where ref_id is null;

alter table public.audit_request_refs
  alter column ref_id set default gen_random_uuid();

alter table public.audit_request_refs
  alter column ref_id set not null;

alter table public.audit_request_refs
  drop constraint if exists audit_request_refs_ref_id_key;

alter table public.audit_request_refs
  add constraint audit_request_refs_ref_id_key unique (ref_id);

alter table public.audit_request_refs
  drop constraint if exists audit_request_refs_service_table_fk;

alter table public.audit_request_refs
  add constraint audit_request_refs_service_table_fk
  foreign key (request_table)
  references public.audit_service_tables (table_name)
  on update restrict
  on delete restrict
  not valid;

alter table public.audit_request_refs
  validate constraint audit_request_refs_service_table_fk;

-- Remove non-service audit rows (including request_attachments) to enforce strict service-only FK rules.
delete from public.audit_logs
where table_name <> all (
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
);

-- Backfill reference anchors from live service tables.
insert into public.audit_request_refs (request_table, request_id)
select 'hospitalization_requests', id from public.hospitalization_requests
on conflict do nothing;

insert into public.audit_request_refs (request_table, request_id)
select 'treatment_requests', id from public.treatment_requests
on conflict do nothing;

insert into public.audit_request_refs (request_table, request_id)
select 'medical_requests', id from public.medical_requests
on conflict do nothing;

insert into public.audit_request_refs (request_table, request_id)
select 'financial_requests', id from public.financial_requests
on conflict do nothing;

insert into public.audit_request_refs (request_table, request_id)
select 'monetary_requests', id from public.monetary_requests
on conflict do nothing;

insert into public.audit_request_refs (request_table, request_id)
select 'burial_requests', id from public.burial_requests
on conflict do nothing;

insert into public.audit_request_refs (request_table, request_id)
select 'cremation_requests', id from public.cremation_requests
on conflict do nothing;

insert into public.audit_request_refs (request_table, request_id)
select 'columbarium_requests', id from public.columbarium_requests
on conflict do nothing;

-- Backfill references required by historical service audit rows.
insert into public.audit_request_refs (request_table, request_id)
select distinct table_name, record_id
from public.audit_logs
where table_name = any (
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
on conflict do nothing;

alter table public.audit_logs
  add column if not exists request_ref_id uuid;

alter table public.audit_logs
  add column if not exists changed_by_role text;

update public.audit_logs al
set request_ref_id = arr.ref_id
from public.audit_request_refs arr
where al.request_ref_id is null
  and al.table_name = arr.request_table
  and al.record_id = arr.request_id;

update public.audit_logs
set changed_by_role = coalesce(changed_by_role, 'unknown')
where changed_by_role is null;

alter table public.audit_logs
  alter column request_ref_id set not null;

alter table public.audit_logs
  drop constraint if exists audit_logs_request_ref_fk;

alter table public.audit_logs
  drop constraint if exists audit_logs_request_pair_fk;

alter table public.audit_logs
  add constraint audit_logs_request_pair_fk
  foreign key (table_name, record_id)
  references public.audit_request_refs (request_table, request_id)
  on update restrict
  on delete restrict
  not valid;

alter table public.audit_logs
  validate constraint audit_logs_request_pair_fk;

alter table public.audit_logs
  drop constraint if exists audit_logs_request_ref_id_fk;

alter table public.audit_logs
  add constraint audit_logs_request_ref_id_fk
  foreign key (request_ref_id)
  references public.audit_request_refs (ref_id)
  on update restrict
  on delete restrict
  not valid;

alter table public.audit_logs
  validate constraint audit_logs_request_ref_id_fk;

create or replace function public.log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record_id uuid;
  v_request_ref_id uuid;
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
    v_record_id := case when TG_OP = 'DELETE' then OLD.id else NEW.id end;
  else
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
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

  insert into public.audit_request_refs (request_table, request_id)
  values (TG_TABLE_NAME, v_record_id)
  on conflict (request_table, request_id)
  do update set request_table = excluded.request_table
  returning ref_id into v_request_ref_id;

  if TG_OP = 'INSERT' then
    insert into public.audit_logs (
      table_name,
      record_id,
      request_ref_id,
      action,
      old_data,
      new_data,
      changed_by,
      changed_by_role,
      changed_at
    )
    values (
      TG_TABLE_NAME,
      v_record_id,
      v_request_ref_id,
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
        table_name,
        record_id,
        request_ref_id,
        action,
        old_data,
        new_data,
        changed_by,
        changed_by_role,
        changed_at
      )
      values (
        TG_TABLE_NAME,
        v_record_id,
        v_request_ref_id,
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
      table_name,
      record_id,
      request_ref_id,
      action,
      old_data,
      new_data,
      changed_by,
      changed_by_role,
      changed_at
    )
    values (
      TG_TABLE_NAME,
      v_record_id,
      v_request_ref_id,
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

-- Ensure all service request tables are trigger-bound to backend auditing.
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

-- Keep request_attachments explicitly excluded.
drop trigger if exists trg_audit_request_attachments_changes on public.request_attachments;

create index if not exists idx_audit_logs_request_ref_id
  on public.audit_logs (request_ref_id);

create index if not exists idx_audit_logs_table_record
  on public.audit_logs (table_name, record_id);

create index if not exists idx_audit_logs_changed_at_desc
  on public.audit_logs (changed_at desc);
