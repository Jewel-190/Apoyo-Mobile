-- Used by the facial-verification edge function (service role) to ensure
-- CompareFaces runs only for an active, unconsumed registration attempt.

create or replace function public.validate_registration_attempt_token(
  p_token uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return false;
  end if;

  return exists (
    select 1
    from private.registration_attempts
    where attempt_token = p_token
      and email = v_email
      and expires_at > now()
      and consumed_at is null
  );
end;
$$;

revoke all on function public.validate_registration_attempt_token(uuid, text) from public;
grant execute on function public.validate_registration_attempt_token(uuid, text) to service_role;
