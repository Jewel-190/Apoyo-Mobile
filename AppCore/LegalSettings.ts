/**
 * Public legal copy from Superadmin CMS (Service Settings → Legal).
 *
 * Stored in `public.settings` as scope=system, key=legal, visibility=public:
 * {
 *   "terms-and-conditions": { sections: [{ heading, body }] },
 *   "user-acceptance": { sections: [{ heading, body }] }
 * }
 *
 * Page titles/slugs are hardcoded (same as ApoyoAdmin `legalSettings.js`).
 * Only section heading + body are fetched from CMS.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";
import { hasVisibleCmsContent } from "./CmsRichText";
import { supabase } from "./SupabaseClient";

export const LEGAL_SCOPE = "system" as const;
export const LEGAL_KEY = "legal" as const;

export const LEGAL_PAGES = [
  {
    slug: "terms-and-conditions",
    title: "Terms and Conditions",
    acceptLabel: "I have read and agree to the Terms and Conditions.",
  },
  {
    slug: "user-acceptance",
    title: "User Acceptance",
    acceptLabel: "I have read and accept the User Acceptance terms.",
  },
] as const;

export type LegalPageSlug = (typeof LEGAL_PAGES)[number]["slug"];
export type LegalSection = { heading: string; body: string };
export type LegalPageRecord = { sections: LegalSection[] };
export type LegalSettingsValue = Record<LegalPageSlug, LegalPageRecord>;

const LEGAL_CACHE_TTL_MS = 2 * 60 * 1000;

let legalMemory: LegalSettingsValue | null = null;
let legalFetchedAtMs = 0;
let legalInflight: Promise<LegalSettingsValue> | null = null;

/** Sync snapshot so the legal screen can render without a loading flash. */
export function peekLegalSettings(): LegalSettingsValue | null {
  return legalMemory;
}

function emptyPageRecord(): LegalPageRecord {
  return { sections: [] };
}

export const LEGAL_DEFAULTS: LegalSettingsValue = {
  "terms-and-conditions": emptyPageRecord(),
  "user-acceptance": emptyPageRecord(),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSection(section: unknown): LegalSection {
  const src = isPlainObject(section) ? section : {};
  return {
    heading: String(src.heading ?? ""),
    body: String(src.body ?? ""),
  };
}

function matchesPage(entry: unknown, slug: LegalPageSlug): boolean {
  if (!isPlainObject(entry)) return false;
  const pageSlug = String(entry.slug ?? "").trim().toLowerCase();
  const title = String(entry.title ?? "").trim().toLowerCase();
  if (pageSlug === slug) return true;
  if (slug === "terms-and-conditions") {
    return pageSlug === "legal" || pageSlug === "terms" || title.includes("terms");
  }
  if (slug === "user-acceptance") {
    return title.includes("user acceptance") || title.includes("acceptance");
  }
  return false;
}

function pickPageSections(value: unknown, slug: LegalPageSlug): unknown[] {
  const src = isPlainObject(value) ? value : {};
  const named = src[slug];
  if (isPlainObject(named) && Array.isArray(named.sections)) return named.sections;

  if (Array.isArray(src.pages) && src.pages.length) {
    const match = src.pages.find((entry) => matchesPage(entry, slug));
    if (isPlainObject(match) && Array.isArray(match.sections)) return match.sections;
  }

  if (slug === "terms-and-conditions") {
    if (Array.isArray(src.sections)) return src.sections;
    if (isPlainObject(src.terms) && Array.isArray(src.terms.sections)) {
      return src.terms.sections;
    }
  }

  if (
    slug === "user-acceptance" &&
    isPlainObject(src.userAcceptance) &&
    Array.isArray(src.userAcceptance.sections)
  ) {
    return src.userAcceptance.sections;
  }

  return [];
}

/** Same whitelist as admin `toStoredLegalValue`. */
export function normalizeLegalSettings(value: unknown): LegalSettingsValue {
  const next = { ...LEGAL_DEFAULTS };
  for (const page of LEGAL_PAGES) {
    next[page.slug] = {
      sections: pickPageSections(value, page.slug).map(normalizeSection),
    };
  }
  return next;
}

export function getLegalPage(slug: string | null | undefined) {
  const needle = String(slug ?? "").trim().toLowerCase();
  return LEGAL_PAGES.find((page) => page.slug === needle) ?? null;
}

export function getLegalPageSections(
  value: LegalSettingsValue,
  slug: LegalPageSlug
): LegalSection[] {
  const sections = value[slug]?.sections;
  return Array.isArray(sections) ? sections : [];
}

export function legalSectionHasContent(section: LegalSection): boolean {
  return Boolean(section.heading.trim()) || hasVisibleCmsContent(section.body);
}

export function legalPageHasContent(sections: LegalSection[]): boolean {
  return sections.some(legalSectionHasContent);
}

function djb2Hex(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

/** Stable content version so users re-accept after CMS edits. */
export function legalContentFingerprint(value: LegalSettingsValue): string {
  const canonical = LEGAL_PAGES.map((page) => ({
    slug: page.slug,
    sections: getLegalPageSections(value, page.slug).map((section) => ({
      heading: section.heading.trim(),
      body: section.body.trim(),
    })),
  }));
  return djb2Hex(JSON.stringify(canonical));
}

export function legalPageRoute(
  slug: LegalPageSlug,
  mode?: "accept" | "view"
): `/phase1/legal/${LegalPageSlug}` | `/phase1/legal/${LegalPageSlug}?mode=${string}` {
  return mode
    ? `/phase1/legal/${slug}?mode=${mode}`
    : `/phase1/legal/${slug}`;
}

async function readCachedLegal(
  now: number
): Promise<LegalSettingsValue | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.legalSettingsCache);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      value?: unknown;
      fetchedAtMs?: number;
    };
    if (
      typeof parsed.fetchedAtMs !== "number" ||
      now - parsed.fetchedAtMs >= LEGAL_CACHE_TTL_MS
    ) {
      return null;
    }
    return normalizeLegalSettings(parsed.value);
  } catch {
    return null;
  }
}

export async function fetchLegalSettings(options?: {
  force?: boolean;
}): Promise<LegalSettingsValue> {
  const force = options?.force === true;
  const now = Date.now();

  if (
    !force &&
    legalMemory &&
    now - legalFetchedAtMs < LEGAL_CACHE_TTL_MS
  ) {
    return legalMemory;
  }

  if (legalInflight) return legalInflight;

  legalInflight = (async () => {
    if (!force) {
      const cached = await readCachedLegal(now);
      if (cached) {
        legalMemory = cached;
        legalFetchedAtMs = now;
        return cached;
      }
    }

    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("scope", LEGAL_SCOPE)
      .eq("key", LEGAL_KEY)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    const value = normalizeLegalSettings(data?.value);
    legalMemory = value;
    legalFetchedAtMs = Date.now();
    await AsyncStorage.setItem(
      STORAGE_KEYS.legalSettingsCache,
      JSON.stringify({ value, fetchedAtMs: legalFetchedAtMs })
    );
    return value;
  })();

  try {
    return await legalInflight;
  } finally {
    legalInflight = null;
  }
}
