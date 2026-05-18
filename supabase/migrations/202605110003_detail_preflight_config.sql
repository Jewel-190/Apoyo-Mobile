-- Preflight UX config for financial / burial-site / cremation detail routes (radio steps + optional HTML reminder).
begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists detail_preflight_config jsonb;

comment on column public.assistance_services.detail_preflight_config is
  'Mobile preflight before RequestInfo: { "version": 1, "reminder_html"?: string, "steps": [{ "id", "prompt", "options": [{ "value", "label" }] }] }.';

update public.assistance_services
set
  detail_preflight_config =
    '{"version":1,"steps":[{"id":"financial_request_type","prompt":"Choose type of Financial Assistance","options":[{"value":"Emergency Need","label":"Emergency Need"},{"value":"Housing/ Property Impact","label":"Housing/ Property Impact"},{"value":"Events/Competition/Participation","label":"Events/Competition/Participation"},{"value":"Burial Support","label":"Burial Support"},{"value":"Other","label":"Other"}]}]}'::jsonb,
  updated_at = now()
where service_key = 'emergency-finance';

update public.assistance_services
set
  detail_preflight_config = $preflight$
{"version":1,"reminder_html":"<p>Selecting Burial Assistance allows you to concurrently apply for Funeral Grant to cover both the plot and the service. Whether you choose burial, cremation, or a columbarium, you may combine these with funeral benefits for full coverage.</p>","steps":[{"id":"funeral_wake","prompt":"Would you like to include funeral and wake services with your request?","options":[{"value":"Add Funeral Aid","label":"Yes, add Funeral Aid"},{"value":"Service Only","label":"No, Service only"}]}]}
$preflight$::jsonb,
  updated_at = now()
where service_key = 'burial-site';

update public.assistance_services
set
  detail_preflight_config = $preflight$
{"version":1,"reminder_html":"<p>Selecting Burial Assistance allows you to concurrently apply for Funeral Grant to cover both the plot and the service. Whether you choose burial, cremation, or a columbarium, you may combine these with funeral benefits for full coverage.</p>","steps":[{"id":"funeral_wake","prompt":"Would you like to include funeral and wake services with your request?","options":[{"value":"Add Funeral Aid","label":"Yes, add Funeral Aid"},{"value":"Service Only","label":"No, Service only"}]},{"id":"niche","prompt":"Will the remains be placed in a columbarium niche?","options":[{"value":"Add Niche Allocation","label":"Yes, add Niche Allocation"},{"value":"Not at this time","label":"Not at this time"}]}]}
$preflight$::jsonb,
  updated_at = now()
where service_key = 'cremation';

commit;
