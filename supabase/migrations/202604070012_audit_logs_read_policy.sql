-- Allow frontend StatusDetails to read request audit history safely.
-- Scope: requester can read logs of their own requests; medical admins can read medical service logs.

begin;

create or replace function public.can_read_audit_log(
  p_request_table text,
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false

    when p_request_table = 'hospitalization_requests' then exists (
      select 1
      from public.hospitalization_requests r
      where r.id = p_request_id
        and (
          r.user_id = auth.uid()
          or (public.is_medical_admin() and r.status <> 'draft')
        )
    )

    when p_request_table = 'treatment_requests' then exists (
      select 1
      from public.treatment_requests r
      where r.id = p_request_id
        and (
          r.user_id = auth.uid()
          or (public.is_medical_admin() and r.status <> 'draft')
        )
    )

    when p_request_table = 'medical_requests' then exists (
      select 1
      from public.medical_requests r
      where r.id = p_request_id
        and (
          r.user_id = auth.uid()
          or (public.is_medical_admin() and r.status <> 'draft')
        )
    )

    when p_request_table = 'financial_requests' then exists (
      select 1
      from public.financial_requests r
      where r.id = p_request_id
        and r.user_id = auth.uid()
    )

    when p_request_table = 'monetary_requests' then exists (
      select 1
      from public.monetary_requests r
      where r.id = p_request_id
        and r.user_id = auth.uid()
    )

    when p_request_table = 'burial_requests' then exists (
      select 1
      from public.burial_requests r
      where r.id = p_request_id
        and r.user_id = auth.uid()
    )

    when p_request_table = 'cremation_requests' then exists (
      select 1
      from public.cremation_requests r
      where r.id = p_request_id
        and r.user_id = auth.uid()
    )

    when p_request_table = 'columbarium_requests' then exists (
      select 1
      from public.columbarium_requests r
      where r.id = p_request_id
        and r.user_id = auth.uid()
    )

    else false
  end;
$$;

alter table public.audit_logs enable row level security;

drop policy if exists "Users can read request audit logs" on public.audit_logs;
create policy "Users can read request audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.can_read_audit_log(request_table, request_id));

-- Prevent client-side writes; logging is backend-trigger only.
drop policy if exists "No client writes to audit logs" on public.audit_logs;
create policy "No client writes to audit logs"
  on public.audit_logs
  for all
  to authenticated
  using (false)
  with check (false);

commit;
