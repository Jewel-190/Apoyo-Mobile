/**
 * Storage helpers for the unified `request-documents` bucket.
 *
 * Centralises the path convention used across all eight per-service
 * forms (`{userId}/{requestId}/{fileType}_{sanitizedName}`) so a path
 * change is a one-line edit.
 */

import { File as ExpoFile } from "expo-file-system";
import { Platform } from "react-native";

import { supabase } from "./SupabaseClient";

export const REQUEST_DOCUMENTS_BUCKET = "request-documents";

/** Maximum file size accepted by the per-service forms. Must match
 * the value enforced in app/Home/request/RequestFields.tsx (attachment UI). */
export const MAX_REQUEST_FILE_BYTES = 5 * 1024 * 1024;

export type UploadFileInput = {
  uri: string;
  name: string;
  mimeType?: string;
};

export type UploadedFile = {
  /**
   * Path inside the bucket, **without** the `request-documents/` prefix.
   * This is what gets stored in `request_attachments.path`.
   */
  path: string;
  originalName: string;
  mimeType?: string;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * `fetch(fileUri)` + `blob()` is unreliable on native (often empty body for
 * `file://` URIs from DocumentPicker). Prefer `expo-file-system` `File`.
 */
async function readPickedFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (
    Platform.OS !== "web" &&
    (uri.startsWith("file://") || uri.startsWith("content://"))
  ) {
    try {
      const ref = new ExpoFile(uri);
      const buf = await ref.arrayBuffer();
      if (buf.byteLength > 0) return buf;
    } catch {
      /* fall through */
    }
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Could not read selected file (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const buf = await new Response(blob).arrayBuffer();
  if (!buf.byteLength) {
    throw new Error(
      "Selected file could not be read. Try picking the file again or use a different format."
    );
  }
  return buf;
}

/**
 * Upload a file picked via expo-document-picker into the
 * `request-documents` bucket using the canonical path.
 */
export async function uploadRequestDocument(params: {
  userId: string;
  requestId: string;
  fileType: string;
  file: UploadFileInput;
}): Promise<UploadedFile> {
  const { userId, requestId, fileType, file } = params;

  const sanitized = sanitizeFileName(file.name);
  const path = `${userId}/${requestId}/${fileType}_${sanitized}`;

  const arrayBuffer = await readPickedFileAsArrayBuffer(file.uri);

  const { error } = await supabase.storage
    .from(REQUEST_DOCUMENTS_BUCKET)
    .upload(path, arrayBuffer, {
      upsert: true,
      contentType: file.mimeType || "application/octet-stream",
    });

  if (error) throw error;

  return {
    path,
    originalName: file.name,
    mimeType: file.mimeType,
  };
}

/** Get a signed URL valid for `expiresInSeconds` (default 1 hour). */
export async function getRequestDocumentSignedUrl(
  path: string,
  expiresInSeconds = 60 * 60
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(REQUEST_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Delete a stored object. Triggers the storage-cleanup edge fn via DB
 * trigger when a `request_attachments` row points at this path. */
export async function deleteRequestDocument(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(REQUEST_DOCUMENTS_BUCKET)
    .remove([path]);
  if (error) throw error;
}
