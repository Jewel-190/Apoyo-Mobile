/**
 * Status / StatusDetails helpers — requirement rows from the hydrated assistance catalog.
 */

import type { Category } from "./AppUiDomainTypes";
import { isAdditionalAttachmentSlot } from "./CatalogContentParse";
import {
  getCatalogLookupRuntime,
  resolveServiceId,
} from "./CatalogLookupRuntime";

export type StatusScreenRequirementDef = {
  key: string;
  label: string;
  optional?: boolean;
};

function humanizeSlotKey(slot: string): string {
  return slot
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

/** Attachment slot rows for the Status “requirements” checklist (labels from CMS). */
export function requirementDefsForServiceKey(
  serviceIdOrToken: string | null | undefined
): StatusScreenRequirementDef[] {
  if (!serviceIdOrToken) return [];
  const rt = getCatalogLookupRuntime();
  const sid = resolveServiceId(serviceIdOrToken);
  const row = sid ? rt?.byServiceId[sid] : null;
  if (!row?.fileSlots?.length) return [];

  return row.fileSlots.map((slot) => ({
    key: slot,
    label: row.slotTitles[slot] ?? humanizeSlotKey(slot),
    optional: row.slotRequired[slot] === false,
  }));
}

/** Requirement rows grouped like RequestFields (CMS attachment slot stays under notes). */
export function requirementSlotsGroupedForService(
  serviceIdOrToken: string | null | undefined
): {
  required: StatusScreenRequirementDef[];
  optionalRequirements: StatusScreenRequirementDef[];
  additionalAttachment: StatusScreenRequirementDef | null;
} {
  const required: StatusScreenRequirementDef[] = [];
  const optionalRequirements: StatusScreenRequirementDef[] = [];
  let additionalAttachment: StatusScreenRequirementDef | null = null;

  for (const def of requirementDefsForServiceKey(serviceIdOrToken)) {
    if (isAdditionalAttachmentSlot(def.key)) {
      additionalAttachment = def;
      continue;
    }
    if (def.optional) {
      optionalRequirements.push(def);
    } else {
      required.push(def);
    }
  }

  return { required, optionalRequirements, additionalAttachment };
}

/**
 * Resolves catalog service id for a Status card when the route only has title/category hints.
 * Returns null if the catalog is not ready.
 */
export function resolveCatalogServiceIdForStatusHints(params: {
  service?: string | null;
  title?: string | null;
  category?: Category | string | null;
}): string | null {
  const rt = getCatalogLookupRuntime();
  if (!rt) return null;

  const svcRaw = (params.service || "").trim();
  const sid = resolveServiceId(svcRaw);
  if (sid && rt.byServiceId[sid]) return sid;

  const title = (params.title || "").trim().toLowerCase();
  if (title) {
    for (const id of rt.sortedServiceIds) {
      const row = rt.byServiceId[id];
      const dn = (row.displayName || "").toLowerCase();
      if (!dn) continue;
      if (title.includes(dn) || dn.includes(title)) {
        return row.serviceId;
      }
    }
  }

  const cat = (params.category || "").trim().toLowerCase();
  if (cat) {
    for (const id of rt.sortedServiceIds) {
      const row = rt.byServiceId[id];
      if (row.categorySlug === cat) {
        return row.serviceId;
      }
    }
  }

  return null;
}

/** @deprecated Use `resolveCatalogServiceIdForStatusHints`. */
export function resolveCatalogServiceKeyForStatusHints(params: {
  service?: string | null;
  title?: string | null;
  category?: Category | string | null;
}): string | null {
  const sid = resolveCatalogServiceIdForStatusHints(params);
  if (!sid) return null;
  return getCatalogLookupRuntime()?.byServiceId[sid]?.routeToken ?? null;
}
