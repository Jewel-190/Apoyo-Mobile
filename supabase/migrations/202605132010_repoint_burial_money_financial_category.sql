-- Ensure Monetary Burial Aid (`burial-money`) is filed under the Financial category.
-- Idempotent with `202605122300_move_burial_money_to_financial_category.sql`; targets this row by id and by `service_key`.

begin;

set search_path = public;

update public.assistance_services s
set
  category_id = c.id,
  updated_at = now()
from public.assistance_categories c
where c.slug = 'financial'
  and (
    s.id = '761b98a2-35c0-4a08-91b6-eb0a13cfa43d'
    or s.service_key = 'burial-money'
  );

commit;
