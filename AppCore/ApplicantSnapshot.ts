/**
 * Historical applicant identity stored on assistance_requests at submit.
 * Request screens must use this, not the live public.users profile.
 */

export const APPLICANT_SNAPSHOT_SELECT = [
  "applicant_first_name",
  "applicant_middle_name",
  "applicant_last_name",
  "applicant_suffix",
  "applicant_sex",
  "applicant_birth_date",
  "applicant_email",
  "applicant_contact_number",
  "applicant_address",
  "applicant_barangay",
  "applicant_voter_id_number",
  "applicant_snapshot_at",
].join(",");

export type ApplicantSnapshotRecord = {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  sex: string | null;
  birth_date: string | null;
  email: string | null;
  contact_number: string | null;
  address: string | null;
  barangay: string | null;
  voter_id_number?: string | null;
};

function nonEmpty(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function hasApplicantSnapshot(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return (
    nonEmpty(row.applicant_first_name) ||
    nonEmpty(row.applicant_last_name) ||
    nonEmpty(row.applicant_email) ||
    nonEmpty(row.applicant_contact_number)
  );
}

export function applicantRecordFromRequest(
  row: Record<string, unknown> | null | undefined
): ApplicantSnapshotRecord | null {
  if (!hasApplicantSnapshot(row)) return null;
  return {
    first_name: (row.applicant_first_name as string | null) ?? null,
    middle_name: (row.applicant_middle_name as string | null) ?? null,
    last_name: (row.applicant_last_name as string | null) ?? null,
    suffix: (row.applicant_suffix as string | null) ?? null,
    sex: (row.applicant_sex as string | null) ?? null,
    birth_date: (row.applicant_birth_date as string | null) ?? null,
    email: (row.applicant_email as string | null) ?? null,
    contact_number: (row.applicant_contact_number as string | null) ?? null,
    address: (row.applicant_address as string | null) ?? null,
    barangay: (row.applicant_barangay as string | null) ?? null,
    voter_id_number: (row.applicant_voter_id_number as string | null) ?? null,
  };
}
