/**
 * Shared domain types used across screens.
 *
 * Re-exports `RequestTableName` from `lib/requestAttachments.ts` and adds
 * other small shared unions (Category, ServiceStatus) so multiple screens
 * can stop redeclaring the same shapes.
 */

export type { RequestTableName } from "../lib/requestAttachments";

/** Top-level service grouping shown on the Home filter chips. */
export type Category = "medical" | "financial" | "burial";

/** End-user facing request status (matches `ApplicationItem.status`). */
export type ServiceStatus =
  | "Pending"
  | "In Progress"
  | "Action Required"
  | "For Approval"
  | "Scheduled"
  | "Approved";
