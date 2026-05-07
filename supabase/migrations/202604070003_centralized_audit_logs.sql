-- Centralized audit logging for critical request tables.
-- Captures full old/new row snapshots for INSERT/UPDATE/DELETE.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace function public.log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record_id uuid;
  v_changed_by uuid;
  v_claim_sub text;
begin
  if TG_TABLE_NAME = 'hospitalization_requests' then
    v_record_id := case when TG_OP = 'DELETE' then OLD.id else NEW.id end;
  elsif TG_TABLE_NAME = 'request_attachments' then
    v_record_id := case when TG_OP = 'DELETE' then OLD.uid else NEW.uid end;
  else
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  v_claim_sub := current_setting('request.jwt.claim.sub', true);
  if v_claim_sub is not null
     and v_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_changed_by := v_claim_sub::uuid;
  else
    v_changed_by := null;
  end if;

  if TG_OP = 'INSERT' then
    if v_record_id is not null then
      insert into public.audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        changed_at
      )
      values (
        TG_TABLE_NAME,
        v_record_id,
        'INSERT',
        null,
        to_jsonb(NEW),
        v_changed_by,
        now()
      );
    end if;

    return NEW;
  elsif TG_OP = 'UPDATE' then
    if row_to_json(OLD) is distinct from row_to_json(NEW) then
      if v_record_id is not null then
        insert into public.audit_logs (
          table_name,
          record_id,
          action,
          old_data,
          new_data,
          changed_by,
          changed_at
        )
        values (
          TG_TABLE_NAME,
          v_record_id,
          'UPDATE',
          to_jsonb(OLD),
          to_jsonb(NEW),
          v_changed_by,
          now()
        );
      end if;
    end if;

    return NEW;
  elsif TG_OP = 'DELETE' then
    if v_record_id is not null then
      insert into public.audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        changed_at
      )
      values (
        TG_TABLE_NAME,
        v_record_id,
        'DELETE',
        to_jsonb(OLD),
        null,
        v_changed_by,
        now()
      );
    end if;

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

drop trigger if exists trg_audit_hospitalization_requests_changes on public.hospitalization_requests;
create trigger trg_audit_hospitalization_requests_changes
after insert or update or delete on public.hospitalization_requests
for each row execute function public.log_changes();

drop trigger if exists trg_audit_request_attachments_changes on public.request_attachments;
create trigger trg_audit_request_attachments_changes
after insert or update or delete on public.request_attachments
for each row execute function public.log_changes();

create index if not exists idx_audit_logs_table_record
  on public.audit_logs (table_name, record_id);

create index if not exists idx_audit_logs_changed_at_desc
  on public.audit_logs (changed_at desc);
