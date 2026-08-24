/**
 * Single source of truth for request status labels and colors (mobile UI).
 *
 * DB stores lowercase strings (e.g. "in progress", "action required").
 * UI uses title-cased `ServiceStatus` labels and `REQUEST_STATUS_BADGE_THEMES`.
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
  "declined",
] as const;

export type RequestStatusDb = (typeof REQUEST_STATUS_DB_VALUES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatusDb, ServiceStatus> = {
  draft: "Draft",
  pending: "Pending",
  "in progress": "In Progress",
  "action required": "Action Required",
  resubmitted: "Resubmitted",
  "for approval": "For Approval",
  scheduled: "Scheduled",
  "case study": "Case Study",
  approved: "Approved",
  declined: "Declined",
};

/** @deprecated Use `ServiceStatus` — same union, includes Draft. */
export type ServiceStatusUi = Exclude<ServiceStatus, "Draft">;

/** Badge background + label color for list cards, detail headers, and pills. */
export type StatusBadgeTheme = { bg: string; text: string };

/**
 * Canonical status colors — import `statusBadgeTheme()` in UI; do not hardcode hex.
 */
export const REQUEST_STATUS_BADGE_THEMES: Record<ServiceStatus, StatusBadgeTheme> = {
  Pending: { bg: "#E8C6FF", text: "#4A2E5B" },
  "In Progress": { bg: "#B9E3FF", text: "#2B2B2B" },
  "Action Required": { bg: "#FFD59E", text: "#2B2B2B" },
  Resubmitted: { bg: "#FFE082", text: "#5C4A00" },
  "For Approval": { bg: "#C8EDE9", text: "#0D5C58" },
  Scheduled: { bg: "#D8E6FA", text: "#2F4F7A" },
  "Case Study": { bg: "#EDE7F6", text: "#4527A0" },
  Approved: { bg: "#C8F1C8", text: "#2B2B2B" },
  Declined: { bg: "#F8D0D0", text: "#7A2E2E" },
  Draft: { bg: "#D4D4D4", text: "#2B2B2B" },
};

/** Timeline “View Details” chip under Action Required (derived from Action Required badge). */
export type StatusActionLinkTheme = {
  border: string;
  background: string;
  text: string;
  icon: string;
};

const ACTION_REQUIRED_LINK_THEME: StatusActionLinkTheme = {
  border: REQUEST_STATUS_BADGE_THEMES["Action Required"].bg,
  background: "#FFF4E4",
  text: "#D07C00",
  icon: "#D07C00",
};

/** Accent colors for per-document status icons on Status details. */
export const ATTACHMENT_STATUS_ACCENT = {
  approved: "#7CCB53",
  actionRequired: REQUEST_STATUS_BADGE_THEMES["Action Required"].bg,
  resubmitted: REQUEST_STATUS_BADGE_THEMES.Resubmitted.text,
} as const;

/** Timeline progress track (completed steps / connector line). */
export const STATUS_TIMELINE_PROGRESS_ACCENT = {
  completedDot: ATTACHMENT_STATUS_ACCENT.approved,
  completedLine: "#92D66A",
} as const;

/**
 * Map any incoming status string to a UI label. Defaults to Pending.
 */
export function normalizeStatus(status: string | null | undefined): ServiceStatus {
  return normalizeServiceStatus(status);
}

export function dbStatusForLabel(label: ServiceStatus): RequestStatusDb {
  switch (label) {
    case "Draft":
      return "draft";
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
    case "Declined":
      return "declined";
  }
}

export function statusTimelineDotTheme(status: ServiceStatus): StatusBadgeTheme {
  return statusBadgeTheme(status);
}

export function statusTimelineActionLinkTheme(): StatusActionLinkTheme {
  return ACTION_REQUIRED_LINK_THEME;
}

function normalizeAttachmentStatusKey(raw?: string | null): string {
  const s = (raw || "").toString().trim().toLowerCase();
  if (!s) return "in progress";
  if (s === "pending" || s === "submitted") return "in progress";
  if (s === "in_progress" || s === "inprogress" || s === "processing") {
    return "in progress";
  }
  if (s === "action_required") return "action required";
  return s;
}

