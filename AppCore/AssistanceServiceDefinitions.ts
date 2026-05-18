/**
 * Service lookups driven by `AssistanceCatalogRuntime` (Supabase `assistance_services`).
 * No static eight-service registry — hydrate catalog early via `useAssistanceCatalog` / cache parse.
 */

import {
  getCatalogLookupRuntime,
  resolveServiceId,
} from "./CatalogLookupRuntime";
import { ASSISTANCE_REQUESTS_TABLE } from "./AssistanceRequestSql";
import { requestFormPath, requestSuccessPath } from "./RequestPipelineRoutes";
import type { RequestTableName } from "./AssistanceRequestTables";

/** `assistance_categories.slug` — dynamic from CMS. */
export type ServiceCategory = string;

/** Canonical id = `assistance_services.id` (UUID). */
export type ServiceId = string;

export type ServiceDefinition = {
  id: ServiceId;
  routeToken: string;
  label: string;
  title: string;
  category: ServiceCategory;
  requestTable: RequestTableName;
  requestRoute: string;
  successRoute: string;
  fileSlots: string[];
  hasDetailsStep: boolean;
};

function categoryFromSlug(slug: string): ServiceCategory {
  return slug.trim().toLowerCase() || "uncategorized";
}

function definitionFromRuntimeId(serviceId: string): ServiceDefinition | null {
  const rt = getCatalogLookupRuntime();
  const row = rt?.byServiceId[serviceId];
  if (!row) return null;

  return {
    id: row.serviceId,
    routeToken: row.routeToken,
    label: row.displayName,
    title: row.displayName,
    category: categoryFromSlug(row.categorySlug),
    requestTable: ASSISTANCE_REQUESTS_TABLE as RequestTableName,
    requestRoute: requestFormPath(row.serviceId),
    successRoute: requestSuccessPath(row.serviceId),
    fileSlots: row.fileSlots,
    hasDetailsStep: row.hasDetailsStep,
  };
}

export function getService(
  id: string | null | undefined
): ServiceDefinition | null {
  const serviceId = resolveServiceId(id ?? "");
  if (!serviceId) return null;
  return definitionFromRuntimeId(serviceId);
}

export function getServiceByTable(
  _table: string | null | undefined
): ServiceDefinition | null {
  return null;
}

export function listServicesFromCatalog(): ServiceDefinition[] {
  const rt = getCatalogLookupRuntime();
  if (!rt) return [];
  return rt.sortedServiceIds
    .map((id) => definitionFromRuntimeId(id))
    .filter((x): x is ServiceDefinition => x != null);
}

/** @deprecated Prefer listServicesFromCatalog — placeholder during migration. */
export const SERVICE_LIST: ServiceDefinition[] = [];

/** @deprecated No longer used — runtime replaces registry. */
export const SERVICES: Record<string, ServiceDefinition> = {};

export function tableForService(id: ServiceId): RequestTableName {
  if (!getService(id)) {
    throw new Error(`Catalog not loaded or unknown service: ${id}`);
  }
  return ASSISTANCE_REQUESTS_TABLE as RequestTableName;
}

export function reqRouteForService(id: ServiceId): string {
  const r = getService(id)?.requestRoute;
  if (!r) throw new Error(`Catalog not loaded or unknown service: ${id}`);
  return r;
}

export function successRouteForService(id: ServiceId): string {
  const r = getService(id)?.successRoute;
  if (!r) throw new Error(`Catalog not loaded or unknown service: ${id}`);
  return r;
}
