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
import {
  categoryAssistanceNameFromRow,
  categoryAssistanceTitleFromRow,
} from "./CategoryAssistanceNaming";
import type { HomeRequirementItem, RequirementTipItem } from "./ServiceRequirementFieldTypes";
import { supabase } from "./SupabaseClient";

export {
  categoryAssistanceNameFromRow,
  categoryAssistanceTitleFromRow,
  categoryHeadlineFromRow,
  formatCategoryAssistanceTitle,
} from "./CategoryAssistanceNaming";

export type { CmsServiceFonts };

export type CatalogCategoryRow = {
  slug: string;
  assistance_name: string;
  active: boolean | null;
  sort_order?: number | null;
  /** `#RRGGBB` or ApoyoAdmin JSON theme bundle in `theme_json` text column. */
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
  help?: string | null;
  help_html?: string | null;
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
  /** Unix ms when this bundle was last fetched from Supabase (client-side). */
  cachedAt?: number;
};

export const ASSISTANCE_CATALOG_CACHE_KEY =
  "apoyo_assistance_catalog_bundle_v22";

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
      label: categoryAssistanceNameFromRow(c),
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

    const helpHtml = (r.help_html ?? r.help ?? "").trim();
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
    category_label: categoryAssistanceNameFromRow(cat ?? {}),
    category_headline: categoryAssistanceTitleFromRow(cat ?? {}),
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
      categoryLabel: categoryAssistanceNameFromRow(cat ?? {}),
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
      headerTitle: categoryAssistanceTitleFromRow(cat ?? {}),
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

function isMissingCatalogColumnError(error: { message?: string } | null): boolean {
  const m = (error?.message || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("column")
  );
}

function isMissingCategoryEmbedColumnError(error: { message?: string } | null): boolean {
  const m = (error?.message || "").toLowerCase();
  return isMissingCatalogColumnError(error) && m.includes("assistance_categories");
}

function isMissingRequirementHelpColumnError(error: { message?: string } | null): boolean {
  const m = (error?.message || "").toLowerCase();
  return (
    isMissingCatalogColumnError(error) &&
    m.includes("assistance_requirements") &&
    m.includes("help")
  );
}

function assistanceCategoriesEmbed(columns: string[]): string {
  return `assistance_categories ( ${columns.join(", ")} )`;
}

const CATEGORY_COLUMN_ATTEMPTS = [
  ["slug", "assistance_name", "active", "sort_order", "theme_json"],
  ["slug", "assistance_name", "active", "sort_order"],
  ["slug", "label", "headline", "active", "sort_order", "theme_json"],
  ["slug", "label", "active", "sort_order", "theme_json"],
] as const;

const SERVICE_EMBED_ATTEMPTS: readonly string[][] = [
  ["slug", "assistance_name", "active", "sort_order", "theme_json"],
  ["slug", "assistance_name", "active", "sort_order"],
  ["slug", "label", "headline", "active", "sort_order", "theme_json"],
  ["slug", "label", "active", "sort_order", "theme_json"],
];

function serviceEmbedAttemptsForCategoryCols(
  categoryEmbedCols: readonly string[]
): readonly (readonly string[])[] {
  if (categoryEmbedCols.includes("assistance_name")) {
    return SERVICE_EMBED_ATTEMPTS.filter((cols) => cols.includes("assistance_name"));
  }
  if (categoryEmbedCols.includes("label")) {
    return SERVICE_EMBED_ATTEMPTS.filter((cols) => cols.includes("label"));
  }
  return SERVICE_EMBED_ATTEMPTS;
}

function normalizeCategoryRow(raw: Record<string, unknown>): CatalogCategoryRow {
  return {
    slug: String(raw.slug ?? "")
      .trim()
      .toLowerCase(),
    assistance_name: categoryAssistanceNameFromRow(
      raw as Parameters<typeof categoryAssistanceNameFromRow>[0]
    ),
    active: (raw.active as boolean | null) ?? null,
    sort_order:
      typeof raw.sort_order === "number" ? raw.sort_order : Number(raw.sort_order ?? 0),
    theme_json: raw.theme_json,
  };
}

