-- `reminder_text` stores CMS rich text (HTML) for the mobile RequestInfo reminder panel.
-- Legacy plain-text values remain valid; the app wraps them as paragraphs at render time.

comment on column public.assistance_services.reminder_text is
  'Mobile reminder copy (HTML). Supports tags such as p, strong, em, ul/ol/li, br, and links. Plain text is still accepted.';
