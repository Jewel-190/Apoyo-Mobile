-- public.users.birth_date is type date; inserting plain text fails. Cast RPC input at write time.

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
  p_sex text
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
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized';
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
    sex
  )
  values (
    v_uid,
    p_first_name,
    p_middle_name,
    p_last_name,
    p_suffix,
    p_contact_number,
    v_email,
    p_voter_id_number,
    p_address,
    v_birth_date,
    p_sex
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
    sex = excluded.sex;

  update private.registration_attempts
  set consumed_at = now()
  where attempt_token = p_attempt_token;

  return v_uid;
end;
$$;
