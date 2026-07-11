-- Ensure request owners can upload/view attachments on draft assistance requests.
-- Keeps admin visibility restricted to non-draft rows.

begin;

set search_path = public;

create or replace function public.can_access_request_attachment(p_request_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    join public.assistance_services s on s.id = r.service_id
    join public.assistance_categories c on c.id = s.category_id
    where r.id = p_request_uid
      and coalesce(s.active, true) = true
      and (
        -- Request owner can access attachments in all states (including draft).
        r.user_id = auth.uid()
        -- Admin/superadmin paths remain non-draft only.
        or (
          nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
          and (
            public.is_superadmin(auth.uid())
            or public.line_admin_matches_category(auth.uid(), c.id)
          )
        )
      )
  );
$$;

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
  select public.can_access_request_attachment(p_request_uid);
$$;

commit;

