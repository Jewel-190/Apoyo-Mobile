/**
 * Read helpers for cross-service request listing from live tables
 * (`assistance_requests` + `assistance_services` embed).
 */

import { fetchAssistanceRequestsListing } from "./AssistanceRequestSql";

export type ServiceRequestRecordRow = {
  id: string;
  legacy_request_table: string;
  legacy_request_id: string;
  service_id: string;
  route_token: string;
  user_id: string;
  status: string | null;
  request_code: string | null;
  submitted_at: string | null;
  case_study_date: string | null;
  additional_info: string | null;
  financial_request_type: string | null;
  legacy_created_at: string | null;
  legacy_updated_at: string | null;
  synced_at: string;
};

export async function listServiceRequestRecordsForUser(
  userId: string
): Promise<ServiceRequestRecordRow[]> {
  const rows = await fetchAssistanceRequestsListing({ userId });

  return rows.map((row) => ({
    id: row.id,
    legacy_request_table: row.request_table,
    legacy_request_id: row.id,
    service_id: row.service_id,
    route_token: row.service_type,
    user_id: row.user_id,
    status: row.status,
    request_code: row.request_code,
    submitted_at: row.submitted_at,
    case_study_date: row.case_study_date,
    additional_info: row.additional_info,
    financial_request_type: row.financial_request_type,
    legacy_created_at: row.created_at,
    legacy_updated_at: row.updated_at,
    synced_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }));
}
