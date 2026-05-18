-- CMS-owned expo pathnames for “shaped” /Home/<Segment>/<Screen> URLs (no service enums in app TS).
begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists mobile_request_screen_path text;

alter table public.assistance_services
  add column if not exists mobile_submission_success_path text;

comment on column public.assistance_services.mobile_request_screen_path is
  'Optional expo pathname, e.g. /Home/Hospitalization/HospitalizationReq. Null ⇒ app uses /Home/request/[service_key].';

comment on column public.assistance_services.mobile_submission_success_path is
  'Optional expo pathname for post-submit screen (typically …/SubmissionSuccess). Null ⇒ app uses /Home/request/[service_key]/SubmissionSuccess.';

update public.assistance_services s
set
  mobile_request_screen_path = v.req,
  mobile_submission_success_path = v.succ,
  updated_at = now()
from (
  values
    ('hospital'::text, '/Home/Hospitalization/HospitalizationReq'::text, '/Home/Hospitalization/SubmissionSuccess'::text),
    ('treatment', '/Home/Treatment/TreatmentReq', '/Home/Treatment/SubmissionSuccess'),
    ('operations', '/Home/Medical/MedicalReq', '/Home/Medical/SubmissionSuccess'),
    ('emergency-finance', '/Home/Financial/FinancialReq', '/Home/Financial/SubmissionSuccess'),
    ('burial-money', '/Home/Monetary/MonetaryReq', '/Home/Monetary/SubmissionSuccess'),
    ('burial-site', '/Home/Burial/BurialReq', '/Home/Burial/SubmissionSuccess'),
    ('cremation', '/Home/Cremation/CremationReq', '/Home/Cremation/SubmissionSuccess'),
    ('columbarium', '/Home/Columbarium/ColumbariumReq', '/Home/Columbarium/SubmissionSuccess')
) as v(service_key, req, succ)
where s.service_key = v.service_key;

commit;
