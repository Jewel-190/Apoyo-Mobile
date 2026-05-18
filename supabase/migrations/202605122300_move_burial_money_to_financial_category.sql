-- Point `burial-money` at the Financial assistance category (`category_id` → financial row).
-- `service_key` stays `burial-money`; only the FK to `assistance_categories` changes.

begin;

set search_path = public;

update public.assistance_services
set
  category_id = (
    select id
    from public.assistance_categories
    where slug = 'financial'
    limit 1
  ),
  updated_at = now()
where service_key = 'burial-money'
  and exists (
    select 1
    from public.assistance_categories
    where slug = 'financial'
  );

commit;
