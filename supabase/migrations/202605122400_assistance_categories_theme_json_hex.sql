-- `theme_json` becomes a single `#RRGGBB` accent; gradients are derived in the app.

begin;

set search_path = public;

alter table public.assistance_categories
  alter column theme_json drop default;

alter table public.assistance_categories
  alter column theme_json type text
  using (
    case
      when jsonb_typeof(theme_json) = 'string'
        and trim(theme_json #>> '{}') ~ '^#[0-9a-fA-F]{6}$'
        then trim(theme_json #>> '{}')
      when jsonb_typeof(theme_json) = 'object'
        and coalesce(
          nullif(trim(theme_json #>> '{home_card_stripe_gradient,0}'), ''),
          nullif(trim(theme_json #>> '{homeCardStripeGradient,0}'), '')
        )
        ~ '^#[0-9a-fA-F]{6}$'
        then coalesce(
          nullif(trim(theme_json #>> '{home_card_stripe_gradient,0}'), ''),
          nullif(trim(theme_json #>> '{homeCardStripeGradient,0}'), '')
        )
      when slug = 'medical' then '#12B4D8'
      when slug = 'financial' then '#F6D34D'
      when slug = 'burial' then '#7C3AED'
      else '#6B7280'
    end
  );

alter table public.assistance_categories
  alter column theme_json set default '#6B7280';

comment on column public.assistance_categories.theme_json is
  'Single category accent as `#RRGGBB`. Gradients and chips are derived in the mobile app.';

commit;
