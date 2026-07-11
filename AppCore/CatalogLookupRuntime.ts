/**
 * Catalog runtime lookups — no dependency on assistanceCatalog.ts (breaks cycles).
 * Populated when `bundleCatalogRows` runs after fetch/cache hydrate.
 */

import type { AssistanceCategoryTheme } from "./AssistanceCategoryTheme";
import { parseCmsMetadata, type CmsServiceFonts } from "./CmsTypography";
import {
  parseDetailPreflightConfig,
  type DetailPreflightConfig,
} from "./DetailPreflightConfig";
import { mergeAttachmentSlotMapWithRequirements } from "./AttachmentSlotDbMapping";
import { isOptionalAttachmentSlot } from "./CatalogContentParse";
import { formatCategoryAssistanceTitle } from "./CategoryAssistanceNaming";
import {
  applicationCodePrefixForToken,
  successDedupeSuffixForToken,
  successHeadingForToken,
} from "./ServiceMobileMetadata";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CatalogTipItem = {
  id: string;
  title: string;
  details: string;
  detailsHtml?: string;
};

export type CatalogRowForRuntime = {
  service_id: string;
  /** `assistance_services.request_code_token` — request codes + mobile metadata. */
  route_token: string;
  display_name: string;
  has_details_step: boolean | null;
  mobile_image_url: string | null;
  intro_plain: string;
  radio_selection: unknown;
  category_slug: string;
  category_label: string;
  category_headline: string;
  requirements: Array<{
    slot_key: string;
    sort_order: number;
    title: string;
    required?: boolean | null;
    tips: Array<{
      id?: string;
      sort_order: number;
      title: string;
      description: string;
    }>;
  }>;
  attachment_slot_map: Record<string, string>;
  description_plain: string;
  description_html: string;
  cms_fonts: CmsServiceFonts;
};

export type CatalogServiceRuntime = {
  serviceId: string;
  routeToken: string;
  displayName: string;
  categorySlug: string;
  categoryLabel: string;
  categoryHeadline: string;
  introPlain: string;
  preflightConfig: DetailPreflightConfig | null;
  fileSlots: string[];
  slotTitles: Record<string, string>;
  requirementTipsBySlot: Record<string, CatalogTipItem[]>;
  hasDetailsStep: boolean;
  mobileImageUrl: string | null;
  attachmentSlotMap: Record<string, string>;
  slotRequired: Record<string, boolean>;
  descriptionPlain: string;
  /** Raw `description_html` for rich-text rendering. */
  descriptionHtml: string;
  cmsFonts: CmsServiceFonts;
  applicationCodePrefix: string;
  successDedupeSuffix: string;
  successHeading: string | null;
};

export type AssistanceCatalogRuntime = {
  byServiceId: Record<string, CatalogServiceRuntime>;
  byRouteToken: Record<string, CatalogServiceRuntime>;
  sortedServiceIds: string[];
  categoryHeadlineBySlug: Record<string, string>;
  categoryLabelBySlug: Record<string, string>;
  /** From `assistance_categories.theme_json` (hex accent → derived gradients). */
  categoryThemeBySlug: Record<string, AssistanceCategoryTheme>;
};

let cache: AssistanceCatalogRuntime | null = null;

export function setCatalogLookupRuntime(
  rt: AssistanceCatalogRuntime | null
): void {
  cache = rt;
}

export function getCatalogLookupRuntime(): AssistanceCatalogRuntime | null {
  return cache;
}

export function isServiceUuid(raw: string): boolean {
  return UUID_RE.test(raw.trim());
}

/** Canonical assistance service UUID (`assistance_services.id`). */
export function resolveServiceId(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const x = String(raw).trim();
  if (!x) return null;

  const rt = cache;
  if (isServiceUuid(x)) {
    if (rt?.byServiceId[x]) return x;
    return x;
  }

  const token = x.toLowerCase();
  const fromToken = rt?.byRouteToken[token];
  if (fromToken) return fromToken.serviceId;

  return null;
}

