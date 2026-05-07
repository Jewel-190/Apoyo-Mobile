import type { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Classify a file by mime type / extension. Mirrors the per-screen
 * `fileKindLabel` helpers that were duplicated across every `*Req.tsx`
 * form.
 */
export function fileKindLabel(mimeType?: string, name?: string): "PDF" | "PNG" | "JPG" | "FILE" {
  const n = (name || "").toLowerCase();
  if (mimeType?.includes("pdf") || n.endsWith(".pdf")) return "PDF";
  if (mimeType?.includes("png") || n.endsWith(".png")) return "PNG";
  if (
    mimeType?.includes("jpeg") ||
    mimeType?.includes("jpg") ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg")
  ) {
    return "JPG";
  }
  return "FILE";
}

/**
 * Return the appropriate Ionicons glyph for a given file. Mirrors the
 * per-screen helper that lived in every request form.
 */
export function fileIconName(
  mimeType?: string,
  name?: string
): IoniconName {
  const kind = fileKindLabel(mimeType, name);
  if (kind === "PDF") return "document-text-outline";
  return "image-outline";
}
