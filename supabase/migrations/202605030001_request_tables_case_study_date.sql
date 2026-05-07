-- Case study interview datetime (set by admin scheduling UI; timestamptz ISO from client).

alter table public.hospitalization_requests add column if not exists case_study_date timestamptz;
alter table public.treatment_requests add column if not exists case_study_date timestamptz;
alter table public.medical_requests add column if not exists case_study_date timestamptz;
alter table public.financial_requests add column if not exists case_study_date timestamptz;
alter table public.monetary_requests add column if not exists case_study_date timestamptz;
alter table public.burial_requests add column if not exists case_study_date timestamptz;
alter table public.cremation_requests add column if not exists case_study_date timestamptz;
alter table public.columbarium_requests add column if not exists case_study_date timestamptz;
