/**
 * Attachment slot ↔ DB `request_attachments.file_type` translation.
 *
 * Per-service maps live in `assistance_services.attachment_slot_map`
 * (hydrated into `CatalogServiceRuntime.attachmentSlotMap`). CMS requirement
 * `slot_key` values are merged at catalog build when Admin omitted map entries.
 */

import {
  CMS_ADDITIONAL_ATTACHMENT_SLOT,
} from "./CatalogContentParse";

/** UI slot identifier (camelCase keys from CMS `slot_key`). */
export type AttachmentSlotKey = string;

/** Default DB column / file_type for the optional additional attachment slot. */
export const DEFAULT_ADDITIONAL_ATTACHMENT_DB_TYPE = "attachment_file";

/**
 * Ensures every requirement slot_key has a map entry. Missing CMS map entries
 * use identity (slot_key → slot_key), matching `submit_assistance_request`:
 * `coalesce(attachment_slot_map ->> slot_key, slot_key)`.
 */
export function mergeAttachmentSlotMapWithRequirements(
  base: Record<string, string> | null | undefined,
  slotKeys: Iterable<string>
): Record<string, string> {
  const out: Record<string, string> = { ...(base ?? {}) };
  for (const raw of slotKeys) {
    const sk = raw?.trim();
    if (!sk) continue;
    if (!out[sk]) out[sk] = sk;
  }
  if (!out[CMS_ADDITIONAL_ATTACHMENT_SLOT]) {
    out[CMS_ADDITIONAL_ATTACHMENT_SLOT] = DEFAULT_ADDITIONAL_ATTACHMENT_DB_TYPE;
  }
  return out;
}

export function toDbFileType(
  attachmentSlotMap: Record<string, string>,
  slot: string
): string {
  const trimmed = slot.trim();
  const mapped = attachmentSlotMap[trimmed];
  if (mapped) return mapped;
  // Defense in depth when runtime map was not merged (e.g. stale cache).
  return trimmed;
}

export function fromDbFileType(
  attachmentSlotMap: Record<string, string>,
  dbFileType: string
): string {
  for (const [slot, col] of Object.entries(attachmentSlotMap)) {
    if (col === dbFileType) return slot;
  }
  return dbFileType;
}
