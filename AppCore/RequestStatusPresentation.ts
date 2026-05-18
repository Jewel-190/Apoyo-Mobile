/**
 * Status vocabulary and badge colors shared across mobile Status surfaces.
 *
 * The DB stores lowercase canonical strings (e.g. "in progress",
 * "action required"). The mobile UI surfaces title-cased labels
 * (e.g. "In Progress", "Action Required").
 */

import type { ServiceStatus } from "./AppUiDomainTypes";

export const REQUEST_STATUS_DB_VALUES = [
  "draft",
  "pending",
  "in progress",
  "action required",
  "resubmitted",
  "for approval",
  "scheduled",
  "case study",
  "approved",
] as const;

export type RequestStatusDb = (typeof REQUEST_STATUS_DB_VALUES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatusDb, string> = {
  draft: "Draft",
  pending: "Pending",
  "in progress": "In Progress",
  "action required": "Action Required",
  resubmitted: "Resubmitted",
  "for approval": "For Approval",
  scheduled: "Scheduled",
  "case study": "Case Study",
  approved: "Approved",
};

export type ServiceStatusUi =
  | "Pending"
  | "In Progress"
  | "Action Required"
  | "Resubmitted"
  | "For Approval"
  | "Scheduled"
  | "Case Study"
  | "Approved";

/**
 * Map any incoming status string to its UI label. Defaults to
 * "Pending" for unknown values so the UI never renders empty.
 */
export function normalizeStatus(
  status: string | null | undefined
): ServiceStatusUi {
  const key = String(status ?? "")
    .trim()
    .toLowerCase();

  if (
    [
      "action required",
      "action_required",
      "requires_action",
      "for_revision",
      "resubmission_required",
      "resubmission required",
    ].includes(key)
  ) {
    return "Action Required";
  }

  if (["resubmitted", "resubmission"].includes(key)) {
    return "Resubmitted";
  }

  if (["in progress", "in_progress"].includes(key)) {
    return "In Progress";
  }

  if (["case study", "case_study", "casestudy", "for case study"].includes(key)) {
    return "Case Study";
  }

  if (["for approval", "for_approval"].includes(key)) {
    return "For Approval";
  }

  if (key === "scheduled") return "Scheduled";

  if (["approved", "complete", "done"].includes(key)) {
    return "Approved";
  }

  if (key === "pending") return "Pending";

  // Unknown / draft — default to Pending in user-facing surfaces.
  return "Pending";
}

/**
 * Map a UI label back to the canonical DB literal. Round-trip safe for
 * statuses in REQUEST_STATUS_LABELS.
 */
export function dbStatusForLabel(label: ServiceStatusUi): RequestStatusDb {
  switch (label) {
    case "Pending":
      return "pending";
    case "In Progress":
      return "in progress";
    case "Action Required":
      return "action required";
    case "Resubmitted":
      return "resubmitted";
    case "For Approval":
      return "for approval";
    case "Scheduled":
      return "scheduled";
    case "Case Study":
      return "case study";
    case "Approved":
      return "approved";
  }
}

/** Badge background + label color for list cards and detail headers. */
export type StatusBadgeTheme = { bg: string; text: string };

const STATUS_BADGE_THEMES: Record<ServiceStatus, StatusBadgeTheme> = {
  Pending: { bg: "#E8C6FF", text: "#4A2E5B" },
  "In Progress": { bg: "#B9E3FF", text: "#2B2B2B" },
  "Action Required": { bg: "#FFD59E", text: "#2B2B2B" },
  Resubmitted: { bg: "#FFE082", text: "#5C4A00" },
  "For Approval": { bg: "#C8EDE9", text: "#0D5C58" },
  Scheduled: { bg: "#D8E6FA", text: "#2F4F7A" },
  Approved: { bg: "#C8F1C8", text: "#2B2B2B" },
  Draft: { bg: "#D4D4D4", text: "#2B2B2B" },
};

/** Accent colors for attachment-level status icons (requirements checklist). */
export const ATTACHMENT_STATUS_ACCENT = {
  approved: "#7CCB53",
  actionRequired: STATUS_BADGE_THEMES["Action Required"].bg,
  resubmitted: STATUS_BADGE_THEMES.Resubmitted.text,
} as const;

/** Timeline “current step” dot — matches list/detail status badges. */
export function statusTimelineDotTheme(status: ServiceStatus): StatusBadgeTheme {
  return statusBadgeTheme(status);
}

/**
 * Normalize raw DB/cache strings to `ServiceStatus` (includes Draft / Resubmitted).
 */
export function normalizeServiceStatus(raw?: string | null): ServiceStatus {
  if (!raw) return "Pending";
  const s = raw.toString().trim().toLowerCase().replace(/_/g, " ");
  if (s === "submitted" || s === "pending") return "Pending";
  if (s === "resubmitted") return "Resubmitted";
  if (s === "in progress" || s === "inprogress" || s === "processing") {
    return "In Progress";
  }
  if (s === "action required" || s === "action") return "Action Required";
  if (s === "for approval") return "For Approval";
  if (s === "scheduled") return "Scheduled";
  if (s === "approved" || s === "accepted") return "Approved";
  if (s === "draft") return "Draft";
  return "Pending";
}

export function statusBadgeTheme(status: ServiceStatus): StatusBadgeTheme {
  return STATUS_BADGE_THEMES[status] ?? STATUS_BADGE_THEMES.Pending;
}

export function statusBadgeThemeFromRaw(
  raw?: string | null
): StatusBadgeTheme {
  return statusBadgeTheme(normalizeServiceStatus(raw));
}

/** Background only — Status list cards. */
export function statusBadgeBackground(status: ServiceStatus): string {
  return statusBadgeTheme(status).bg;
}

/** Label color only — Status list cards. */
export function statusBadgeTextColor(status: ServiceStatus): string {
  return statusBadgeTheme(status).text;
}

/**
 * Header badge on Status details: match the Status list card the user opened
 * (`routedStatus` / cache). Use DB only when no routed status is available.
 */
export function headerStatusForDetails(params: {
  routedStatus?: string | null;
  dbStatus?: string | null;
}): ServiceStatus {
  const routed = (params.routedStatus || "").trim();
  if (routed) return normalizeServiceStatus(routed);
  return normalizeServiceStatus(params.dbStatus);
}
