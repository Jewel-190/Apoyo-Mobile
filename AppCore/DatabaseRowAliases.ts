/**
 * Convenience re-exports of the most-used DB-derived types.
 *
 * Imports here are deliberately narrow so screens don't have to know
 * the path to the generated `database.types.ts` file.
 */

import type { Database, Tables, TablesInsert, TablesUpdate } from "./DatabaseTypes";

export type { Database } from "./DatabaseTypes";

// Per-table row aliases.
export type UserRow = Tables<"users">;
export type AdminRow = Tables<"admins">;
export type AuditLogRow = Tables<"audit_logs">;
export type RequestAttachmentRow = Tables<"request_attachments">;
export type UserNotificationRow = Tables<"user_notification">;

export type AssistanceRequestRow = Tables<"assistance_requests">;

/**
 * Common fields for unified assistance requests (listing / detail reads).
 */
export type RequestRowSkeleton = {
  id: string;
  user_id: string;
  service_id: string;
  status: string;
  request_code: string | null;
  submitted_at: string | null;
  case_study_date: string | null;
  additional_info: string | null;
  financial_request_type?: string | null;
  payload?: Tables<"assistance_requests">["payload"];
  created_at: string | null;
  updated_at: string | null;
};

export type RequestInsert<T extends keyof Database["public"]["Tables"]> = TablesInsert<T>;
export type RequestUpdate<T extends keyof Database["public"]["Tables"]> = TablesUpdate<T>;

/**
 * Flat listing shape: base request row plus catalog discriminator fields
 * (`service_type` = `request_code_token`; `request_table` is always unified storage).
 */
export type RequestsViewRow = RequestRowSkeleton & {
  service_type: string;
  request_table: string;
  financial_request_type: string | null;
  service_name?: string | null;
  assistance_name?: string | null;
  category_slug?: string | null;
};
