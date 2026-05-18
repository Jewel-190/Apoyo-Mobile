/**
 * Loads published assistance catalog from Supabase (CMS).
 */

import {
  buildAssistanceCatalogRuntime,
  type AssistanceCatalogRuntime,
  type CatalogRowForRuntime,
  setCatalogLookupRuntime,
} from "./CatalogLookupRuntime";
import { parseDetailPreflightConfig } from "./DetailPreflightConfig";
import {
  parseAssistanceCategoryTheme,
  type AssistanceCategoryTheme,
} from "./AssistanceCategoryTheme";
import {
  CMS_ADDITIONAL_ATTACHMENT_DEFAULT_TITLE,
  isAdditionalAttachmentSlot,
  parseRequirementMetadata,
} from "./CatalogContentParse";
import { parseCmsMetadata, type CmsServiceFonts } from "./CmsTypography";
import type { HomeRequirementItem, RequirementTipItem } from "./ServiceRequirementFieldTypes";
import { supabase } from "./SupabaseClient";

export type { CmsServiceFonts };

export type CatalogCategoryRow = {
  slug: string;
  label: string;
  headline: string;
  active: boolean | null;
  sort_order?: number | null;
  /** Single `#RRGGBB` from DB; legacy objects may appear from old caches. */
  theme_json?: string | unknown;
};

export type CatalogRequirementTipRow = {
  id: string;
  sort_order: number;
  title: string;
  description: string;
};

export type CatalogRequirementRow = {
  id: string;
  sort_order: number;
  slot_key: string;
  title: string;
  required: boolean | null;
  help_html: string | null;
  metadata: unknown;
  assistance_requirement_tips: CatalogRequirementTipRow[] | null;
};

export type CatalogServiceRow = {
  id: string;
  request_code_token: string | null;
  display_name: string;
  description_html: string;
  reminder_text: string;
  sort_order: number;
  active: boolean | null;
  about_html: string | null;
  who_bullets: unknown;
  mobile_image_url: string | null;
  radio_selection: unknown;
  attachment_slot_map?: unknown;
  cms_metadata?: unknown;
  assistance_categories: CatalogCategoryRow | CatalogCategoryRow[] | null;
  assistance_requirements: CatalogRequirementRow[] | null;
};

export type HomeCatalogCategoryChip = {
  slug: string;
  label: string;
  sort_order: number;
};

export type HomeCatalogService = {
  id: string;
  title: string;
  desc: string;
  /** Raw `description_html` for card rich text. */
  descHtml: string;
  descriptionFontFamily: string;
  cardStripeGradient: [string, string];
  iconUrl: string | null;
  categorySlug: string;
  categoryLabel: string;
};

export type HomeDetailsPage = {
  headerTitle: string;
  serviceTitle: string;
  /** Plain-text summary for cards (from `description_html`). */
  serviceDesc: string;
  /** Raw HTML — service card / intro (`description_html`). */
  descriptionHtml: string;
  /** Plain-text About fallback. */
  about: string;
  /** Raw HTML — About Service section (`about_html`). */
  aboutHtml: string;
  cmsFonts: CmsServiceFonts;
  who: string[];
  categorySlug: string;
  reminderTitle: string;
  /** Raw HTML: `reminder_text`, else preflight `radio_selection.reminder_html`. */
  reminderHtml: string;
  requirementsTitle: string;
  requirements: HomeRequirementItem[];
  /** Fixed mobile upload row (`attachment` slot), shown after requirements. */
  additionalAttachmentTitle: string | null;
  applyLabel: string;
};

export type AssistanceCatalogBundle = {
  categoryFilters: HomeCatalogCategoryChip[];
  services: HomeCatalogService[];
  detailsByServiceId: Record<string, HomeDetailsPage>;
  requirementTipsByServiceId: Record<
    string,
    Record<string, RequirementTipItem[]>
  >;
  runtime: AssistanceCatalogRuntime;
};

export const ASSISTANCE_CATALOG_CACHE_KEY =
  "apoyo_assistance_catalog_bundle_v19";

export type { AssistanceCatalogRuntime, CatalogServiceRuntime } from "./CatalogLookupRuntime";

