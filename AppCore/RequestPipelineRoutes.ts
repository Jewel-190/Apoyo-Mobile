/**
 * Request form and success screens live under `/Home/request/*` as named routes
 * (`RequestFields`, `SubmissionSuccess`, …) with `serviceId` in search params.
 */

import {
  getCatalogLookupRuntime,
  resolveServiceId,
} from "./CatalogLookupRuntime";

export const REQUEST_FIELDS_PATH = "/Home/request/RequestFields";
export const REQUEST_SUCCESS_PATH = "/Home/request/SubmissionSuccess";

export function pickRouteParam(
  v: string | string[] | undefined
): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() ? s.trim() : undefined;
}

/** Resolves catalog `assistance_services.id` from navigation params. */
export function pickServiceIdFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  globalParams: Record<string, string | string[] | undefined>
): string | undefined {
  return (
    pickRouteParam(params.serviceId) ||
    pickRouteParam(globalParams.serviceId) ||
    pickRouteParam(params.serviceKey) ||
    pickRouteParam(globalParams.serviceKey)
  );
}

/** @deprecated Use `pickServiceIdFromSearchParams`. */
export function pickServiceKeyFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  globalParams: Record<string, string | string[] | undefined>
): string | undefined {
  return pickServiceIdFromSearchParams(params, globalParams);
}

export function normalizeRouteServiceId(
  raw: string | string[] | undefined
): string | null {
  const key = Array.isArray(raw) ? raw[0] : raw;
  return resolveServiceId(String(key ?? ""));
}

/** @deprecated Use `normalizeRouteServiceId`. */
export function normalizeRouteServiceKey(
  raw: string | string[] | undefined
): string | null {
  return normalizeRouteServiceId(raw);
}

export function requestFormPath(_serviceId: string): string {
  return REQUEST_FIELDS_PATH;
}

export function requestSuccessPath(_serviceId: string): string {
  return REQUEST_SUCCESS_PATH;
}

export function defaultSubmissionSuccessPath(): string {
  const rt = getCatalogLookupRuntime();
  const first = rt?.sortedServiceIds[0];
  return first ? requestSuccessPath(first) : "/Home/Home";
}

export function defaultServiceFormPath(): string {
  const rt = getCatalogLookupRuntime();
  if (rt?.sortedServiceIds?.length) return REQUEST_FIELDS_PATH;
  return "/Home/Home";
}

export function requestFormPathFromUnknown(raw: string): string {
  const id = normalizeRouteServiceId(raw);
  return id ? requestFormPath(id) : defaultServiceFormPath();
}
