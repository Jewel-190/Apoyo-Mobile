-- Drops CMS placeholder columns on assistance_services that are unused by the
-- mobile app and unreferenced in tracked SQL/RPCs in this repo (verified via
-- live introspection + codebase search, 2026-05-12).
--
-- KEPT on purpose:
--   - web_intro_html — used by app/Home/request/RequestInfo.tsx (preflight intro).
--   - All other live columns — referenced by catalog fetch, triggers, or FK graph.
--
-- If another workspace (e.g. web admin) still needs any dropped column, restore
-- from backup or re-add via a follow-up migration.

begin;

set search_path = public;

alter table public.assistance_services
  drop column if exists description_font_family,
  drop column if exists reminder_font_family,
  drop column if exists mobile_image_storage_path,
  drop column if exists sample_document_image_url,
  drop column if exists sample_document_name,
  drop column if exists web_hero_image_url,
  drop column if exists web_map_link,
  drop column if exists web_office_title;

commit;
