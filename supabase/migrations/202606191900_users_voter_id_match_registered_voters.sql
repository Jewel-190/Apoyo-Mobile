-- Align users.voter_id_number with registered_voters.voter_id (4-5-13-1 alphanumeric, not digits-only).

begin;

set search_path = public, private;

alter table public.users
  drop constraint if exists users_voter_id_number_digits_chk;

alter table public.users
  drop constraint if exists users_voter_id_number_format_chk;

-- Repair legacy rows before applying the registered_voters format check.
update public.users u
set voter_id_number = rv.voter_id
from public.registered_voters rv
where u.registered_voter_id = rv.id
  and (
    u.voter_id_number is null
    or u.voter_id_number !~ '^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$'
  );

update public.users
set voter_id_number = null
where voter_id_number is not null
  and voter_id_number !~ '^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$';

alter table public.users
  add constraint users_voter_id_number_format_chk
  check (
    voter_id_number is null
    or voter_id_number ~ '^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$'
  );

comment on constraint users_voter_id_number_format_chk on public.users is
  'Same 4-5-13-1 format as public.registered_voters.voter_id (registered_voters_voter_id_format_chk).';

create or replace function public.finalize_registration_profile(
  p_attempt_token uuid,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_suffix text,
  p_contact_number text,
  p_email text,
  p_voter_id_number text,
  p_address text,
  p_birth_date text,
  p_sex text,
  p_registered_voter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid;
  v_email text;
  v_latest_token uuid;
  v_token_exists boolean;
  v_not_consumed boolean;
  v_birth_date date;
  v_rv public.registered_voters%rowtype;
  v_submitted_voter_id text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  if p_registered_voter_id is null then
    raise exception 'Registered voter verification is required';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  select ra.attempt_token
    into v_latest_token
  from private.registration_attempts ra
  where ra.email = v_email
    and ra.expires_at > now()
  order by ra.created_at desc
  limit 1;

  if v_latest_token is null then
    raise exception 'No active registration attempt found';
  end if;

  if v_latest_token <> p_attempt_token then
    raise exception 'Registration attempt is outdated. Please restart registration.';
  end if;

  select exists (
    select 1
    from private.registration_attempts
    where attempt_token = p_attempt_token
      and email = v_email
  ) into v_token_exists;

  if not v_token_exists then
    raise exception 'Invalid registration attempt token';
  end if;

  select exists (
    select 1
    from private.registration_attempts
    where attempt_token = p_attempt_token
      and consumed_at is null
  ) into v_not_consumed;

  if not v_not_consumed then
    raise exception 'Registration attempt token already used';
  end if;

  v_birth_date := (nullif(trim(coalesce(p_birth_date, '')), ''))::date;

  select *
    into v_rv
  from public.registered_voters rv
  where rv.id = p_registered_voter_id;

  if not found then
    raise exception 'Invalid registered voter reference';
  end if;

  if private.normalize_registration_name(v_rv.first_name) <> private.normalize_registration_name(p_first_name)
    or private.normalize_registration_name(v_rv.middle_name) <> private.normalize_registration_name(p_middle_name)
    or private.normalize_registration_name(v_rv.last_name) <> private.normalize_registration_name(p_last_name)
    or private.normalize_registration_name(v_rv.suffix) <> private.normalize_registration_name(p_suffix)
    or v_rv.birth_date <> v_birth_date
    or v_rv.sex <> upper(trim(coalesce(p_sex, '')))::char(1)
  then
    raise exception 'registration_voter_registry_mismatch';
  end if;

  v_submitted_voter_id := private.normalize_voter_id(p_voter_id_number);

  if v_submitted_voter_id = '' or length(v_submitted_voter_id) <> 23 then
    raise exception 'Voter ID Number must use the full format 0000-00000-0000000000000-0';
  end if;

  if private.normalize_voter_id(v_rv.voter_id) <> v_submitted_voter_id then
    raise exception 'registration_voter_registry_mismatch';
  end if;

  if exists (
    select 1
    from public.users u
    where u.registered_voter_id = p_registered_voter_id
      and u.id <> v_uid
  ) then
    raise exception 'registration_voter_registry_mismatch';
  end if;

  insert into public.users (
    id,
    first_name,
    middle_name,
    last_name,
    suffix,
    contact_number,
    email,
    voter_id_number,
    address,
    birth_date,
    sex,
    registered_voter_id
  )
  values (
    v_uid,
    p_first_name,
    p_middle_name,
    p_last_name,
    p_suffix,
    p_contact_number,
    v_email,
    v_rv.voter_id,
    p_address,
    v_birth_date,
    p_sex,
    p_registered_voter_id
  )
  on conflict (id) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    suffix = excluded.suffix,
    contact_number = excluded.contact_number,
    email = excluded.email,
    voter_id_number = excluded.voter_id_number,
    address = excluded.address,
    birth_date = excluded.birth_date,
    sex = excluded.sex,
    registered_voter_id = excluded.registered_voter_id;

  update private.registration_attempts
  set consumed_at = now()
  where attempt_token = p_attempt_token;

  return v_uid;
end;
$$;

comment on function public.finalize_registration_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid
) is
  'Completes signup; persists registered_voters.voter_id verbatim in users.voter_id_number.';

commit;
