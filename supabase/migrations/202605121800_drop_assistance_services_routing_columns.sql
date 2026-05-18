-- Routing + mobile chrome columns moved to app (`AppCore/ServiceMobileMetadata.ts`).
-- DB keeps user-facing CMS copy, images, preflight JSON, attachment_slot_map, etc.

begin;

set search_path = public;

alter table public.assistance_services
  drop column if exists mobile_details_route_path,
  drop column if exists mobile_request_screen_path,
  drop column if exists mobile_submission_success_path,
  drop column if exists mobile_application_code_prefix,
  drop column if exists mobile_success_dedupe_suffix,
  drop column if exists mobile_success_heading;

commit;
