-- request_attachments RLS still referenced dropped *_requests tables after unified migration.
-- Rewrites access + cleanup bucket mapping to use public.assistance_requests only.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1) Allow storing discriminator `assistance_requests` (optional future rows)
-- ---------------------------------------------------------------------------

alter table public.request_attachments
  drop constraint if exists request_attachments_request_table_chk;

alter table public.request_attachments
  add constraint request_attachments_request_table_chk check (
    request_table in (
      'assistance_requests',
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) RLS helper — single parent: public.assistance_requests (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.can_access_request_attachment(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_uid
      and (
        r.user_id = auth.uid()
        or public.is_superadmin(auth.uid())
        or (
          public.is_medical_admin()
          and nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
          and exists (
            select 1
            from public.assistance_services s
            join public.assistance_categories c on c.id = s.category_id
            where s.service_key = r.service_key
              and c.slug = 'medical'
          )
        )
      )
  );
$$;

comment on function public.can_access_request_attachment(text, uuid) is
  'RLS gate for request_attachments: parent row is always public.assistance_requests (id = request_uid / assistance_request_id). Legacy p_request_table values are ignored for access.';

-- ---------------------------------------------------------------------------
-- 3) Storage cleanup webhook — unified bucket for all lines
-- ---------------------------------------------------------------------------

create or replace function private.bucket_for_request_table(p_request_table text)
returns text
language sql
immutable
as $$
  select case
    when p_request_table in (
      'assistance_requests',
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    ) then 'request-documents'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Normalize historical discriminator → unified label (same FK id)
-- ---------------------------------------------------------------------------

update public.request_attachments
set request_table = 'assistance_requests'
where request_table is distinct from 'assistance_requests';

commit;
