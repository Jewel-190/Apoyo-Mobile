-- Drop unified listing facade; clients read `assistance_requests` + embed/join `assistance_services`.
begin;

drop view if exists public.requests_v;

commit;
