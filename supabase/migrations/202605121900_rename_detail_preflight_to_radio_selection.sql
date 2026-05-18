-- Rename preflight JSON column to a mobile-facing name.

begin;

set search_path = public;

alter table public.assistance_services
  rename column detail_preflight_config to radio_selection;

comment on column public.assistance_services.radio_selection is
  'Mobile preflight radio steps JSON: { "version": 1, "reminder_html"?: string, "steps": [{ "id", "prompt", "options": [{ "value", "label" }] }] }.';

commit;
