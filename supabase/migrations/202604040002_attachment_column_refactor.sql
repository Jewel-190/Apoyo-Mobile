begin;

-- 1) Rename legacy file holder columns in all request tables (remove `_path` suffix).
alter table public.hospitalization_requests rename column abstract_file_path to abstract_file;
alter table public.hospitalization_requests rename column bill_file_path to bill_file;
alter table public.hospitalization_requests rename column letter_file_path to letter_file;
alter table public.hospitalization_requests rename column voter_id_file_path to voter_id_file;
alter table public.hospitalization_requests rename column birth_cert_file_path to birth_cert_file;
alter table public.hospitalization_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.hospitalization_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.hospitalization_requests rename column attachment_file_path to attachment_file;

alter table public.treatment_requests rename column med_cert_file_path to med_cert_file;
alter table public.treatment_requests rename column rx_file_path to rx_file;
alter table public.treatment_requests rename column lab_file_path to lab_file;
alter table public.treatment_requests rename column letter_file_path to letter_file;
alter table public.treatment_requests rename column voter_id_file_path to voter_id_file;
alter table public.treatment_requests rename column birth_cert_file_path to birth_cert_file;
alter table public.treatment_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.treatment_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.treatment_requests rename column attachment_file_path to attachment_file;

alter table public.medical_requests rename column med_cert_file_path to med_cert_file;
alter table public.medical_requests rename column prescription_file_path to prescription_file;
alter table public.medical_requests rename column quotation_file_path to quotation_file;
alter table public.medical_requests rename column letter_file_path to letter_file;
alter table public.medical_requests rename column voter_id_file_path to voter_id_file;
alter table public.medical_requests rename column birth_cert_file_path to birth_cert_file;
alter table public.medical_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.medical_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.medical_requests rename column attachment_file_path to attachment_file;

alter table public.financial_requests rename column letter_file_path to letter_file;
alter table public.financial_requests rename column voter_id_file_path to voter_id_file;
alter table public.financial_requests rename column valid_id_file_path to valid_id_file;
alter table public.financial_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.financial_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.financial_requests rename column attachment_file_path to attachment_file;

alter table public.monetary_requests rename column letter_file_path to letter_file;
alter table public.monetary_requests rename column voters_id_or_cert_file_path to voters_id_or_cert_file;
alter table public.monetary_requests rename column valid_id_or_birth_cert_file_path to valid_id_or_birth_cert_file;
alter table public.monetary_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.monetary_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.monetary_requests rename column additional_attachment_file_path to additional_attachment_file;

alter table public.burial_requests rename column death_cert_file_path to death_cert_file;
alter table public.burial_requests rename column valid_id_file_path to valid_id_file;
alter table public.burial_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.burial_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.burial_requests rename column attachment_file_path to attachment_file;

alter table public.cremation_requests rename column death_cert_file_path to death_cert_file;
alter table public.cremation_requests rename column valid_id_file_path to valid_id_file;
alter table public.cremation_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.cremation_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.cremation_requests rename column attachment_file_path to attachment_file;

alter table public.columbarium_requests rename column death_cert_file_path to death_cert_file;
alter table public.columbarium_requests rename column valid_id_file_path to valid_id_file;
alter table public.columbarium_requests rename column cremation_cert_file_path to cremation_cert_file;
alter table public.columbarium_requests rename column barangay_endorsement_file_path to barangay_endorsement_file;
alter table public.columbarium_requests rename column indigency_cert_file_path to indigency_cert_file;
alter table public.columbarium_requests rename column attachment_file_path to attachment_file;

