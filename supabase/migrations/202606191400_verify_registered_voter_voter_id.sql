-- Optional voter ID cross-match at registration step 0.

begin;

set search_path = public, private;

drop function if exists public.verify_registered_voter_for_registration(
  text, text, text, text, text, text, uuid
);

create or replace function public.verify_registered_voter_for_registration(
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_suffix text,
  p_birth_date text,
  p_sex text,
  p_barangay_id uuid,
  p_voter_id_number text default ''
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
  v_voter_id text;
  v_match_count int;
  v_base_count int;
  v_registered_voter_id uuid;
begin
  v_first := private.normalize_registration_name(p_first_name);
  v_middle := private.normalize_registration_name(p_middle_name);
  v_last := private.normalize_registration_name(p_last_name);
  v_suffix := private.normalize_registration_name(p_suffix);
  v_voter_id := private.normalize_voter_id(p_voter_id_number);

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
    and rv.barangay_id = p_barangay_id
    and (
      v_voter_id = ''
      or private.normalize_voter_id(rv.voter_id) = v_voter_id
    );

  if v_match_count = 0 then
    if v_voter_id <> '' then
      select count(*)::int
        into v_base_count
      from public.registered_voters rv
      where private.normalize_registration_name(rv.first_name) = v_first
        and private.normalize_registration_name(rv.middle_name) = v_middle
        and private.normalize_registration_name(rv.last_name) = v_last
        and private.normalize_registration_name(rv.suffix) = v_suffix
        and rv.birth_date = v_birth
        and rv.sex = v_sex
        and rv.barangay_id = p_barangay_id;

      if v_base_count > 0 then
        return jsonb_build_object(
          'matched', false,
          'message', 'Your Voter''s ID Number does not match your voter registration record. Please review it and try again.'
        );
      end if;
    end if;

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
    and (
      v_voter_id = ''
      or private.normalize_voter_id(rv.voter_id) = v_voter_id
    )
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

revoke all on function public.verify_registered_voter_for_registration(
  text, text, text, text, text, text, uuid, text
) from public;

grant execute on function public.verify_registered_voter_for_registration(
  text, text, text, text, text, text, uuid, text
) to anon, authenticated;

comment on function public.verify_registered_voter_for_registration(
  text, text, text, text, text, text, uuid, text
) is
  'Step-0 registry cross-match: name, birth date, sex, barangay; optional voter ID when provided.';

commit;
