-- 202605100001_assistance_catalog.sql
-- MODULAR_PLATFORM_PLAN — Phase P0: catalog tables + RLS + seed from canonical mobile registry.
-- Additive only. Does not touch *_requests or request_attachments.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.assistance_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  headline text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistance_services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.assistance_categories (id) on delete restrict,
  service_key text not null unique,
  display_name text not null,
  description_html text not null default '',
  description_font_family text not null default '',
  mobile_image_url text,
  mobile_image_storage_path text,
  reminder_text text not null default '',
  reminder_font_family text not null default '',
  sample_document_image_url text,
  sample_document_name text,
  web_hero_image_url text,
  web_map_link text,
  web_intro_html text,
  web_office_title text,
  sort_order integer not null default 0,
  active boolean not null default true,
  has_details_step boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistance_services_category_id_idx
  on public.assistance_services (category_id);

create table if not exists public.assistance_requirements (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.assistance_services (id) on delete cascade,
  sort_order integer not null default 0,
  title text not null,
  slot_key text not null,
  required boolean not null default true,
  help_html text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, slot_key)
);

create index if not exists assistance_requirements_service_id_idx
  on public.assistance_requirements (service_id);

create table if not exists public.assistance_requirement_tips (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.assistance_requirements (id) on delete cascade,
  sort_order integer not null default 0,
  title text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistance_requirement_tips_requirement_id_idx
  on public.assistance_requirement_tips (requirement_id);

comment on table public.assistance_categories is
  'CMS top-level assistance groupings (Medical / Financial / Burial). MODULAR_PLATFORM_PLAN P0.';
comment on table public.assistance_services is
  'CMS service definitions keyed by service_key (matches mobile ServiceId).';
comment on table public.assistance_requirements is
  'Attachment/document requirements per service; slot_key aligns with request_attachments mechanics.';
comment on table public.assistance_requirement_tips is
  'Tip bullets shown under each requirement in ContentManagement / future mobile UI.';

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.touch_assistance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists assistance_categories_touch on public.assistance_categories;
create trigger assistance_categories_touch
  before update on public.assistance_categories
  for each row execute function public.touch_assistance_updated_at();

drop trigger if exists assistance_services_touch on public.assistance_services;
create trigger assistance_services_touch
  before update on public.assistance_services
  for each row execute function public.touch_assistance_updated_at();

drop trigger if exists assistance_requirements_touch on public.assistance_requirements;
create trigger assistance_requirements_touch
  before update on public.assistance_requirements
  for each row execute function public.touch_assistance_updated_at();

drop trigger if exists assistance_requirement_tips_touch on public.assistance_requirement_tips;
create trigger assistance_requirement_tips_touch
  before update on public.assistance_requirement_tips
  for each row execute function public.touch_assistance_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS (requires public.is_superadmin(uuid) from 202605090001_safe_facade.sql)
-- ---------------------------------------------------------------------------

alter table public.assistance_categories enable row level security;
alter table public.assistance_services enable row level security;
alter table public.assistance_requirements enable row level security;
alter table public.assistance_requirement_tips enable row level security;

grant select on public.assistance_categories to anon, authenticated;
grant select on public.assistance_services to anon, authenticated;
grant select on public.assistance_requirements to anon, authenticated;
grant select on public.assistance_requirement_tips to anon, authenticated;

grant insert, update, delete on public.assistance_categories to authenticated;
grant insert, update, delete on public.assistance_services to authenticated;
grant insert, update, delete on public.assistance_requirements to authenticated;
grant insert, update, delete on public.assistance_requirement_tips to authenticated;

drop policy if exists assistance_categories_select on public.assistance_categories;
create policy assistance_categories_select on public.assistance_categories
  for select to anon, authenticated
  using (active = true or public.is_superadmin(auth.uid()));

drop policy if exists assistance_categories_write on public.assistance_categories;
create policy assistance_categories_write on public.assistance_categories
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

drop policy if exists assistance_services_select on public.assistance_services;
create policy assistance_services_select on public.assistance_services
  for select to anon, authenticated
  using (
    public.is_superadmin(auth.uid())
    or (
      active
      and exists (
        select 1 from public.assistance_categories c
        where c.id = assistance_services.category_id
          and c.active
      )
    )
  );

drop policy if exists assistance_services_write on public.assistance_services;
create policy assistance_services_write on public.assistance_services
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

drop policy if exists assistance_requirements_select on public.assistance_requirements;
create policy assistance_requirements_select on public.assistance_requirements
  for select to anon, authenticated
  using (
    public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.assistance_services s
      join public.assistance_categories c on c.id = s.category_id
      where s.id = assistance_requirements.service_id
        and s.active
        and c.active
    )
  );

