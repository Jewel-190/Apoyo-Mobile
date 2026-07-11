/**
 * Local AsyncStorage cache for the end-user “applications” list shown on Status.
 * Also used after successful submission to seed that list.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";
import type { Category, ServiceStatus } from "./AppUiDomainTypes";

export type { Category, ServiceStatus };

/**
 * One row in the on-device status list. Fields are optional where a source
 * (cache vs Supabase merge) may not populate them.
 */
export type ApplicationItem = {
  id: string;
  title: string;
  description: string;
  /** Service `description_html` when catalog is loaded (non-draft cards). */
  descriptionHtml?: string;
  /** CSS stack from `cms_metadata.descriptionFontFamily`. */
  descriptionFontFamily?: string;
  status: ServiceStatus;
  category: Category;
  /** `assistance_categories.slug` for CMS-driven theming. */
  categorySlug?: string;
  createdAt?: number;
  /** e.g. MAHE-2026-001 */
  applicationId?: string;
  dateLabel?: string;
  service?: string;
  legacyRequestTable?: string;
  requestCode?: string;
};

const STORAGE_KEY_STATUS_LIST = STORAGE_KEYS.statusApplicationsV1;

/** One cache row per `assistance_requests.id` (draft cards use `draft_` prefix). */
export function statusApplicationRealId(itemOrId: ApplicationItem | string): string {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
  return id.startsWith("draft_") ? id.slice("draft_".length) : id;
}

/** Collapse draft + submitted duplicates; prefer the non-draft row. */
export function dedupeStatusApplications(
  items: ApplicationItem[]
): ApplicationItem[] {
  const byReal = new Map<string, ApplicationItem>();

  for (const item of items) {
    const key = statusApplicationRealId(item);
    const prev = byReal.get(key);
    if (!prev) {
      byReal.set(key, item);
      continue;
    }

    const prevDraft = prev.status === "Draft";
    const nextDraft = item.status === "Draft";
    if (prevDraft && !nextDraft) {
      byReal.set(key, item);
      continue;
    }
    if (!prevDraft && nextDraft) {
      continue;
    }
    if (prev.id.startsWith("draft_") && !item.id.startsWith("draft_")) {
      byReal.set(key, item);
    }
  }

  return [...byReal.values()].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
  );
}

export async function getStatusApplications(): Promise<ApplicationItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_STATUS_LIST);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cleaned: ApplicationItem[] = parsed
      .map((x: unknown) => {
        const r = x as Record<string, unknown>;
        return {
          id: String(r?.id ?? `APP-${Date.now()}`),
          title: String(r?.title ?? ""),
          description: String(r?.description ?? ""),
          status: (r?.status as ServiceStatus) ?? "Pending",
          categorySlug: r?.categorySlug
            ? String(r.categorySlug).trim().toLowerCase()
            : r?.category
              ? String(r.category).trim().toLowerCase()
              : undefined,
          category: (r?.categorySlug
            ? String(r.categorySlug).trim().toLowerCase()
            : r?.category
              ? String(r.category).trim().toLowerCase()
              : "uncategorized") as Category,
          createdAt:
            typeof r?.createdAt === "number" ? r.createdAt : Date.now(),
          applicationId: r?.applicationId
            ? String(r.applicationId)
            : undefined,
          dateLabel: r?.dateLabel ? String(r.dateLabel) : undefined,
          service: r?.service ? String(r.service) : undefined,
          legacyRequestTable: r?.legacyRequestTable
            ? String(r.legacyRequestTable)
            : undefined,
          requestCode: r?.requestCode ? String(r.requestCode) : undefined,
        };
      })
      .filter((x) => x.title.trim().length > 0);

    return dedupeStatusApplications(cleaned);
  } catch (err) {
    if (__DEV__) {
      console.warn(
        "[AssistanceStatusApplicationsCache] failed to read status cache",
        err
      );
    }
    return [];
  }
}

export async function addStatusApplication(app: ApplicationItem) {
  const list = await getStatusApplications();
  const key = statusApplicationRealId(app);
  const filtered = list.filter((x) => statusApplicationRealId(x) !== key);
  const next = dedupeStatusApplications([app, ...filtered]);
  await AsyncStorage.setItem(STORAGE_KEY_STATUS_LIST, JSON.stringify(next));
}

/** After submit: replace draft row with pending item keyed by real request UUID. */
export async function upsertSubmittedStatusApplication(
  app: ApplicationItem,
  requestId: string
): Promise<void> {
  const realId = requestId.trim();
  if (!realId) {
    await addStatusApplication(app);
    return;
  }

  const list = await getStatusApplications();
  const normalized: ApplicationItem = { ...app, id: realId };
  const filtered = list.filter((x) => statusApplicationRealId(x) !== realId);
  const next = dedupeStatusApplications([normalized, ...filtered]);
  await AsyncStorage.setItem(STORAGE_KEY_STATUS_LIST, JSON.stringify(next));
}

export async function getStatusApplicationById(id: string) {
  const list = await getStatusApplications();
  return list.find((x) => x.id === id) ?? null;
}

export function makeStatusId(prefix = "APP") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function makeApplicationId(prefix: string) {
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${year}-${seq}`;
}

export function prettyDate(ts?: number) {
  const d = new Date(typeof ts === "number" ? ts : Date.now());
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