export {
  getCatalogLookupRuntime as getAssistanceCatalogRuntime,
  setCatalogLookupRuntime as setAssistanceCatalogRuntime,
} from "./CatalogLookupRuntime";

export {
  resolveCanonicalServiceKey,
  resolveRouteToken,
  resolveServiceId,
} from "./CatalogLookupRuntime";

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapSingle<T>(row: T | T[] | null | undefined): T | null {
  if (row == null) return null;
  return Array.isArray(row) ? row[0] ?? null : row;
}

function buildCategoryThemeBySlug(
  categoryRows: CatalogCategoryRow[],
  serviceCategorySlugs: string[]
): Record<string, AssistanceCategoryTheme> {
  const out: Record<string, AssistanceCategoryTheme> = {};
  for (const r of categoryRows) {
    const slug = r.slug.trim().toLowerCase();
    out[slug] = parseAssistanceCategoryTheme(slug, r.theme_json);
  }
  for (const raw of serviceCategorySlugs) {
    const slug = raw.trim().toLowerCase();
    if (!out[slug]) out[slug] = parseAssistanceCategoryTheme(slug, undefined);
  }
  return out;
}

function buildCategoryFilters(
  categoryRows: CatalogCategoryRow[],
  slugsWithServices: Set<string>
): HomeCatalogCategoryChip[] {
  return categoryRows
    .filter(
      (c) =>
        c.active !== false &&
        slugsWithServices.has(c.slug.trim().toLowerCase())
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c) => ({
      slug: c.slug.trim().toLowerCase(),
      label: c.label,
      sort_order: Number(c.sort_order ?? 0),
    }));
}

function parseWhoBullets(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  return [];
}

function mapRequirementsForMobile(rows: CatalogRequirementRow[] | null): {
  requirements: HomeRequirementItem[];
  additionalAttachmentTitle: string | null;
} {
  if (!rows?.length) {
    return { requirements: [], additionalAttachmentTitle: null };
  }

  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  let additionalAttachmentTitle: string | null = null;
  const requirements: HomeRequirementItem[] = [];

  for (const r of sorted) {
    const title = (r.title ?? "").trim();
    if (isAdditionalAttachmentSlot(r.slot_key)) {
      additionalAttachmentTitle =
        title || CMS_ADDITIONAL_ATTACHMENT_DEFAULT_TITLE;
      continue;
    }
    if (!title) continue;

    const helpHtml = (r.help_html ?? "").trim();
    const sample = parseRequirementMetadata(r.metadata);
    requirements.push({
      id: r.slot_key,
      title,
      details: stripHtml(helpHtml) || undefined,
      detailsHtml: helpHtml || undefined,
      sampleDocumentImage: sample.sampleDocumentImage || undefined,
      sampleDocumentName: sample.sampleDocumentName || undefined,
    });
  }

  return { requirements, additionalAttachmentTitle };
}

function parseAttachmentSlotMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function mapTips(
  rows: CatalogRequirementRow[] | null
): Record<string, RequirementTipItem[]> {
  const out: Record<string, RequirementTipItem[]> = {};
  if (!rows?.length) return out;
  for (const r of rows) {
    const tips = r.assistance_requirement_tips;
    if (!tips?.length) continue;
    const sorted = [...tips].sort((a, b) => a.sort_order - b.sort_order);
    out[r.slot_key] = sorted.map((t, idx) => {
      const tipBody = (t.description ?? "").trim();
      return {
        id: `${r.slot_key}-tip-${t.id || idx}`,
        title: t.title || "Tip",
        details: stripHtml(tipBody) || tipBody,
        detailsHtml: tipBody || undefined,
      };
    });
  }
  return out;
}

