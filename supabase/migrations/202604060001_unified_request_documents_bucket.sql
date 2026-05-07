begin;

create or replace function private.bucket_for_request_table(p_request_table text)
returns text
language sql
immutable
as $$
  select case
    when p_request_table in (
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

commit;
