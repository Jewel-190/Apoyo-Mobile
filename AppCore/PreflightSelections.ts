/**
 * Radio preflight (`assistance_services.radio_selection`) — route params, draft payload,
 * and display labels. No service-specific branches; step ids come from CMS JSON.
 */

import type { DetailPreflightConfig } from "./DetailPreflightConfig";
import { getCatalogLookupRuntime, resolveServiceId } from "./CatalogLookupRuntime";

export const PREFLIGHT_ROUTE_PREFIX = "pf_";

/** Step ids stored on `assistance_requests` top-level columns (not only payload). */
const REQUEST_ROW_STEP_IDS = new Set(["financial_request_type"]);

export function preflightSelectionsToRouteParams(
  selections: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [stepId, value] of Object.entries(selections)) {
    const v = value.trim();
    if (v) out[`${PREFLIGHT_ROUTE_PREFIX}${stepId}`] = v;
  }
  return out;
}

export function preflightSelectionsFromRouteParams(
  raw: Record<string, string | string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, rawVal] of Object.entries(raw)) {
    if (!key.startsWith(PREFLIGHT_ROUTE_PREFIX)) continue;
    const stepId = key.slice(PREFLIGHT_ROUTE_PREFIX.length);
    if (!stepId) continue;
    const v = Array.isArray(rawVal) ? rawVal[0] : rawVal;
    if (typeof v === "string" && v.trim()) out[stepId] = v.trim();
  }
  return out;
}

export function payloadToPreflightSelections(
  payload: unknown
): Record<string, string> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function preflightSelectionsToDraftPatch(selections: Record<string, string>): {
  row: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  const row: Record<string, unknown> = {};
  const payload: Record<string, unknown> = { ...selections };

  for (const [stepId, value] of Object.entries(selections)) {
    if (REQUEST_ROW_STEP_IDS.has(stepId)) {
      row[stepId] = value;
      delete payload[stepId];
    }
  }

  return { row, payload };
}

export function draftPatchFromRouteParams(
  raw: Record<string, string | string[] | undefined>
): Record<string, unknown> {
  const selections = preflightSelectionsFromRouteParams(raw);
  const { row, payload } = preflightSelectionsToDraftPatch(selections);
  return { ...row, ...(Object.keys(payload).length ? { payload } : {}) };
}

function labelForStepValue(
  config: DetailPreflightConfig,
  stepId: string,
  rawValue: string
): string {
  const step = config.steps.find((s) => s.id === stepId);
  if (!step) return rawValue;
  const hit = step.options.find((o) => o.value === rawValue);
  return hit?.label ?? rawValue;
}

export function buildPreflightChoiceLines(
  serviceId: string,
  sources: {
    routeParams?: Record<string, string | string[] | undefined>;
    payload?: unknown;
    financialRequestType?: string | null;
  }
): { label: string; value: string }[] {
  const sid = resolveServiceId(serviceId) ?? serviceId;
  const config =
    getCatalogLookupRuntime()?.byServiceId[sid]?.preflightConfig ?? null;

  const selections: Record<string, string> = {
    ...payloadToPreflightSelections(sources.payload),
    ...preflightSelectionsFromRouteParams(sources.routeParams ?? {}),
  };

  const fin = (sources.financialRequestType || "").trim();
  if (fin) selections.financial_request_type = fin;

  if (!config?.steps?.length) {
    const lines: { label: string; value: string }[] = [];
    for (const [k, v] of Object.entries(selections)) {
      if (!v) continue;
      lines.push({
        label: k.replace(/_/g, " "),
        value: v,
      });
    }
    return lines;
  }

  return config.steps
    .map((step) => {
      const raw = selections[step.id];
      if (!raw) return null;
      return {
        label: step.prompt,
        value: labelForStepValue(config, step.id, raw),
      };
    })
    .filter((x): x is { label: string; value: string } => x != null);
}