/** Ionicons + color for a `request_attachments.status` row on Status details. */
export function attachmentStatusIcon(
  statusRaw?: string | null
): { name: "checkmark-circle" | "alert-circle" | "refresh-circle"; color: string } | null {
  const s = normalizeAttachmentStatusKey(statusRaw);
  if (s === "approved") {
    return { name: "checkmark-circle", color: ATTACHMENT_STATUS_ACCENT.approved };
  }
  if (s === "action required") {
    return { name: "alert-circle", color: ATTACHMENT_STATUS_ACCENT.actionRequired };
  }
  if (s === "resubmitted") {
    return { name: "refresh-circle", color: ATTACHMENT_STATUS_ACCENT.resubmitted };
  }
  return null;
}

/**
 * Normalize raw DB/cache strings to `ServiceStatus` (includes Draft / Resubmitted / Case Study).
 */
export function normalizeServiceStatus(raw?: string | null): ServiceStatus {
  if (!raw) return "Pending";
  const key = raw.toString().trim().toLowerCase().replace(/_/g, " ");

  if (key === "draft") return "Draft";

  if (
    [
      "action required",
      "action",
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

  if (["in progress", "inprogress", "processing"].includes(key)) {
    return "In Progress";
  }

  if (["case study", "casestudy", "for case study"].includes(key)) {
    return "Case Study";
  }

  if (["for approval", "for_approval"].includes(key)) {
    return "For Approval";
  }

  if (key === "scheduled") return "Scheduled";

  if (["approved", "accepted", "complete", "done"].includes(key)) {
    return "Approved";
  }

  if (["declined", "denied", "rejected"].includes(key)) {
    return "Declined";
  }

  if (key === "pending" || key === "submitted") return "Pending";

  return "Pending";
}

export function statusDisplayLabel(raw?: string | null): string {
  return normalizeServiceStatus(raw);
}

export function statusBadgeTheme(status: ServiceStatus): StatusBadgeTheme {
  return REQUEST_STATUS_BADGE_THEMES[status] ?? REQUEST_STATUS_BADGE_THEMES.Pending;
}

export function statusBadgeThemeFromRaw(
  raw?: string | null
): StatusBadgeTheme {
  return statusBadgeTheme(normalizeServiceStatus(raw));
}

export function statusBadgeBackground(status: ServiceStatus): string {
  return statusBadgeTheme(status).bg;
}

export function statusBadgeTextColor(status: ServiceStatus): string {
  return statusBadgeTheme(status).text;
}

export function headerStatusForDetails(params: {
  routedStatus?: string | null;
  dbStatus?: string | null;
}): ServiceStatus {
  const db = (params.dbStatus || "").trim();
  if (db) return normalizeServiceStatus(db);
  return normalizeServiceStatus(params.routedStatus);
}

export type StatusDetailsAttachmentState = {
  status?: string | null;
};

/**
 * Status details header chip. Uses the request row when possible, but when the
 * row still says "action required" while the checklist shows resubmitted docs
 * and nothing still requires action, show Resubmitted.
 */
export function resolveStatusDetailsHeaderStatus(params: {
  requestStatus?: string | null;
  attachments?: ReadonlyArray<StatusDetailsAttachmentState>;
  routedStatus?: string | null;
}): ServiceStatus {
  const attachmentKeys = (params.attachments ?? []).map((a) =>
    normalizeAttachmentStatusKey(a.status)
  );
  const hasOpenAction = attachmentKeys.includes("action required");
  const hasResubmitted = attachmentKeys.includes("resubmitted");

  const requestLabel = normalizeServiceStatus(params.requestStatus);
  if (requestLabel === "Action Required" && !hasOpenAction && hasResubmitted) {
    return "Resubmitted";
  }

  return headerStatusForDetails({
    routedStatus: params.routedStatus,
    dbStatus: params.requestStatus,
  });
}
