-- Request code system for service request tables
-- Format: <CODE>-<MMYY>-<SEQUENCE>
-- Example: HOSP-0326-000001

begin;

-- 1) Add new request_code column (UUID primary keys remain unchanged)
alter table if exists public.hospitalization_requests add column if not exists request_code text;
alter table if exists public.treatment_requests add column if not exists request_code text;
alter table if exists public.medical_requests add column if not exists request_code text;
alter table if exists public.financial_requests add column if not exists request_code text;
alter table if exists public.monetary_requests add column if not exists request_code text;
alter table if exists public.burial_requests add column if not exists request_code text;
alter table if exists public.cremation_requests add column if not exists request_code text;
alter table if exists public.columbarium_requests add column if not exists request_code text;

-- 2) Unique indexes for request_code (nulls allowed for drafts)
create unique index if not exists hospitalization_requests_request_code_uq
  on public.hospitalization_requests (request_code)
  where request_code is not null;

create unique index if not exists treatment_requests_request_code_uq
  on public.treatment_requests (request_code)
  where request_code is not null;

create unique index if not exists medical_requests_request_code_uq
  on public.medical_requests (request_code)
  where request_code is not null;

create unique index if not exists financial_requests_request_code_uq
  on public.financial_requests (request_code)
  where request_code is not null;

create unique index if not exists monetary_requests_request_code_uq
  on public.monetary_requests (request_code)
  where request_code is not null;

create unique index if not exists burial_requests_request_code_uq
  on public.burial_requests (request_code)
  where request_code is not null;

create unique index if not exists cremation_requests_request_code_uq
  on public.cremation_requests (request_code)
  where request_code is not null;

create unique index if not exists columbarium_requests_request_code_uq
  on public.columbarium_requests (request_code)
  where request_code is not null;

-- 3) Sequence per service
create sequence if not exists public.hospitalization_request_code_seq;
create sequence if not exists public.treatment_request_code_seq;
create sequence if not exists public.medical_request_code_seq;
create sequence if not exists public.financial_request_code_seq;
create sequence if not exists public.monetary_request_code_seq;
create sequence if not exists public.burial_request_code_seq;
create sequence if not exists public.cremation_request_code_seq;
create sequence if not exists public.columbarium_request_code_seq;

-- Shared formatter
create or replace function public.format_request_code(
  p_code text,
  p_ts timestamptz,
  p_seq bigint
)
returns text
language sql
immutable
as $$
  select upper(coalesce(p_code, ''))
         || '-' || to_char(p_ts, 'MMYY')
         || '-' || lpad(p_seq::text, 6, '0');
$$;

-- 4) Per-service generator functions
create or replace function public.generate_hospitalization_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.hospitalization_request_code_seq');
  return public.format_request_code('HOSP', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_treatment_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.treatment_request_code_seq');
  return public.format_request_code('TREAT', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_medical_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.medical_request_code_seq');
  return public.format_request_code('MED', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_financial_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.financial_request_code_seq');
  return public.format_request_code('FIN', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_monetary_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.monetary_request_code_seq');
  return public.format_request_code('MON', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_burial_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.burial_request_code_seq');
  return public.format_request_code('BUR', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_cremation_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.cremation_request_code_seq');
  return public.format_request_code('CREM', coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_columbarium_request_code(
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.columbarium_request_code_seq');
  return public.format_request_code('COLU', coalesce(p_ts, now()), v_seq);
end;
$$;

-- 5) Per-table trigger functions (draft -> pending)
create or replace function public.set_hospitalization_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_hospitalization_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

create or replace function public.set_treatment_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_treatment_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

create or replace function public.set_medical_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_medical_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

create or replace function public.set_financial_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_financial_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

create or replace function public.set_monetary_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_monetary_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

create or replace function public.set_burial_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_burial_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

create or replace function public.set_cremation_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_cremation_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

create or replace function public.set_columbarium_request_code()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_columbarium_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;

-- 6) Triggers (BEFORE UPDATE)
drop trigger if exists trg_hospitalization_request_code on public.hospitalization_requests;
create trigger trg_hospitalization_request_code
before update on public.hospitalization_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_hospitalization_request_code();

drop trigger if exists trg_treatment_request_code on public.treatment_requests;
create trigger trg_treatment_request_code
before update on public.treatment_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_treatment_request_code();

drop trigger if exists trg_medical_request_code on public.medical_requests;
create trigger trg_medical_request_code
before update on public.medical_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_medical_request_code();

drop trigger if exists trg_financial_request_code on public.financial_requests;
create trigger trg_financial_request_code
before update on public.financial_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_financial_request_code();

drop trigger if exists trg_monetary_request_code on public.monetary_requests;
create trigger trg_monetary_request_code
before update on public.monetary_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_monetary_request_code();

drop trigger if exists trg_burial_request_code on public.burial_requests;
create trigger trg_burial_request_code
before update on public.burial_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_burial_request_code();

drop trigger if exists trg_cremation_request_code on public.cremation_requests;
create trigger trg_cremation_request_code
before update on public.cremation_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_cremation_request_code();

drop trigger if exists trg_columbarium_request_code on public.columbarium_requests;
create trigger trg_columbarium_request_code
before update on public.columbarium_requests
for each row
when (
  lower(coalesce(old.status, '')) = 'draft'
  and lower(coalesce(new.status, '')) = 'pending'
  and new.request_code is null
)
execute function public.set_columbarium_request_code();

-- 7) Reusable fallback RPC for edge function calls
create or replace function public.generate_request_code_for_service(
  p_service text,
  p_timestamp timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service text := lower(trim(coalesce(p_service, '')));
begin
  case v_service
    when 'hospitalizationreq', 'hospitalization', 'hosp', 'hospitalization_requests' then
      return public.generate_hospitalization_request_code(p_timestamp);
    when 'treatmentreq', 'treatment', 'treat', 'treatment_requests' then
      return public.generate_treatment_request_code(p_timestamp);
    when 'medicalreq', 'medical', 'med', 'medical_requests' then
      return public.generate_medical_request_code(p_timestamp);
    when 'financialreq', 'financial', 'fin', 'financial_requests' then
      return public.generate_financial_request_code(p_timestamp);
    when 'monetaryreq', 'monetary', 'mon', 'monetary_requests' then
      return public.generate_monetary_request_code(p_timestamp);
    when 'burialreq', 'burial', 'bur', 'burial_requests' then
      return public.generate_burial_request_code(p_timestamp);
    when 'cremationreq', 'cremation', 'crem', 'cremation_requests' then
      return public.generate_cremation_request_code(p_timestamp);
    when 'columbariumreq', 'columbarium', 'colombarium', 'colu', 'columbarium_requests' then
      return public.generate_columbarium_request_code(p_timestamp);
    else
      raise exception 'Unsupported service type: %', p_service using errcode = '22023';
  end case;
end;
$$;

grant execute on function public.generate_request_code_for_service(text, timestamptz) to service_role;

commit;
