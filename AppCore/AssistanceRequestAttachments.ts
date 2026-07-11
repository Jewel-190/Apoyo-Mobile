/**
 * Typed wrapper around `request_attachments`.
 *
 * The DB `file_type` column stores the per-table snake_case slot name
 * (e.g. `letter_file`); the UI uses camelCase slot keys
 * (e.g. `letter`). Translation uses `assistance_services.attachment_slot_map`.
 */

import { supabase } from "./SupabaseClient";
import type { RequestTableName } from "./AssistanceRequestTables";
import {
  type AttachmentSlotKey,
  fromDbFileType,
  toDbFileType,
} from "./AttachmentSlotDbMapping";

export type RequestAttachmentStatus =
  | "pending"
  | "in progress"
  | "in_progress"
  | "approved"
  | "action_required"
  | "resubmitted";

export type RequestAttachmentRecord = {
  uid: string;
  assistance_request_id: string;
  /** DB-side file type (e.g. `letter_file`). */
  file_type: string;
  /** UI-side slot key (e.g. `letter`). */
  slot: AttachmentSlotKey | string;
  path: string;
  status: RequestAttachmentStatus;
  created: string;
  updated: string;
};

export async function listRequestAttachments(params: {
  /** @deprecated Ignored; rows use unified `assistance_requests` discriminator. */
  requestTable?: RequestTableName | string;
  attachmentSlotMap: Record<string, string>;
  requestUid: string;
}): Promise<Record<string, string>> {
  const { attachmentSlotMap, requestUid } = params;
  const { data, error } = await supabase
    .from("request_attachments")
    .select("file_type,path")
    .eq("assistance_request_id", requestUid);

  if (error) throw error;

  const paths: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path) {
      const uiSlot = fromDbFileType(attachmentSlotMap, row.file_type);
      paths[uiSlot as string] = row.path;
    }
  }
  return paths;
}

export async function listRequestAttachmentRows(params: {
  /** @deprecated Ignored; rows use unified `assistance_requests` discriminator. */
  requestTable?: RequestTableName | string;
  attachmentSlotMap: Record<string, string>;
  requestUid: string;
}): Promise<RequestAttachmentRecord[]> {
  const { attachmentSlotMap, requestUid } = params;
  const { data, error } = await supabase
    .from("request_attachments")
    .select("*")
    .eq("assistance_request_id", requestUid);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    uid: row.uid,
    assistance_request_id: row.assistance_request_id,
    file_type: row.file_type,
    slot: fromDbFileType(attachmentSlotMap, row.file_type),
    path: row.path,
    status: row.status as RequestAttachmentStatus,
    created: row.created,
    updated: row.updated,
  }));
}

export async function upsertRequestAttachment(params: {
  /** @deprecated Ignored; persisted as `assistance_requests`. */
  requestTable?: RequestTableName | string;
  attachmentSlotMap: Record<string, string>;
  requestUid: string;
  /** UI slot key OR raw DB file_type — both accepted. */
  fileType: AttachmentSlotKey | string;
  path: string;
  status?: RequestAttachmentStatus;
}): Promise<void> {
  const { attachmentSlotMap, requestUid, fileType, path, status = "in progress" } =
    params;

  const dbFileType = attachmentSlotMap[fileType]
    ? attachmentSlotMap[fileType]
    : Object.values(attachmentSlotMap).includes(fileType)
      ? fileType
      : toDbFileType(attachmentSlotMap, fileType);

  const { error } = await supabase.from("request_attachments").upsert(
    {
      assistance_request_id: requestUid,
      file_type: dbFileType,
      path,
      status,
    },
    { onConflict: "assistance_request_id,file_type" }
  );

  if (error) throw error;
}

export async function deleteRequestAttachment(params: {
  /** @deprecated Ignored; rows use unified `assistance_requests` discriminator. */
  requestTable?: RequestTableName | string;
  attachmentSlotMap: Record<string, string>;
  requestUid: string;
  fileType: AttachmentSlotKey | string;
}): Promise<void> {
  const { attachmentSlotMap, requestUid, fileType } = params;
  const dbFileType = attachmentSlotMap[fileType]
    ? attachmentSlotMap[fileType]
    : Object.values(attachmentSlotMap).includes(fileType)
      ? fileType
      : toDbFileType(attachmentSlotMap, fileType);

  const { error } = await supabase
    .from("request_attachments")
    .delete()
    .eq("assistance_request_id", requestUid)
    .eq("file_type", dbFileType);

  if (error) throw error;
}

export function inferAttachmentName(filePath: string, fileType?: string): string {
  const baseName = filePath.split("/").pop() || "file";
  if (!fileType) return baseName;

  const prefix = `${fileType}_`;
  if (!baseName.startsWith(prefix)) return baseName;

  const trimmed = baseName.slice(prefix.length);
  return trimmed || baseName;
}
