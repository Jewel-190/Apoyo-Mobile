-- Voter ID match at step 1 + reliable registration email availability check.

begin;

set search_path = public, private, auth;

create or replace function public.verify_voter_id_for_registration(
  p_registered_voter_id uuid,
  p_voter_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rv public.registered_voters%rowtype;
begin
  if p_registered_voter_id is null then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please complete voter verification on the first step.'
    );
  end if;

  if private.normalize_voter_id(p_voter_id) = '' then
    return jsonb_build_object(
      'matched', false,
      'message', 'Enter your complete Voter''s ID Number (format 0000-00000-0000000000000-0).'
    );
  end if;

  select *
    into v_rv
  from public.registered_voters rv
  where rv.id = p_registered_voter_id;

  if not found then
    return jsonb_build_object(
      'matched', false,
      'message', 'Voter verification expired. Please go back to the first step and try again.'
    );
  end if;

  if private.normalize_voter_id(v_rv.voter_id) <> private.normalize_voter_id(p_voter_id) then
    return jsonb_build_object(
      'matched', false,
      'message', 'This Voter''s ID Number does not match your voter registration record.'
    );
  end if;

  return jsonb_build_object('matched', true);
end;
$$;

revoke all on function public.verify_voter_id_for_registration(uuid, text) from public;
grant execute on function public.verify_voter_id_for_registration(uuid, text) to anon, authenticated;

create or replace function public.is_registration_email_available(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return false;
  end if;

  if exists (
    select 1
    from auth.users au
    where lower(trim(coalesce(au.email, ''))) = v_email
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.users u
    where lower(trim(coalesce(u.email::text, ''))) = v_email
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_registration_email_available(text) from public;
grant execute on function public.is_registration_email_available(text) to anon, authenticated;

commit;