function toRuntimeRow(r: CatalogServiceRow): CatalogRowForRuntime {
  const cat = unwrapSingle(r.assistance_categories);
  const reqs = (r.assistance_requirements ?? []).map((rq) => ({
    slot_key: rq.slot_key,
    sort_order: rq.sort_order,
    title: rq.title,
    required: rq.required,
    tips: (rq.assistance_requirement_tips ?? []).map((t) => ({
      id: t.id,
      sort_order: t.sort_order,
      title: t.title,
      description: t.description,
    })),
  }));

  const routeToken = (r.request_code_token || r.id).trim().toLowerCase();
  const descriptionPlain = stripHtml(r.description_html);

  return {
    service_id: r.id,
    route_token: routeToken,
    display_name: r.display_name,
    has_details_step: !!parseDetailPreflightConfig(r.radio_selection)?.steps?.length,
    mobile_image_url: r.mobile_image_url,
    intro_plain: descriptionPlain,
    radio_selection: r.radio_selection,
    category_slug: (cat?.slug ?? "uncategorized").trim().toLowerCase(),
    category_label: cat?.label ?? cat?.slug ?? "Assistance",
    category_headline: cat?.headline ?? "Assistance",
    requirements: reqs,
    attachment_slot_map: parseAttachmentSlotMap(r.attachment_slot_map),
    description_plain: descriptionPlain,
    description_html: (r.description_html ?? "").trim(),
    cms_fonts: parseCmsMetadata(r.cms_metadata),
  };
}

export function bundleCatalogRows(
  rows: CatalogServiceRow[],
  categoryRows: CatalogCategoryRow[] = []
): AssistanceCatalogBundle | null {
  const activeRows = rows.filter((r) => r.active !== false);
  const eligible = activeRows.filter((r) => {
    const cat = unwrapSingle(r.assistance_categories);
    return cat && cat.active !== false;
  });
  if (!eligible.length) return null;

  const sorted = [...eligible].sort((a, b) => a.sort_order - b.sort_order);

  const slugsWithServices = new Set<string>();
  for (const r of sorted) {
    const cat = unwrapSingle(r.assistance_categories);
    const slug = (cat?.slug ?? "uncategorized").trim().toLowerCase();
    slugsWithServices.add(slug);
  }

  const categoryThemeBySlug = buildCategoryThemeBySlug(
    categoryRows,
    [...slugsWithServices]
  );
  const categoryFilters = buildCategoryFilters(categoryRows, slugsWithServices);

  const runtime = buildAssistanceCatalogRuntime(
    sorted.map(toRuntimeRow),
    categoryThemeBySlug
  );
  setCatalogLookupRuntime(runtime);

  const services: HomeCatalogService[] = sorted.map((r) => {
    const cat = unwrapSingle(r.assistance_categories);
    const slug = (cat?.slug ?? "uncategorized").trim().toLowerCase();
    const stripe = categoryThemeBySlug[slug]?.homeCardStripeGradient;
    const descHtml = (r.description_html ?? "").trim();
    const cmsFonts = parseCmsMetadata(r.cms_metadata);
    return {
      id: r.id,
      title: r.display_name,
      desc: stripHtml(descHtml),
      descHtml,
      descriptionFontFamily: cmsFonts.descriptionFontFamily,
      cardStripeGradient: stripe,
      iconUrl: r.mobile_image_url?.trim() || null,
      categorySlug: slug,
      categoryLabel: cat?.label ?? slug,
    };
  });

  const detailsByServiceId: Record<string, HomeDetailsPage> = {};
  const requirementTipsByServiceId: Record<
    string,
    Record<string, RequirementTipItem[]>
  > = {};

  for (const r of sorted) {
    const cat = unwrapSingle(r.assistance_categories);
    const who = parseWhoBullets(r.who_bullets);
    const cmsFonts = parseCmsMetadata(r.cms_metadata);
    const descriptionHtml = (r.description_html ?? "").trim();
    const aboutHtml = (r.about_html ?? "").trim();
    const aboutPlain = stripHtml(aboutHtml) || stripHtml(descriptionHtml);
    const slug = (cat?.slug ?? "uncategorized").trim().toLowerCase();
    const preflightReminder =
      typeof r.radio_selection === "object" &&
      r.radio_selection !== null &&
      !Array.isArray(r.radio_selection)
        ? String(
            (r.radio_selection as Record<string, unknown>).reminder_html ?? ""
          ).trim()
        : "";
    const reminderHtml =
      (r.reminder_text ?? "").trim() || preflightReminder;
    const { requirements, additionalAttachmentTitle } = mapRequirementsForMobile(
      r.assistance_requirements
    );

    detailsByServiceId[r.id] = {
      headerTitle: cat?.headline ?? "Assistance",
      serviceTitle: r.display_name,
      serviceDesc: stripHtml(descriptionHtml),
      descriptionHtml,
      about: aboutPlain,
      aboutHtml,
      cmsFonts,
      who,
      categorySlug: slug,
      reminderTitle: "Reminder",
      reminderHtml,
      requirementsTitle: "Requirements",
      requirements,
      additionalAttachmentTitle,
      applyLabel: "Apply Now",
    };

    requirementTipsByServiceId[r.id] = mapTips(
      r.assistance_requirements
    );
  }

  return {
    categoryFilters,
    services,
    detailsByServiceId,
    requirementTipsByServiceId,
    runtime,
  };
}