/** Route / metadata token (`request_code_token`, formerly `service_key`). */
export function resolveRouteToken(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const x = String(raw).trim();
  if (!x) return null;

  const sid = resolveServiceId(x);
  if (sid) {
    const row = cache?.byServiceId[sid];
    if (row?.routeToken) return row.routeToken;
  }

  const token = x.toLowerCase();
  if (cache?.byRouteToken[token]) return token;

  /** Cold start before catalog hydrates — accept slug-shaped tokens. */
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(token)) return token;

  return null;
}

/** @deprecated Use `resolveRouteToken` or `resolveServiceId`. */
export function resolveCanonicalServiceKey(
  raw: string | null | undefined
): string | null {
  return resolveRouteToken(raw);
}

export function buildAssistanceCatalogRuntime(
  sorted: CatalogRowForRuntime[],
  categoryThemeBySlug: Record<string, AssistanceCategoryTheme> = {}
): AssistanceCatalogRuntime {
  const byServiceId: Record<string, CatalogServiceRuntime> = {};
  const byRouteToken: Record<string, CatalogServiceRuntime> = {};
  const categoryHeadlineBySlug: Record<string, string> = {};
  const categoryLabelBySlug: Record<string, string> = {};

  for (const r of sorted) {
    const slug = (r.category_slug || "uncategorized").trim().toLowerCase();
    const assistanceName = r.category_label?.trim() || slug;
    categoryLabelBySlug[slug] = assistanceName;
    categoryHeadlineBySlug[slug] =
      r.category_headline?.trim() ||
      formatCategoryAssistanceTitle(assistanceName);

    const sortedReq = [...r.requirements].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    const fileSlots = sortedReq.map((q) => q.slot_key);
    const slotTitles: Record<string, string> = {};
    const slotRequired: Record<string, boolean> = {};
    const requirementTipsBySlot: Record<string, CatalogTipItem[]> = {};

    for (const q of sortedReq) {
      slotTitles[q.slot_key] = q.title;
      slotRequired[q.slot_key] = !isOptionalAttachmentSlot(q.slot_key, q.required);
      const tipsSorted = [...q.tips].sort((a, b) => a.sort_order - b.sort_order);
      requirementTipsBySlot[q.slot_key] = tipsSorted.map((t, idx) => {
        const tipBody = (t.description ?? "").trim();
        return {
          id: `${q.slot_key}-tip-${t.id || idx}`,
          title: t.title || "Tip",
          details: tipBody.replace(/<[^>]*>/g, "").trim() || tipBody,
          detailsHtml: tipBody || undefined,
        };
      });
    }

    const routeToken = r.route_token.trim().toLowerCase();
    const prefix = applicationCodePrefixForToken(routeToken);
    const dedupe = successDedupeSuffixForToken(routeToken);
    const heading = successHeadingForToken(routeToken);
    const preflightConfig = parseDetailPreflightConfig(r.radio_selection);

    const attachmentSlotMap = mergeAttachmentSlotMapWithRequirements(
      r.attachment_slot_map,
      fileSlots
    );

    const row: CatalogServiceRuntime = {
      serviceId: r.service_id,
      routeToken,
      displayName: r.display_name,
      categorySlug: slug,
      categoryLabel: r.category_label || slug,
      categoryHeadline:
        r.category_headline?.trim() ||
        formatCategoryAssistanceTitle(r.category_label || slug),
      introPlain: r.intro_plain,
      preflightConfig,
      fileSlots,
      slotTitles,
      requirementTipsBySlot,
      hasDetailsStep: !!r.has_details_step,
      mobileImageUrl: r.mobile_image_url?.trim() || null,
      attachmentSlotMap,
      slotRequired,
      descriptionPlain: r.description_plain,
      descriptionHtml: r.description_html,
      cmsFonts: r.cms_fonts ?? parseCmsMetadata(null),
      applicationCodePrefix: prefix,
      successDedupeSuffix: dedupe,
      successHeading: heading,
    };

    byServiceId[r.service_id] = row;
    if (routeToken) byRouteToken[routeToken] = row;
  }

  return {
    byServiceId,
    byRouteToken,
    sortedServiceIds: sorted.map((s) => s.service_id),
    categoryHeadlineBySlug,
    categoryLabelBySlug,
    categoryThemeBySlug,
  };
}
