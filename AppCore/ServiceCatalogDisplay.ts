/**
 * Service card presentation helpers (icons, category trim) from hydrated catalog.
 */

import type { ApplicationItem } from "./AssistanceStatusApplicationsCache";
import {
  normalizeCategorySlug,
  resolveApplicationCategorySlug,
} from "./CategoryCatalogUi";
import {
  buildAssistanceCategoryTheme,
  defaultAccentHexForSlug,
} from "./AssistanceCategoryTheme";
import {
  getCatalogLookupRuntime,
  isServiceUuid,
  resolveServiceId,
} from "./CatalogLookupRuntime";
import { resolveCatalogServiceIdForStatusHints } from "./StatusCatalogBridge";

/** Top card stripe — derived from `assistance_categories.theme_json` accent. */
export function categoryCardTrimGradient(slug: string): [string, string] {
  const s = normalizeCategorySlug(slug);
  const rt = getCatalogLookupRuntime();
  const fromCatalog = s ? rt?.categoryThemeBySlug[s]?.homeCardStripeGradient : undefined;
  if (fromCatalog) return fromCatalog;
  const accent = defaultAccentHexForSlug(s || "default");
  return buildAssistanceCategoryTheme(s || "default", accent).homeCardStripeGradient;
}

export function categoryCardTrimGradientForItem(item: ApplicationItem): [string, string] {
  return categoryCardTrimGradient(resolveApplicationCategorySlug(item));
}

/** Fills display name + category from catalog only when the request has no snapshot. */
export function enrichStatusApplicationItem(item: ApplicationItem): ApplicationItem {
  const rt = getCatalogLookupRuntime();
  if (!item.service || !rt) return item;

  const sid = resolveServiceId(item.service) ?? item.service;
  const svc = rt.byServiceId[sid];
  const existingTitle = String(item.title || "").trim();
  const existingSlug = String(item.categorySlug || item.category || "").trim().toLowerCase();
  const titleLooksLikeId =
    !existingTitle || existingTitle === sid || isServiceUuid(existingTitle);

  if (!svc) return item;

  const catSlug = (
    (existingSlug && existingSlug !== "uncategorized" ? existingSlug : "") ||
    svc.categorySlug ||
    "uncategorized"
  )
    .trim()
    .toLowerCase();

  return {
    ...item,
    title: titleLooksLikeId ? svc.displayName || existingTitle : existingTitle,
    categorySlug: catSlug,
    category: catSlug as ApplicationItem["category"],
  };
}

export function resolveServiceMobileImageUrl(input: {
  service?: string | null;
  title?: string | null;
  categorySlug?: string | null;
  category?: string | null;
}): string | null {
  const rt = getCatalogLookupRuntime();
  if (!rt) return null;

  const raw = (input.service ?? "").trim();
  let sid = raw ? resolveServiceId(raw) : null;

  if (!sid && raw && isServiceUuid(raw)) {
    sid = raw;
  }

  if (!sid) {
    sid = resolveCatalogServiceIdForStatusHints({
      service: input.service,
      title: input.title,
      category: input.categorySlug ?? input.category,
    });
  }

  if (!sid) return null;

  const url = rt.byServiceId[sid]?.mobileImageUrl?.trim();
  return url || null;
}
