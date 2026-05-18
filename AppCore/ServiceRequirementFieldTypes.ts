/**
 * Requirement labels/tips for attachment UX — sourced from catalog runtime (Supabase CMS).
 */

import { fromDbFileType } from "./AttachmentSlotDbMapping";
import {
  getCatalogLookupRuntime,
  resolveServiceId,
} from "./CatalogLookupRuntime";

export type HomeRequirementItem = {
  id: string;
  title: string;
  details?: string;
  /** Raw `help_html` from CMS. */
  detailsHtml?: string;
  /** From `assistance_requirements.metadata` (CMS sample document). */
  sampleDocumentImage?: string;
  sampleDocumentName?: string;
};

/** Canonical assistance service UUID (`assistance_services.id`). */
export type HomeServiceId = string;

export type RequirementTipItem = {
  id: string;
  title: string;
  details: string;
  /** Raw tip `description` when it contains HTML/markdown. */
  detailsHtml?: string;
  image?: unknown;
};

/** Maps `request_attachments.file_type` (DB column or CMS slot_key) → catalog slot_key. */
export function resolveAttachmentSlotKey(params: {
  serviceId?: string | null;
  dbFileType: string;
}): string | null {
  const rt = getCatalogLookupRuntime();
  const sid = resolveServiceId(params.serviceId ?? "");
  const db = (params.dbFileType || "").trim();
  if (!sid || !db || !rt) return null;

  const row = rt.byServiceId[sid];
  const map = row?.attachmentSlotMap ?? {};
  if (map[db]) return db;
  for (const [slot, col] of Object.entries(map)) {
    if (col === db) return slot;
  }
  const reversed = fromDbFileType(map, db);
  if (row?.fileSlots?.includes(reversed)) return reversed;
  if (row?.fileSlots?.includes(db)) return db;
  return reversed !== db ? reversed : null;
}

function slotKeyForDbColumnByService(
  serviceId: string | null | undefined,
  dbFileType: string
): string | null {
  return resolveAttachmentSlotKey({ serviceId, dbFileType });
}

export function normalizeHomeServiceId(
  serviceId?: string | null
): HomeServiceId | null {
  return resolveServiceId(serviceId ?? "");
}

/** Prefer Home modal / catalog requirements; legacy helper kept for call sites. */
export function getHomeRequirements(
  _serviceId?: string | null
): HomeRequirementItem[] {
  return [];
}

export function getHomeRequirementLabelForAttachment(params: {
  serviceId?: string | null;
  dbFileType: string;
}): string | null {
  const rt = getCatalogLookupRuntime();
  if (!rt) return null;

  const sid = resolveServiceId(params.serviceId ?? "");
  if (!sid) return null;

  const slot = slotKeyForDbColumnByService(sid, params.dbFileType);
  if (!slot) return null;

  return rt.byServiceId[sid]?.slotTitles[slot] ?? null;
}

export function getHomeRequirementIdForAttachment(params: {
  serviceId?: string | null;
  dbFileType: string;
}): string | null {
  const sid = resolveServiceId(params.serviceId ?? "");
  if (!sid) return null;
  return slotKeyForDbColumnByService(sid, params.dbFileType);
}

export function getHomeRequirementTips(params: {
  serviceId?: string | null;
  requirementId?: string | null;
}): RequirementTipItem[] {
  const rt = getCatalogLookupRuntime();
  const sid = resolveServiceId(params.serviceId ?? "");
  if (!sid || !params.requirementId || !rt) return [];
  return (
    rt.byServiceId[sid]?.requirementTipsBySlot[params.requirementId] ?? []
  );
}

export function getHomeRequirementTipsForAttachment(params: {
  serviceId?: string | null;
  dbFileType: string;
}): RequirementTipItem[] {
  const slot = getHomeRequirementIdForAttachment({
    serviceId: params.serviceId,
    dbFileType: params.dbFileType,
  });
  if (!slot) return [];

  const sid = resolveServiceId(params.serviceId ?? "");
  return getHomeRequirementTips({ serviceId: sid, requirementId: slot });
}
