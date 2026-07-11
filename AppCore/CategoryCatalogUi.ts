/**
 * CMS-driven category labels and gradients (from hydrated assistance catalog).
 */

import type { ApplicationItem } from "./AssistanceStatusApplicationsCache";
import {
  buildAssistanceCategoryTheme,
  defaultAccentHexForSlug,
} from "./AssistanceCategoryTheme";
import { formatCategoryAssistanceTitle } from "./CategoryAssistanceNaming";
import { getCatalogLookupRuntime, resolveServiceId } from "./CatalogLookupRuntime";

export function normalizeCategorySlug(raw?: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

export function resolveApplicationCategorySlug(item: {
  categorySlug?: string;
  service?: string;
  category?: string;
}): string {
  const fromItem = normalizeCategorySlug(item.categorySlug);
  if (fromItem) return fromItem;

  const rt = getCatalogLookupRuntime();
  const sid = resolveServiceId(item.service ?? "");
  if (sid) {
    const fromSvc = normalizeCategorySlug(rt?.byServiceId[sid]?.categorySlug);
    if (fromSvc) return fromSvc;
  }

  return normalizeCategorySlug(item.category);
}

/** Long category title: `{assistance_name} Assistance`. */
export function categoryHeadlineFromSlug(slug: string): string {
  const s = normalizeCategorySlug(slug);
  const rt = getCatalogLookupRuntime();
  if (rt?.categoryHeadlineBySlug[s]) return rt.categoryHeadlineBySlug[s];
  const name =
    rt?.categoryLabelBySlug[s] ??
    (s ? s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "");
  return formatCategoryAssistanceTitle(name);
}

export function categoryAssistanceTitle(slug: string): string {
  return categoryHeadlineFromSlug(slug);
}

export function typeOfAssistanceLabel(slug: string): string {
  const headline = categoryHeadlineFromSlug(slug);
  return `Type Of ${headline}:`;
}

export function statusCardHeaderGradientForSlug(slug: string): [string, string] {
  const s = normalizeCategorySlug(slug);
  const rt = getCatalogLookupRuntime();
  const fromCatalog = s ? rt?.categoryThemeBySlug[s]?.statusCardHeaderGradient : undefined;
  if (fromCatalog) return fromCatalog;
  const accent = defaultAccentHexForSlug(s || "default");
  return buildAssistanceCategoryTheme(s || "default", accent).statusCardHeaderGradient;
}

export function statusCardHeaderGradientForItem(item: ApplicationItem): [string, string] {
  return statusCardHeaderGradientForSlug(resolveApplicationCategorySlug(item));
}

export function successHeadingForService(rt: {
  successHeading: string | null;
  categorySlug: string;
  categoryHeadline: string;
}): string {
  if (rt.successHeading?.trim()) return rt.successHeading.trim();
  return categoryAssistanceTitle(rt.categorySlug);
}
