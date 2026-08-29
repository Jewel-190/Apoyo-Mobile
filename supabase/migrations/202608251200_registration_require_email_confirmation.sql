-- Require confirmed Auth email before a public.users profile can be created.
-- Allow restarting registration for unconfirmed Auth users that never finished.

begin;

set search_path = public, auth;

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
    from public.users u
    where lower(trim(coalesce(u.email::text, ''))) = v_email
  ) then
    return false;
  end if;

  if exists (
    select 1
    from auth.users au
    where lower(trim(coalesce(au.email, ''))) = v_email
      and au.email_confirmed_at is not null
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_registration_email_available(text) is
  'True when the email is free, or only an unconfirmed Auth user (no public.users profile) exists.';

revoke all on function public.is_registration_email_available(text) from public;
grant execute on function public.is_registration_email_available(text) to anon, authenticated;

create or replace function public.reclaim_unconfirmed_registration_email(
  p_email text,
  p_attempt_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  v_email text;
  v_deleted boolean := false;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or p_attempt_token is null then
    return false;
  end if;

  if not exists (
    select 1
    from private.registration_attempts ra
    where ra.attempt_token = p_attempt_token
      and ra.email = v_email
      and ra.consumed_at is null
      and ra.expires_at > now()
  ) then
    return false;
  end if;

  delete from auth.users au
  where lower(trim(coalesce(au.email, ''))) = v_email
    and au.email_confirmed_at is null
    and not exists (
      select 1
      from public.users u
      where u.id = au.id
    );

  v_deleted := found;
  return v_deleted;
end;
$$;

comment on function public.reclaim_unconfirmed_registration_email(text, uuid) is
  'Deletes an unconfirmed Auth user with no profile so registration can restart with a new MPIN.';

revoke all on function public.reclaim_unconfirmed_registration_email(text, uuid) from public;
grant execute on function public.reclaim_unconfirmed_registration_email(text, uuid) to anon, authenticated;

create or replace function public.reject_unconfirmed_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = new.id
      and au.email_confirmed_at is not null
  ) then
    raise exception 'Email is not confirmed';
  end if;

  return new;
end;
$$;

drop trigger if exists users_require_confirmed_email on public.users;
create trigger users_require_confirmed_email
before insert on public.users
for each row
execute function public.reject_unconfirmed_user_profile();

comment on function public.reject_unconfirmed_user_profile() is
  'Blocks public.users inserts until the matching auth.users email is confirmed.';

commit;

-- rollback
-- begin;
-- drop trigger if exists users_require_confirmed_email on public.users;
-- drop function if exists public.reject_unconfirmed_user_profile();
-- drop function if exists public.reclaim_unconfirmed_registration_email(text, uuid);
-- -- restore is_registration_email_available from 202605190001 if needed
-- commit;