drop policy if exists assistance_requirements_write on public.assistance_requirements;
create policy assistance_requirements_write on public.assistance_requirements
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

drop policy if exists assistance_requirement_tips_select on public.assistance_requirement_tips;
create policy assistance_requirement_tips_select on public.assistance_requirement_tips
  for select to anon, authenticated
  using (
    public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.assistance_requirements r
      join public.assistance_services s on s.id = r.service_id
      join public.assistance_categories c on c.id = s.category_id
      where r.id = assistance_requirement_tips.requirement_id
        and s.active
        and c.active
    )
  );

drop policy if exists assistance_requirement_tips_write on public.assistance_requirement_tips;
create policy assistance_requirement_tips_write on public.assistance_requirement_tips
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Seed (idempotent) — mirrors shared/domain/services.ts registry
-- ---------------------------------------------------------------------------

insert into public.assistance_categories (slug, label, headline, sort_order, active)
values
  ('medical', 'Medical', 'Medical Assistance', 1, true),
  ('financial', 'Financial', 'Financial Assistance', 2, true),
  ('burial', 'Burial', 'Burial Assistance', 3, true)
on conflict (slug) do update set
  label = excluded.label,
  headline = excluded.headline,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

insert into public.assistance_services (
  category_id,
  service_key,
  display_name,
  description_html,
  sort_order,
  active,
  has_details_step
)
select
  c.id,
  v.service_key,
  v.display_name,
  v.description_html::text,
  v.sort_order,
  true,
  v.has_details_step
from public.assistance_categories c
join (
  values
    ('medical'::text, 'hospital'::text, 'Hospitalization Expense'::text,
      '<p>Urgent medical aid for hospital confinement and inpatient treatment.</p>'::text,
      1::int, false::boolean),
    ('medical', 'treatment', 'Treatment and Procedures',
      '<p>Support for outpatient treatments, diagnostics, and required procedures.</p>',
      2, false),
    ('medical', 'operations', 'Medical Operations',
      '<p>Financial support for surgeries and medically necessary operations.</p>',
      3, false),
    ('financial', 'emergency-finance', 'Emergency Financial Relief',
      '<p>Immediate aid for qualified urgent financial hardship cases.</p>',
      1, true),
    ('burial', 'burial-money', 'Monetary Burial Aid',
      '<p>Financial assistance toward burial-related expenses.</p>',
      1, false),
    ('burial', 'burial-site', 'Burial Site Assistance',
      '<p>Aid for securing funeral burial plots and related site needs.</p>',
      2, true),
    ('burial', 'cremation', 'Cremation Assistance',
      '<p>Support for qualified cremation costs and related processing fees.</p>',
      3, true),
    ('burial', 'columbarium', 'Columbarium Allocation',
      '<p>Assistance for approved columbarium niche and memorial placement.</p>',
      4, false)
) as v(cat_slug, service_key, display_name, description_html, sort_order, has_details_step)
  on c.slug = v.cat_slug
on conflict (service_key) do update set
  category_id = excluded.category_id,
  display_name = excluded.display_name,
  description_html = excluded.description_html,
  sort_order = excluded.sort_order,
  active = true,
  has_details_step = excluded.has_details_step,
  updated_at = now();

