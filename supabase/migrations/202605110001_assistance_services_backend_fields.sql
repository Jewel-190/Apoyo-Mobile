-- Adds backend routing + long-form CMS fields so mobile can drop hardcoded service manifests.
begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists request_table text;

alter table public.assistance_services
  add column if not exists about_html text not null default '';

alter table public.assistance_services
  add column if not exists who_bullets jsonb not null default '[]'::jsonb;

comment on column public.assistance_services.request_table is
  'Postgres *_requests table name for this service (matches request_attachments.request_table).';

comment on column public.assistance_services.about_html is
  'Rich “About service” body on mobile detail modal; falls back to description_html when blank.';

comment on column public.assistance_services.who_bullets is
  'JSON array of strings for “Who may avail”; empty means hide section on mobile.';

-- Backfill routing + narrative copy (mirrors prior Home.tsx hardcoding).
update public.assistance_services s
set
  request_table = v.rt,
  about_html = case
    when nullif(trim(s.about_html), '') is not null then s.about_html
    else v.about_html
  end,
  who_bullets = case
    when coalesce(jsonb_array_length(s.who_bullets), 0) > 0 then s.who_bullets
    else v.who_bullets
  end,
  updated_at = now()
from (
  values
    (
      'hospital'::text,
      'hospitalization_requests'::text,
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p>'::text,
      '["Individuals and families with inadequate resources."]'::jsonb
    ),
    (
      'treatment',
      'treatment_requests',
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p>',
      '["Individuals and families with inadequate resources."]'::jsonb
    ),
    (
      'operations',
      'medical_requests',
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p>',
      '["Individuals and families with inadequate resources."]'::jsonb
    ),
    (
      'emergency-finance',
      'financial_requests',
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p>',
      '["Individuals and families with inadequate resources."]'::jsonb
    ),
    (
      'burial-money',
      'monetary_requests',
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p>',
      '["Immediate family members of the deceased with inadequate resources."]'::jsonb
    ),
    (
      'burial-site',
      'burial_requests',
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p>',
      '["Individuals and families with inadequate resources."]'::jsonb
    ),
    (
      'cremation',
      'cremation_requests',
      '<p>The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.</p>',
      '["Immediate family members with inadequate resources."]'::jsonb
    ),
    (
      'columbarium',
      'columbarium_requests',
      '<p>Panteon de Dasmariñas Public Cemetery</p><p>Provides essential burial and cremation services for city residents. It offers a dignified public cemetery for families seeking a final resting place. This facility ensures accessible and organized options for those in need of assistance.</p>',
      '["Immediate family members with inadequate resources."]'::jsonb
    )
) as v(service_key, rt, about_html, who_bullets)
where s.service_key = v.service_key;

-- Default reminders (detail modal) when CMS left them blank.
update public.assistance_services s
set reminder_text = v.reminder_text, updated_at = now()
from (
  values
    (
      'hospital'::text,
      'The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)'::text
    ),
    (
      'treatment',
      'The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)'
    ),
    (
      'operations',
      'The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)'
    ),
    (
      'emergency-finance',
      'Requests must be filed by the concerned individual or an immediate family member residing in the same household, and supporting documents must be complete upon submission.'
    ),
    (
      'burial-money',
      'For burial assistance, the request must be processed by an immediate family member, and documents must be consistent with the deceased''s records.'
    ),
    (
      'burial-site',
      'Requests must be filed by an immediate family member and documents must be complete upon submission.'
    ),
    (
      'cremation',
      'Requests must be filed by an immediate family member and documents must be complete upon submission.'
    ),
    (
      'columbarium',
      'Requests must be filed by an immediate family member and documents must be complete upon submission.'
    )
) as v(service_key, reminder_text)
where s.service_key = v.service_key
  and nullif(trim(s.reminder_text), '') is null;

alter table public.assistance_services
  alter column request_table set not null;

alter table public.assistance_services
  drop constraint if exists assistance_services_request_table_chk;

alter table public.assistance_services
  add constraint assistance_services_request_table_chk check (
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
  );

commit;
