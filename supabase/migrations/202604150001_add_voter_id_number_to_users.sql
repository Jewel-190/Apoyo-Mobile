-- Add Voter's ID Number to user profiles.
alter table public.users
  add column if not exists voter_id_number text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_voter_id_number_digits_chk'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_voter_id_number_digits_chk
      check (voter_id_number is null or voter_id_number ~ '^[0-9]+$');
  end if;
end $$;
