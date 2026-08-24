/**
 * UI-facing unions shared across Home, Status, and notifications.
 * Import from `@/AppCore/AppUiDomainTypes` instead of redeclaring literals.
 */

export type { RequestTableName } from "./AssistanceRequestTables";

/**
 * `assistance_categories.slug` from CMS (e.g. medical, financial, burial).
 * Not a fixed enum — new categories are valid when the catalog is hydrated.
 */
export type Category = string;

/**
 * End-user-facing request status labels used in lists, badges, and cache.
 * Includes values surfaced on Status screens (`Resubmitted`, `Draft`).
 */
export type ServiceStatus =
  | "Pending"
  | "In Progress"
  | "Action Required"
  | "Resubmitted"
  | "For Approval"
  | "Scheduled"
  | "Case Study"
  | "Approved"
  | "Declined"
  | "Draft";
