-- Per-category UI tokens for mobile (Home filters, card accents, Status card headers).

begin;

set search_path = public;

alter table public.assistance_categories
  add column if not exists theme_json jsonb not null default '{}'::jsonb;

comment on column public.assistance_categories.theme_json is
  'Mobile UI tokens: home_card_stripe_gradient, status_card_header_gradient, '
  'home_chip_active_gradient (each [hex, hex]). Omitted keys use slug-based defaults in the app.';

update public.assistance_categories c
set
  theme_json =
    case c.slug
      when 'medical' then
        '{
          "home_card_stripe_gradient": ["#12B4D8", "#2AC8EE"],
          "status_card_header_gradient": ["#12B4D8", "#2AC8EE"],
          "home_chip_active_gradient": ["#12B4D8", "#2AC8EE"]
        }'::jsonb
      when 'financial' then
        '{
          "home_card_stripe_gradient": ["#F6D34D", "#F2B600"],
          "status_card_header_gradient": ["#F6D34D", "#F2B600"],
          "home_chip_active_gradient": ["#F6D34D", "#F2B600"]
        }'::jsonb
      when 'burial' then
        '{
          "home_card_stripe_gradient": ["#7C3AED", "#EC4899"],
          "status_card_header_gradient": ["#FF2DF7", "#7B61FF"],
          "home_chip_active_gradient": ["#7C3AED", "#EC4899"]
        }'::jsonb
      else c.theme_json
    end,
  updated_at = now()
where c.slug in ('medical', 'financial', 'burial');

commit;
