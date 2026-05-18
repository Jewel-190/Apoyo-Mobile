-- Mobile catalog runtime: route segments + alternate URL keys (no hardcoded service maps in app).
begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists mobile_details_route_path text;

alter table public.assistance_services
  add column if not exists service_key_aliases text[] not null default '{}'::text[];

comment on column public.assistance_services.mobile_details_route_path is
  'Path under /Home/request/ when preflight applies, e.g. preflight/emergency-finance; null otherwise.';

comment on column public.assistance_services.service_key_aliases is
  'Alternate keys resolving to this service (e.g. historical typos). Lowercase in app.';

update public.assistance_services s
set mobile_details_route_path = v.path, updated_at = now()
from (
  values
    ('emergency-finance'::text, 'preflight/emergency-finance'::text),
    ('burial-site', 'preflight/burial-site'),
    ('cremation', 'preflight/cremation')
) as v(service_key, path)
where s.service_key = v.service_key;

update public.assistance_services s
set mobile_details_route_path = null, updated_at = now()
where coalesce(s.has_details_step, false) = false;

update public.assistance_services s
set service_key_aliases = array['colombarium']::text[], updated_at = now()
where s.service_key = 'columbarium';

-- Legacy Status / deep-link tokens → canonical service_key (no hardcoded maps in app).
update public.assistance_services s
set service_key_aliases = service_key_aliases || '{hospitalization}'::text[], updated_at = now()
where s.service_key = 'hospital';

update public.assistance_services s
set service_key_aliases = service_key_aliases || '{medical}'::text[], updated_at = now()
where s.service_key = 'operations';

update public.assistance_services s
set service_key_aliases = service_key_aliases || '{financial}'::text[], updated_at = now()
where s.service_key = 'emergency-finance';

update public.assistance_services s
set service_key_aliases = service_key_aliases || '{monetary}'::text[], updated_at = now()
where s.service_key = 'burial-money';

update public.assistance_services s
set service_key_aliases = service_key_aliases || '{burial}'::text[], updated_at = now()
where s.service_key = 'burial-site';

commit;