/** Columns added by migration `202605110007_mobile_catalog_attachment_maps.sql`. */
const ASSISTANCE_SERVICES_EXTENDED_COLUMNS = `
      attachment_slot_map,
`;

const ASSISTANCE_SERVICES_EMBEDS = `
      assistance_categories ( slug, label, headline, active, sort_order ),
      assistance_requirements (
        id,
        sort_order,
        slot_key,
        title,
        required,
        help_html,
        metadata,
        assistance_requirement_tips (
          id,
          sort_order,
          title,
          description
        )
      )
`;

function assistanceServicesSelect(includeExtendedColumns: boolean): string {
  const base = `
      id,
      request_code_token,
      display_name,
      description_html,
      reminder_text,
      sort_order,
      active,
      about_html,
      who_bullets,
      mobile_image_url,
      radio_selection,
      cms_metadata,
`;
  const mid = includeExtendedColumns ? `${ASSISTANCE_SERVICES_EXTENDED_COLUMNS}` : "";
  return `${base}${mid}${ASSISTANCE_SERVICES_EMBEDS}`;
}

/** PostgREST fails the whole select if any requested column is missing from the DB. */
function isExtendedCatalogColumnsError(error: { message?: string }): boolean {
  const m = (error.message || "").toLowerCase();
  return m.includes("attachment_slot_map");
}

export type FetchAssistanceCatalogResult = {
  bundle: AssistanceCatalogBundle | null;
  /** Set when the Supabase request fails or returns unusable data. */
  error: string | null;
};

export async function fetchAssistanceCatalog(): Promise<FetchAssistanceCatalogResult> {
  const run = async (extended: boolean) =>
    supabase
      .from("assistance_services")
      .select(assistanceServicesSelect(extended))
      .order("sort_order", { ascending: true });

  const catQuery = supabase
    .from("assistance_categories")
    .select("slug,label,headline,sort_order,active,theme_json")
    .order("sort_order", { ascending: true });

  const [{ data: catData, error: catError }, firstSvc] = await Promise.all([
    catQuery,
    run(true),
  ]);

  let categoryRows: CatalogCategoryRow[] = [];
  if (catError) {
    const msg = (catError.message || "").toLowerCase();
    if (msg.includes("theme_json")) {
      const retry = await supabase
        .from("assistance_categories")
        .select("slug,label,headline,sort_order,active")
        .order("sort_order", { ascending: true });
      if (!retry.error && retry.data) {
        categoryRows = (retry.data as CatalogCategoryRow[]).map((c) => ({
          ...c,
          theme_json: undefined,
        }));
      } else {
        console.warn(
          "[assistanceCatalog] categories fetch failed:",
          catError.message
        );
      }
    } else {
      console.warn("[assistanceCatalog] categories fetch failed:", catError.message);
    }
  } else {
    categoryRows = (catData ?? []) as CatalogCategoryRow[];
  }

  let { data, error } = firstSvc;

  if (error && isExtendedCatalogColumnsError(error)) {
    console.warn(
      "[assistanceCatalog] Retrying without extended columns (migration may not be applied):",
      error.message
    );
    ({ data, error } = await run(false));
  }

  if (error) {
    console.warn("[assistanceCatalog] fetch failed:", error.message);
    return { bundle: null, error: error.message };
  }

  const rows = (data || []) as unknown as CatalogServiceRow[];
  const bundle = bundleCatalogRows(rows, categoryRows);
  if (!bundle) {
    setCatalogLookupRuntime(null);
    return {
      bundle: null,
      error: "catalog_empty_or_all_inactive",
    };
  }

  return { bundle, error: null };
}
