/**
 * Request status timeline steps from `audit_logs` (Status details + Approved Assistance).
 */

import type { ServiceStatus } from "./AppUiDomainTypes";
import { normalizeServiceStatus } from "./RequestStatusPresentation";

export type RequestTimelineAuditRow = {
  action?: string | null;
  old_status: string | null;
  new_status: string | null;
  changed_at: string;
};

export type RequestTimelineStep = {
  key: string;
  title: ServiceStatus;
  description: string;
  timestamp?: number;
  statusRaw: string;
};

export function normalizeTimelineStatusRaw(raw?: string | null): string {
  const s = (raw || "").toString().trim().toLowerCase().replace(/_/g, " ");
  if (!s) return "pending";
  if (s === "submitted") return "pending";
  if (s === "resubmitted") return "resubmitted";
  if (s === "inprogress" || s === "processing") return "in progress";
  if (s === "action required") return "action required";
  return s;
}

export function timelineStatusDescription(raw?: string | null): string {
  const s = normalizeTimelineStatusRaw(raw);
  if (s === "pending") {
    return "The document has landed in the admin's inbox but hasn't been opened yet.";
  }
  if (s === "in progress") {
    return "An admin is doing an authenticity check, please wait.";
  }
  if (s === "action required") {
    return "Your application is currently on hold. We require a resubmission of your files";
  }
  if (s === "resubmitted") {
    return "Your files are being rechecked by the admin, please wait.";
  }
  if (s === "for approval") {
    return "Your request is queued for final approval.";
  }
  if (s === "scheduled") {
    return "Your assistance has been scheduled. Watch for updates from the office.";
  }
  if (s === "approved") {
    return "Your application has been approved.";
  }
  if (s === "declined" || s === "denied" || s === "rejected") {
    return "Your application was not approved for disbursement.";
  }
  if (s === "draft") {
    return "Your request is still in draft.";
  }
  if (s === "deleted") {
    return "This request has been deleted.";
  }
  return "Status updated.";
}

export function toTimelineMillis(value?: string | null): number | undefined {
  if (!value) return undefined;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : undefined;
}

export function formatTimelineDate(ms?: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function formatTimelineTime(ms?: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function buildRequestTimelineSteps(input: {
  auditHistory: RequestTimelineAuditRow[];
  fallbackStatus?: string | null;
  fallbackTimestamp?: number;
}): RequestTimelineStep[] {
  const { auditHistory, fallbackStatus, fallbackTimestamp } = input;

  if (auditHistory.length > 0) {
    const filtered = auditHistory.filter(
      (log) => (log.action || "").toUpperCase() !== "INSERT"
    );

    const reduced = filtered.reduce<RequestTimelineStep[]>((acc, log, index) => {
      const statusRaw = normalizeTimelineStatusRaw(log.new_status || log.old_status);
      if (!statusRaw) return acc;

      const next: RequestTimelineStep = {
        key: `${log.changed_at}-${index}`,
        title: normalizeServiceStatus(statusRaw),
        description: timelineStatusDescription(statusRaw),
        timestamp: toTimelineMillis(log.changed_at),
        statusRaw,
      };

      if (!acc.length) {
        acc.push(next);
        return acc;
      }

      const last = acc[acc.length - 1];
      if (last.statusRaw === statusRaw) {
        acc[acc.length - 1] = next;
        return acc;
      }

      acc.push(next);
      return acc;
    }, []);

    if (reduced.length > 0) {
      return [...reduced].reverse();
    }
  }

  return [
    {
      key: "fallback-current",
      title: normalizeServiceStatus(fallbackStatus),
      description: timelineStatusDescription(fallbackStatus),
      timestamp: fallbackTimestamp,
      statusRaw: normalizeTimelineStatusRaw(fallbackStatus),
    },
  ];
}
