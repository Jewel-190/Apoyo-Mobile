/**
 * Status tab list: fetch from Supabase, normalize, and persist to AsyncStorage.
 * Shared so Home / root layout can prefetch while Status stays the source of truth.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ApplicationItem } from "./AssistanceStatusApplicationsCache";
import { listServiceRequestRecordsForUser } from "./AssistanceRequestsUnifiedQuery";
import type { Category, ServiceStatus } from "./AppUiDomainTypes";
import { STORAGE_KEYS } from "./ClientStorageKeys";
import { normalizeServiceStatus } from "./RequestStatusPresentation";
import { enrichStatusApplicationItem } from "./ServiceCatalogDisplay";
import { getCatalogLookupRuntime } from "./CatalogLookupRuntime";

const STORAGE_KEY = STORAGE_KEYS.statusApplicationsV1;

const REQUEST_STATUSES = [
  "draft",
  "pending",
  "in progress",
  "action required",
  "resubmitted",
  "for approval",
  "scheduled",
  "approved",
  "submitted",
] as const;

export async function readStatusApplicationsCache(): Promise<ApplicationItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const cached = JSON.parse(raw) as unknown[];
    if (!Array.isArray(cached)) return [];
    const normalized = cached.map((x) => ({
      ...(x as object),
      status: normalizeServiceStatus((x as { status?: string })?.status),
    })) as ApplicationItem[];
    return normalized.sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
    );
  } catch {
    return [];
  }
}

export async function writeStatusApplicationsCache(
  sorted: ApplicationItem[]
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
}

/**
 * Loads the current user's applications from the server (same rules as Status tab).
 */
export async function fetchStatusApplicationsFromServer(
  userId: string
): Promise<ApplicationItem[]> {
  const allowedStatuses = new Set(
    REQUEST_STATUSES.map((s) => s.toLowerCase().replace(/_/g, " "))
  );

  let rows: Awaited<ReturnType<typeof listServiceRequestRecordsForUser>>;
  try {
    rows = await listServiceRequestRecordsForUser(userId);
  } catch {
    return [];
  }

  const rt = getCatalogLookupRuntime();
  const items: ApplicationItem[] = [];

  for (const row of rows) {
    const rawStatus = (row.status || "").toString();
    const rawNorm = rawStatus.trim().toLowerCase().replace(/_/g, " ");
    if (rawNorm && !allowedStatuses.has(rawNorm)) continue;

    const isDraft = rawNorm === "draft";
    const status = isDraft ? "Draft" : normalizeServiceStatus(rawStatus);
    const id = isDraft ? `draft_${row.legacy_request_id}` : row.legacy_request_id;

    const svc = rt?.byServiceId[row.service_id];
    const catSlug = (svc?.categorySlug ?? "uncategorized").trim().toLowerCase();
    items.push(
      enrichStatusApplicationItem({
        id,
        title: svc?.displayName ?? row.route_token,
        description: isDraft ? "Continue your application" : "",
        status: status as ServiceStatus,
        category: catSlug as Category,
        categorySlug: catSlug,
        service: row.service_id,
        legacyRequestTable: row.legacy_request_table,
        createdAt: new Date(
          row.legacy_updated_at || row.legacy_created_at || Date.now()
        ).getTime(),
        requestCode: row.request_code ?? undefined,
      })
    );
  }

  return items
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .map(enrichStatusApplicationItem);
}

export async function syncStatusApplicationsWithServer(
  userId: string
): Promise<ApplicationItem[]> {
  const sorted = await fetchStatusApplicationsFromServer(userId);
  await writeStatusApplicationsCache(sorted);
  return sorted;
}
