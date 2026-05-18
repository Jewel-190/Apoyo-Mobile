/**
 * Parsers aligned with ApoyoAdmin ContentManagement (`Services.jsx` / `AssistanceManagement.jsx`).
 */

export const CMS_ADDITIONAL_ATTACHMENT_SLOT = "attachment";

export const CMS_ADDITIONAL_ATTACHMENT_DEFAULT_TITLE = "Additional attachment";

export type RequirementMetadata = {
  sampleDocumentImage: string;
  sampleDocumentName: string;
};

export function parseRequirementMetadata(raw: unknown): RequirementMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { sampleDocumentImage: "", sampleDocumentName: "" };
  }
  const meta = raw as Record<string, unknown>;
  return {
    sampleDocumentImage:
      typeof meta.sampleDocumentImage === "string"
        ? meta.sampleDocumentImage.trim()
        : "",
    sampleDocumentName:
      typeof meta.sampleDocumentName === "string"
        ? meta.sampleDocumentName.trim()
        : "",
  };
}

export function isAdditionalAttachmentSlot(slotKey: string): boolean {
  return slotKey.trim().toLowerCase() === CMS_ADDITIONAL_ATTACHMENT_SLOT;
}
