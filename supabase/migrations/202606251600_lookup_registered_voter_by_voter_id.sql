-- Allow mobile registration Step 0 to look up a registered_voters row by voter_id
-- even when registered_voters is protected by RLS (superadmin only).

begin;

set search_path = public, private;

create or replace function public.lookup_registered_voter_by_voter_id(p_voter_id text)
returns table (
  id uuid,
  voter_id text,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  birth_date date,
  sex text,
  barangay_id uuid
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    rv.id,
    rv.voter_id,
    rv.first_name,
    rv.middle_name,
    rv.last_name,
    rv.suffix,
    rv.birth_date,
    rv.sex,
    rv.barangay_id
  from public.registered_voters rv
  where private.normalize_voter_id(rv.voter_id) = private.normalize_voter_id(p_voter_id)
  limit 1;
$$;

revoke all on function public.lookup_registered_voter_by_voter_id(text) from public;
grant execute on function public.lookup_registered_voter_by_voter_id(text) to anon, authenticated;

comment on function public.lookup_registered_voter_by_voter_id(text) is
  'Registration helper (SECURITY DEFINER): returns one registered_voters row for a voter_id using private.normalize_voter_id().';

commit;