insert into public.assistance_requirements (service_id, sort_order, slot_key, title, required)
select s.id, v.sort_order, v.slot_key, v.title, true
from public.assistance_services s
join (
  values
    ('hospital'::text, 1::int, 'letter'::text, 'Letter of request'::text),
    ('hospital', 2, 'voterId', 'Voter identification'),
    ('hospital', 3, 'barangay', 'Barangay endorsement'),
    ('hospital', 4, 'indigency', 'Certificate of indigency'),
    ('hospital', 5, 'birthCert', 'Birth certificate'),
    ('hospital', 6, 'abstract', 'Medical abstract'),
    ('hospital', 7, 'bill', 'Hospital bill'),
    ('hospital', 8, 'attachment', 'Additional attachment'),
    ('treatment', 1, 'medCert', 'Medical certificate'),
    ('treatment', 2, 'rx', 'Prescription'),
    ('treatment', 3, 'lab', 'Laboratory results'),
    ('treatment', 4, 'letter', 'Letter of request'),
    ('treatment', 5, 'voterId', 'Voter identification'),
    ('treatment', 6, 'birthCert', 'Birth certificate'),
    ('treatment', 7, 'barangay', 'Barangay endorsement'),
    ('treatment', 8, 'indigency', 'Certificate of indigency'),
    ('treatment', 9, 'attachment', 'Additional attachment'),
    ('operations', 1, 'medCert', 'Medical certificate'),
    ('operations', 2, 'prescription', 'Prescription'),
    ('operations', 3, 'quotation', 'Cost quotation'),
    ('operations', 4, 'letter', 'Letter of request'),
    ('operations', 5, 'voterId', 'Voter identification'),
    ('operations', 6, 'birthCert', 'Birth certificate'),
    ('operations', 7, 'barangay', 'Barangay endorsement'),
    ('operations', 8, 'indigency', 'Certificate of indigency'),
    ('operations', 9, 'attachment', 'Additional attachment'),
    ('emergency-finance', 1, 'letter', 'Letter of request'),
    ('emergency-finance', 2, 'voterId', 'Voter identification'),
    ('emergency-finance', 3, 'barangay', 'Barangay endorsement'),
    ('emergency-finance', 4, 'indigency', 'Certificate of indigency'),
    ('emergency-finance', 5, 'validId', 'Valid identification'),
    ('emergency-finance', 6, 'attachment', 'Additional attachment'),
    ('burial-money', 1, 'letter', 'Letter of request'),
    ('burial-money', 2, 'voterId', 'Voter identification'),
    ('burial-money', 3, 'barangay', 'Barangay endorsement'),
    ('burial-money', 4, 'indigency', 'Certificate of indigency'),
    ('burial-money', 5, 'birthCert', 'Birth certificate or valid ID'),
    ('burial-money', 6, 'attachment', 'Additional attachment'),
    ('burial-site', 1, 'deathCert', 'Death certificate'),
    ('burial-site', 2, 'validId', 'Valid identification'),
    ('burial-site', 3, 'barangay', 'Barangay endorsement'),
    ('burial-site', 4, 'indigency', 'Certificate of indigency'),
    ('burial-site', 5, 'attachment', 'Additional attachment'),
    ('cremation', 1, 'deathCert', 'Death certificate'),
    ('cremation', 2, 'validId', 'Valid identification'),
    ('cremation', 3, 'barangay', 'Barangay endorsement'),
    ('cremation', 4, 'indigency', 'Certificate of indigency'),
    ('cremation', 5, 'attachment', 'Additional attachment'),
    ('columbarium', 1, 'deathCert', 'Death certificate'),
    ('columbarium', 2, 'validId', 'Valid identification'),
    ('columbarium', 3, 'cremationCert', 'Cremation certificate'),
    ('columbarium', 4, 'barangay', 'Barangay endorsement'),
    ('columbarium', 5, 'indigency', 'Certificate of indigency'),
    ('columbarium', 6, 'attachment', 'Additional attachment')
) as v(service_key, sort_order, slot_key, title)
  on s.service_key = v.service_key
on conflict (service_id, slot_key) do update set
  sort_order = excluded.sort_order,
  title = excluded.title,
  required = excluded.required,
  updated_at = now();

insert into public.assistance_requirement_tips (requirement_id, sort_order, title, description)
select r.id, 1, 'Reminder',
  'Upload a clear photo or PDF when submitting this requirement.'
from public.assistance_requirements r
where not exists (
  select 1 from public.assistance_requirement_tips t where t.requirement_id = r.id
);

commit;
