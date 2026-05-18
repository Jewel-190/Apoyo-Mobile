-- 202605090002_drop_redundant_file_columns.sql
--
-- DRAFT — Phase 10 (destructive). DO NOT APPLY UNTIL THE PRE-FLIGHT
-- CHECKLIST IN ../REFACTOR.md §9 IS GREEN.
--
-- Drops the per-service `*_file` columns from each *_requests table.
-- These columns duplicate rows in `request_attachments`, which is
-- already the single source of truth for file metadata (see
-- 202604040004_request_file_fk_to_request_attachments.sql for the FK
-- contract).
--
-- This file is staged in `_phase10/` (NOT in the main migrations/
-- folder) on purpose so it cannot be applied accidentally. To apply,
-- move it to `migrations/`, retime the filename if needed, and run
-- through your usual deploy path.
--
-- Pre-flight checklist (must all be ✓):
--   [ ] grep across both repos for each column literal returns zero
--       reads / writes for the column (only foreign-key SQL stays).
--   [ ] request_attachments has at least as many rows per
--       (request_table, request_uid) pair as the corresponding
--       request row has non-null *_file pointers.
--   [ ] Mobile + admin shipped to clients ≥ 7 days ago.
--   [ ] DB backup taken.
--
-- Rollback strategy: restore from backup. Re-creating these columns
-- and back-filling them from request_attachments is possible but
-- invasive; do not rely on it.

begin;

alter table public.hospitalization_requests
  drop column if exists abstract_file,
  drop column if exists bill_file,
  drop column if exists letter_file,
  drop column if exists voter_id_file,
  drop column if exists birth_cert_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists attachment_file;

alter table public.treatment_requests
  drop column if exists med_cert_file,
  drop column if exists rx_file,
  drop column if exists lab_file,
  drop column if exists letter_file,
  drop column if exists voter_id_file,
  drop column if exists birth_cert_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists attachment_file;

alter table public.medical_requests
  drop column if exists med_cert_file,
  drop column if exists prescription_file,
  drop column if exists quotation_file,
  drop column if exists letter_file,
  drop column if exists voter_id_file,
  drop column if exists birth_cert_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists attachment_file;

alter table public.financial_requests
  drop column if exists letter_file,
  drop column if exists voter_id_file,
  drop column if exists valid_id_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists attachment_file;

alter table public.monetary_requests
  drop column if exists letter_file,
  drop column if exists voters_id_or_cert_file,
  drop column if exists valid_id_or_birth_cert_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists additional_attachment_file;

alter table public.burial_requests
  drop column if exists death_cert_file,
  drop column if exists valid_id_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists attachment_file;

alter table public.cremation_requests
  drop column if exists death_cert_file,
  drop column if exists valid_id_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists attachment_file;

alter table public.columbarium_requests
  drop column if exists death_cert_file,
  drop column if exists valid_id_file,
  drop column if exists cremation_cert_file,
  drop column if exists barangay_endorsement_file,
  drop column if exists indigency_cert_file,
  drop column if exists attachment_file;

commit;
