-- Maps UI attachment slot keys → request_attachments.file_type / storage prefix column names.
-- Mobile success-screen metadata (stable prefixes / AsyncStorage dedupe suffixes).

ALTER TABLE public.assistance_services
  ADD COLUMN IF NOT EXISTS attachment_slot_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mobile_application_code_prefix text,
  ADD COLUMN IF NOT EXISTS mobile_success_dedupe_suffix text,
  ADD COLUMN IF NOT EXISTS mobile_success_heading text;

COMMENT ON COLUMN public.assistance_services.attachment_slot_map IS
  'JSON object: UI slot_key → DB file_type string (e.g. letter → letter_file).';

COMMENT ON COLUMN public.assistance_services.mobile_application_code_prefix IS
  'Short prefix for synthetic application IDs on the submission success screen (e.g. FAER).';

COMMENT ON COLUMN public.assistance_services.mobile_success_dedupe_suffix IS
  'Suffix passed to submissionSavedKey via SubmissionSuccessShell dedupeKey (e.g. financial_success_v1).';

COMMENT ON COLUMN public.assistance_services.mobile_success_heading IS
  'Optional heading line on success screen; when null, derive from assistance category.';

-- Hospitalization
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "abstract": "abstract_file",
    "bill": "bill_file",
    "letter": "letter_file",
    "voterId": "voter_id_file",
    "birthCert": "birth_cert_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'MAHB',
  mobile_success_dedupe_suffix = 'hospitalization_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'hospitalization_requests';

-- Treatment & procedures
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "medCert": "med_cert_file",
    "rx": "rx_file",
    "lab": "lab_file",
    "letter": "letter_file",
    "voterId": "voter_id_file",
    "birthCert": "birth_cert_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'TRTM',
  mobile_success_dedupe_suffix = 'treatment_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'treatment_requests';

-- Medical operations
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "medCert": "med_cert_file",
    "prescription": "prescription_file",
    "quotation": "quotation_file",
    "letter": "letter_file",
    "voterId": "voter_id_file",
    "birthCert": "birth_cert_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'MEDX',
  mobile_success_dedupe_suffix = 'medical_ops_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'medical_requests';

-- Emergency financial
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "letter": "letter_file",
    "voterId": "voter_id_file",
    "validId": "valid_id_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'FAER',
  mobile_success_dedupe_suffix = 'financial_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'financial_requests';

-- Monetary burial aid
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "letter": "letter_file",
    "voterId": "voters_id_or_cert_file",
    "birthCert": "valid_id_or_birth_cert_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "additional_attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'MONY',
  mobile_success_dedupe_suffix = 'monetary_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'monetary_requests';

-- Burial site
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "deathCert": "death_cert_file",
    "validId": "valid_id_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'BABS',
  mobile_success_dedupe_suffix = 'burial_site_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'burial_requests';

-- Cremation
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "deathCert": "death_cert_file",
    "validId": "valid_id_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'CREM',
  mobile_success_dedupe_suffix = 'cremation_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'cremation_requests';

-- Columbarium
UPDATE public.assistance_services
SET
  attachment_slot_map = '{
    "deathCert": "death_cert_file",
    "validId": "valid_id_file",
    "cremationCert": "cremation_cert_file",
    "barangay": "barangay_endorsement_file",
    "indigency": "indigency_cert_file",
    "attachment": "attachment_file"
  }'::jsonb,
  mobile_application_code_prefix = 'BACN',
  mobile_success_dedupe_suffix = 'columbarium_success_v1',
  mobile_success_heading = NULL
WHERE request_table = 'columbarium_requests';
