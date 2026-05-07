-- Optional label for emergency financial assistance subtype (UI selection).
alter table public.financial_requests
  add column if not exists financial_request_type text;

comment on column public.financial_requests.financial_request_type is
  'Subtype chosen during intake (e.g. Emergency Need, Housing/Property Impact).';