async function fetchCategoryRows(): Promise<{
  rows: CatalogCategoryRow[];
  embedCols: readonly string[];
}> {
  for (const cols of CATEGORY_COLUMN_ATTEMPTS) {
    const { data, error } = await supabase
      .from("assistance_categories")
      .select(cols.join(","))
      .order("sort_order", { ascending: true });

    if (!error && data) {
      return {
        rows: (data as unknown as Record<string, unknown>[]).map(normalizeCategoryRow),
        embedCols: cols,
      };
    }
    if (!isMissingCatalogColumnError(error)) {
      console.warn("[assistanceCatalog] categories fetch failed:", error?.message);
      break;
    }
  }
  return { rows: [], embedCols: ["slug", "assistance_name", "active", "sort_order"] };
}

function assistanceServicesEmbedsPrefix(helpColumn: "help" | "help_html"): string {
  return `
      assistance_requirements (
        id,
        sort_order,
        slot_key,
        title,
        required,
        ${helpColumn},
        metadata,
        assistance_requirement_tips (
          id,
          sort_order,
          title,
          description
        )
      )
`;
}

const REQUIREMENTS_HELP_COLUMN_ATTEMPTS: readonly ("help" | "help_html")[] = [
  "help",
  "help_html",
];

function assistanceServicesSelect(
  includeExtendedColumns: boolean,
  categoryEmbedCols: readonly string[],
  helpColumn: "help" | "help_html"
): string {
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
  const embed = assistanceCategoriesEmbed([...categoryEmbedCols]);
  const requirementsEmbed = assistanceServicesEmbedsPrefix(helpColumn);
  return `${base}${mid}${embed},
${requirementsEmbed}`;
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
  const { rows: categoryRows, embedCols: categoryEmbedCols } =
    await fetchCategoryRows();

  const run = async (
    extended: boolean,
    embedCols: readonly string[],
    helpColumn: "help" | "help_html"
  ) =>
    supabase
      .from("assistance_services")
      .select(assistanceServicesSelect(extended, embedCols, helpColumn))
      .order("sort_order", { ascending: true });

  const embedFamily = serviceEmbedAttemptsForCategoryCols(categoryEmbedCols);
  const embedAttempts: readonly (readonly string[])[] = [
    categoryEmbedCols,
    ...embedFamily.filter((cols) => cols.join(",") !== categoryEmbedCols.join(",")),
  ];

  let embedCols: readonly string[] = embedAttempts[0];
  let selectedHelpColumn: "help" | "help_html" = REQUIREMENTS_HELP_COLUMN_ATTEMPTS[0];
  let data: unknown = null;
  let error: { message?: string } | null = null;

  for (const helpColumn of REQUIREMENTS_HELP_COLUMN_ATTEMPTS) {
    selectedHelpColumn = helpColumn;
    ({ data, error } = await run(true, embedCols, helpColumn));

    if (error && isMissingCategoryEmbedColumnError(error)) {
      for (const attempt of embedAttempts.slice(1)) {
        ({ data, error } = await run(true, attempt, helpColumn));
        if (!error) {
          embedCols = attempt;
          break;
        }
        if (!isMissingCategoryEmbedColumnError(error)) break;
      }
    }
    if (!error) break;
    if (isMissingRequirementHelpColumnError(error)) continue;
    break;
  }

  if (error && isExtendedCatalogColumnsError(error)) {
    console.warn(
      "[assistanceCatalog] Retrying without extended columns (migration may not be applied):",
      error.message
    );
    ({ data, error } = await run(false, embedCols, selectedHelpColumn));
  }

  if (error) {
    const message = error.message ?? "catalog_fetch_error";
    console.warn("[assistanceCatalog] fetch failed:", message);
    return { bundle: null, error: message };
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
