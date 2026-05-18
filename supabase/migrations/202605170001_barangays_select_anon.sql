-- Allow unauthenticated clients to read the barangay catalog during registration.

begin;

alter table public.barangays enable row level security;

drop policy if exists barangays_select_anon on public.barangays;
create policy barangays_select_anon on public.barangays
  for select
  to anon
  using (true);

grant select on public.barangays to anon;

commit;
