-- Link public.users to public.registered_voters (one Apoyo account per registry row).

begin;

set search_path = public, private;

create or replace function private.normalize_voter_id(p text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

alter table public.users
  add column if not exists registered_voter_id uuid references public.registered_voters (id);

comment on column public.users.registered_voter_id is
  'FK to the Dasmariñas registered voter row verified at signup. At most one Apoyo account per voter.';

create unique index if not exists users_registered_voter_id_unique
  on public.users (registered_voter_id)
  where registered_voter_id is not null;

-- Return matched registry id for mobile step 0.
create or replace function public.verify_registered_voter_for_registration(
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_suffix text,
  p_birth_date text,
  p_sex text,
  p_barangay_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_first text;
  v_middle text;
  v_last text;
  v_suffix text;
  v_sex char(1);
  v_birth date;
  v_match_count int;
  v_registered_voter_id uuid;
begin
  v_first := private.normalize_registration_name(p_first_name);
  v_middle := private.normalize_registration_name(p_middle_name);
  v_last := private.normalize_registration_name(p_last_name);
  v_suffix := private.normalize_registration_name(p_suffix);

  if v_first = '' or v_last = '' then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please enter your first and last name as they appear on your voter registration.'
    );
  end if;

  if p_barangay_id is null then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please select your barangay.'
    );
  end if;

  v_sex := upper(trim(coalesce(p_sex, '')))::char(1);
  if v_sex is null or v_sex not in ('M', 'F') then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please select your sex as it appears on your voter registration.'
    );
  end if;

  begin
    v_birth := nullif(trim(coalesce(p_birth_date, '')), '')::date;
  exception
    when others then
      return jsonb_build_object(
        'matched', false,
        'message', 'Please enter a valid birth date.'
      );
  end;

  if v_birth is null then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please enter your birth date as it appears on your voter registration.'
    );
  end if;

  if v_birth > current_date then
    return jsonb_build_object(
      'matched', false,
      'message', 'Birth date cannot be in the future.'
    );
  end if;

  select count(*)::int
    into v_match_count
  from public.registered_voters rv
  where private.normalize_registration_name(rv.first_name) = v_first
    and private.normalize_registration_name(rv.middle_name) = v_middle
    and private.normalize_registration_name(rv.last_name) = v_last
    and private.normalize_registration_name(rv.suffix) = v_suffix
    and rv.birth_date = v_birth
    and rv.sex = v_sex
    and rv.barangay_id = p_barangay_id;

  if v_match_count = 0 then
    return jsonb_build_object(
      'matched', false,
      'message', 'We could not find your information in the Dasmariñas City registered voter list. Only registered voters may create an Apoyo account. Please review your details and try again, or visit your barangay office if you believe this is an error.'
    );
  end if;

  if v_match_count > 1 then
    return jsonb_build_object(
      'matched', false,
      'message', 'We could not verify your voter registration. Please contact your barangay office for assistance.'
    );
  end if;

  select rv.id
    into v_registered_voter_id
  from public.registered_voters rv
  where private.normalize_registration_name(rv.first_name) = v_first
    and private.normalize_registration_name(rv.middle_name) = v_middle
    and private.normalize_registration_name(rv.last_name) = v_last
    and private.normalize_registration_name(rv.suffix) = v_suffix
    and rv.birth_date = v_birth
    and rv.sex = v_sex
    and rv.barangay_id = p_barangay_id
  limit 1;

  if exists (
    select 1
    from public.users u
    where u.registered_voter_id = v_registered_voter_id
  ) then
    return jsonb_build_object(
      'matched', false,
      'message', 'An Apoyo account is already linked to this voter registration. Please log in instead.'
    );
  end if;

  return jsonb_build_object(
    'matched', true,
    'registered_voter_id', v_registered_voter_id
  );
end;
$$;

drop function if exists public.finalize_registration_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

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
    raise exception 'Profile details do not match the registered voter record';
  end if;

  v_submitted_voter_id := private.normalize_voter_id(p_voter_id_number);
  if v_submitted_voter_id = '' then
    raise exception 'Voter ID Number is required';
  end if;

  if private.normalize_voter_id(v_rv.voter_id) <> v_submitted_voter_id then
    raise exception 'Voter ID Number does not match the registered voter record';
  end if;

  if exists (
    select 1
    from public.users u
    where u.registered_voter_id = p_registered_voter_id
      and u.id <> v_uid
  ) then
    raise exception 'An Apoyo account is already linked to this voter registration';
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

revoke all on function public.finalize_registration_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid
) from public;

grant execute on function public.finalize_registration_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid
) to authenticated;

commit;