-- 2) Normalize request_attachments.file_type to legacy column naming minus `_path`.
update public.request_attachments
set file_type = case
  when request_table = 'hospitalization_requests' and file_type = 'abstract' then 'abstract_file'
  when request_table = 'hospitalization_requests' and file_type = 'bill' then 'bill_file'
  when request_table = 'hospitalization_requests' and file_type = 'letter' then 'letter_file'
  when request_table = 'hospitalization_requests' and file_type = 'voterId' then 'voter_id_file'
  when request_table = 'hospitalization_requests' and file_type = 'birthCert' then 'birth_cert_file'
  when request_table = 'hospitalization_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'hospitalization_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'hospitalization_requests' and file_type = 'attachment' then 'attachment_file'

  when request_table = 'treatment_requests' and file_type = 'medCert' then 'med_cert_file'
  when request_table = 'treatment_requests' and file_type = 'rx' then 'rx_file'
  when request_table = 'treatment_requests' and file_type = 'lab' then 'lab_file'
  when request_table = 'treatment_requests' and file_type = 'letter' then 'letter_file'
  when request_table = 'treatment_requests' and file_type = 'voterId' then 'voter_id_file'
  when request_table = 'treatment_requests' and file_type = 'birthCert' then 'birth_cert_file'
  when request_table = 'treatment_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'treatment_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'treatment_requests' and file_type = 'attachment' then 'attachment_file'

  when request_table = 'medical_requests' and file_type = 'medCert' then 'med_cert_file'
  when request_table = 'medical_requests' and file_type = 'prescription' then 'prescription_file'
  when request_table = 'medical_requests' and file_type = 'quotation' then 'quotation_file'
  when request_table = 'medical_requests' and file_type = 'letter' then 'letter_file'
  when request_table = 'medical_requests' and file_type = 'voterId' then 'voter_id_file'
  when request_table = 'medical_requests' and file_type = 'birthCert' then 'birth_cert_file'
  when request_table = 'medical_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'medical_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'medical_requests' and file_type = 'attachment' then 'attachment_file'

  when request_table = 'financial_requests' and file_type = 'letter' then 'letter_file'
  when request_table = 'financial_requests' and file_type = 'voterId' then 'voter_id_file'
  when request_table = 'financial_requests' and file_type = 'validId' then 'valid_id_file'
  when request_table = 'financial_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'financial_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'financial_requests' and file_type = 'attachment' then 'attachment_file'

  when request_table = 'monetary_requests' and file_type = 'letter' then 'letter_file'
  when request_table = 'monetary_requests' and file_type = 'voterId' then 'voters_id_or_cert_file'
  when request_table = 'monetary_requests' and file_type = 'birthCert' then 'valid_id_or_birth_cert_file'
  when request_table = 'monetary_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'monetary_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'monetary_requests' and file_type = 'attachment' then 'additional_attachment_file'

  when request_table = 'burial_requests' and file_type = 'deathCert' then 'death_cert_file'
  when request_table = 'burial_requests' and file_type = 'validId' then 'valid_id_file'
  when request_table = 'burial_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'burial_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'burial_requests' and file_type = 'attachment' then 'attachment_file'

  when request_table = 'cremation_requests' and file_type = 'deathCert' then 'death_cert_file'
  when request_table = 'cremation_requests' and file_type = 'validId' then 'valid_id_file'
  when request_table = 'cremation_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'cremation_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'cremation_requests' and file_type = 'attachment' then 'attachment_file'

  when request_table = 'columbarium_requests' and file_type = 'deathCert' then 'death_cert_file'
  when request_table = 'columbarium_requests' and file_type = 'validId' then 'valid_id_file'
  when request_table = 'columbarium_requests' and file_type = 'cremationCert' then 'cremation_cert_file'
  when request_table = 'columbarium_requests' and file_type = 'barangay' then 'barangay_endorsement_file'
  when request_table = 'columbarium_requests' and file_type = 'indigency' then 'indigency_cert_file'
  when request_table = 'columbarium_requests' and file_type = 'attachment' then 'attachment_file'
  else file_type
end;

-- 3) Keep request linkage explicit for reference; request_uid is the source UID of the parent request row.
comment on column public.request_attachments.request_uid is 'UID of the request row this attachment belongs to.';

-- 4) Oversight fix: deleting any request row should also delete its request_attachments rows.
create or replace function private.delete_request_attachments_for_deleted_request()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  delete from public.request_attachments
  where request_table = tg_table_name
    and request_uid = old.id;
  return old;
end;
$$;

drop trigger if exists trg_delete_attachments_on_hospitalization_request_delete on public.hospitalization_requests;
create trigger trg_delete_attachments_on_hospitalization_request_delete
after delete on public.hospitalization_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

drop trigger if exists trg_delete_attachments_on_treatment_request_delete on public.treatment_requests;
create trigger trg_delete_attachments_on_treatment_request_delete
after delete on public.treatment_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

drop trigger if exists trg_delete_attachments_on_medical_request_delete on public.medical_requests;
create trigger trg_delete_attachments_on_medical_request_delete
after delete on public.medical_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

drop trigger if exists trg_delete_attachments_on_financial_request_delete on public.financial_requests;
create trigger trg_delete_attachments_on_financial_request_delete
after delete on public.financial_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

drop trigger if exists trg_delete_attachments_on_monetary_request_delete on public.monetary_requests;
create trigger trg_delete_attachments_on_monetary_request_delete
after delete on public.monetary_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

drop trigger if exists trg_delete_attachments_on_burial_request_delete on public.burial_requests;
create trigger trg_delete_attachments_on_burial_request_delete
after delete on public.burial_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

drop trigger if exists trg_delete_attachments_on_cremation_request_delete on public.cremation_requests;
create trigger trg_delete_attachments_on_cremation_request_delete
after delete on public.cremation_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

drop trigger if exists trg_delete_attachments_on_columbarium_request_delete on public.columbarium_requests;
create trigger trg_delete_attachments_on_columbarium_request_delete
after delete on public.columbarium_requests
for each row
execute function private.delete_request_attachments_for_deleted_request();

commit;
