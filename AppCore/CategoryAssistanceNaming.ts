/**
 * `assistance_categories.assistance_name` + fixed "Assistance" suffix for long titles.
 * Replaces former `label` (short) and `headline` (long) columns.
 */

export type CategoryAssistanceRow = {
  assistance_name?: string | null;
  /** Legacy cache / pre-rename DB */
  label?: string | null;
  headline?: string | null;
};

export function categoryAssistanceNameFromRow(cat: CategoryAssistanceRow): string {
  const name = (cat.assistance_name ?? cat.label ?? "").trim();
  if (name) return name;
  return "Assistance";
}

/** e.g. "Medical" → "Medical Assistance" */
export function formatCategoryAssistanceTitle(assistanceName: string): string {
  const name = assistanceName.trim();
  if (!name) return "Assistance";
  if (/\bassistance\s*$/i.test(name)) return name;
  return `${name} Assistance`;
}

export function categoryAssistanceTitleFromRow(cat: CategoryAssistanceRow): string {
  const legacyHeadline = (cat.headline ?? "").trim();
  if (legacyHeadline) return legacyHeadline;
  return formatCategoryAssistanceTitle(categoryAssistanceNameFromRow(cat));
}

/** @deprecated Use `categoryAssistanceTitleFromRow`. */
export function categoryHeadlineFromRow(cat: CategoryAssistanceRow): string {
  return categoryAssistanceTitleFromRow(cat);
}
