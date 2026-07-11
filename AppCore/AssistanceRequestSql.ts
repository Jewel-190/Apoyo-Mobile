/**
 * Typed CRUD for `public.assistance_requests` (unified request rows).
 *
 * `request_attachments` rows link via `assistance_request_id` only.
 */

import { supabase } from "./SupabaseClient";
import { type ServiceId, getService } from "./AssistanceServiceDefinitions";
import type { RequestTableName } from "./AssistanceRequestTables";
import type { RequestRowSkeleton, RequestsViewRow } from "./DatabaseRowAliases";

export const ASSISTANCE_REQUESTS_TABLE = "assistance_requests";

/**
 * One in-flight draft insert per (userId, serviceId) for the whole JS runtime.
 * Survives React Strict Mode remounts and concurrent callers (rapid file picks +
 * save draft) so we do not create multiple `assistance_requests` rows by accident.
 */
const assistanceDraftInsertInflight = new Map<string, Promise<string>>();

export type InsertAssistanceDraftSerializedOptions = {
  /** When true, skip reusing an existing draft row (explicit "new application"). */
  forceNew?: boolean;
};

async function selectLatestDraftRequestId(
  userId: string,
  serviceId: string
): Promise<string | null> {
  const sid = serviceId.trim();
  const { data, error } = await supabase
    .from(ASSISTANCE_REQUESTS_TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("service_id", sid)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

/**
 * One in-flight draft resolution per (userId, serviceId). Reuses the latest
 * `status = draft` row when the client lost `requestId` (remount / race after
 * insert). Pass `forceNew` once when the user explicitly starts another request.
 */
export function insertAssistanceDraftSerialized(
  userId: string,
  serviceId: string,
  buildInsertPayload: () => Record<string, unknown>,
  options?: InsertAssistanceDraftSerializedOptions
): Promise<string> {
  const key = `${userId}::${serviceId.trim()}`;
  const existing = assistanceDraftInsertInflight.get(key);
  if (existing) return existing;

  const p: Promise<string> = (async () => {
    if (!options?.forceNew) {
      const reused = await selectLatestDraftRequestId(userId, serviceId);
      if (reused) return reused;
    }

    const insertPayload = buildInsertPayload();
    const { data, error } = await supabase
      .from(ASSISTANCE_REQUESTS_TABLE)
      .insert(insertPayload as never)
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  })();

  assistanceDraftInsertInflight.set(key, p);
  void p.finally(() => {
    assistanceDraftInsertInflight.delete(key);
  });

  return p;
}

/** PostgREST select: base row + catalog join (replaces `requests_v`). */
export const ASSISTANCE_REQUEST_LIST_SELECT = [
  "id",
  "user_id",
  "service_id",
  "status",
  "request_code",
  "submitted_at",
  "case_study_date",
  "additional_info",
  "financial_request_type",
  "payload",
  "created_at",
  "updated_at",
  "assistance_services!inner(id, request_code_token)",
].join(",");

/** Status tab listing — omits heavy `payload` JSON (detail screens fetch it separately). */
export const ASSISTANCE_REQUEST_LIST_SELECT_SLIM = [
  "id",
  "user_id",
  "service_id",
  "status",
  "request_code",
  "submitted_at",
  "case_study_date",
  "additional_info",
  "financial_request_type",
  "created_at",
  "updated_at",
  "assistance_services!inner(id, request_code_token)",
].join(",");

type AssistanceRequestJoinedRow = {
  id: string;
  user_id: string;
  service_id: string;
  status: string;
  request_code: string | null;
  submitted_at: string | null;
  case_study_date: string | null;
  additional_info: string | null;
  financial_request_type: string | null;
  payload?: RequestsViewRow["payload"];
  created_at: string;
  updated_at: string;
  assistance_services:
    | { id: string; request_code_token: string | null }
    | { id: string; request_code_token: string | null }[];
};

function unwrapService(
  row: AssistanceRequestJoinedRow["assistance_services"]
): { id: string; request_code_token: string | null } | null {
  if (!row) return null;
  return Array.isArray(row) ? row[0] ?? null : row;
}

function mapJoinedRowToRequestsView(row: AssistanceRequestJoinedRow): RequestsViewRow {
  const svc = unwrapService(row.assistance_services);
  const routeToken =
    (svc?.request_code_token || svc?.id || row.service_id).trim().toLowerCase();

  return {
    id: row.id,
    user_id: row.user_id,
    service_id: row.service_id,
    status: row.status,
    request_code: row.request_code,
    submitted_at: row.submitted_at,
    case_study_date: row.case_study_date,
    additional_info: row.additional_info,
    financial_request_type: row.financial_request_type ?? null,
    payload: row.payload ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    service_type: routeToken,
    request_table: ASSISTANCE_REQUESTS_TABLE,
  };
}

export type AssistanceRequestsListingParams = {
  userId?: string;
  /** `assistance_services.id` UUID values. */
  serviceIds?: string[];
  statuses?: string[];
  /** Omit for no limit (full history). */
  limit?: number;
  /** When false (default for status list), omits `payload` to reduce egress. */
  includePayload?: boolean;
};

/**
 * Lists assistance requests with catalog join (ensures service row exists).
 */
export async function fetchAssistanceRequestsListing(
  params: AssistanceRequestsListingParams = {}
): Promise<RequestsViewRow[]> {
  const includePayload = params.includePayload ?? false;
  const selectCols = includePayload
    ? ASSISTANCE_REQUEST_LIST_SELECT
    : ASSISTANCE_REQUEST_LIST_SELECT_SLIM;

  let q = supabase
    .from(ASSISTANCE_REQUESTS_TABLE)
    .select(selectCols)
    .order("updated_at", { ascending: false });

  if (params.userId) q = q.eq("user_id", params.userId);
  if (params.serviceIds?.length) {
    q = q.in("service_id", params.serviceIds);
  }
  if (params.statuses?.length) {
    q = q.in("status", params.statuses);
  }
  if (params.limit != null) {
    q = q.limit(params.limit);
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as AssistanceRequestJoinedRow[];
  return rows.map(mapJoinedRowToRequestsView);
}

const ASSISTANCE_ROW_KEYS = new Set([
  "user_id",
  "service_id",
  "status",
  "request_code",
  "submitted_at",
  "case_study_date",
  "additional_info",
  "financial_request_type",
  "payload",
  "payload_version",
]);

/** Build insert payload for a draft row; unknown extras nest under `payload`. */
export function buildAssistanceDraftInsert(
  serviceId: string,
  userId: string,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    user_id: userId,
    service_id: serviceId,
    status: "draft",
    payload: {},
  };
  const payload: Record<string, unknown> = {};
  if (!extras) return row;

  for (const [k, v] of Object.entries(extras)) {
    if (k === "user_id" || k === "service_id") continue;
    if (!ASSISTANCE_ROW_KEYS.has(k)) {
      payload[k] = v;
      continue;
    }
    if (k === "payload" && v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(payload, v as Record<string, unknown>);
      continue;
    }
    row[k] = v;
  }

  if (Object.keys(payload).length) {
    row.payload = payload;
  }
  return row;
}

export function partitionAssistanceRowPatch(patch: Record<string, unknown>): {
  rowPatch: Record<string, unknown>;
  payloadFragment: Record<string, unknown>;
} {
  const rowPatch: Record<string, unknown> = {};
  const payloadFragment: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (ASSISTANCE_ROW_KEYS.has(k)) rowPatch[k] = v;
    else payloadFragment[k] = v;
  }
  return { rowPatch, payloadFragment };
}

export type CreateDraftInput = {
  serviceId: ServiceId;
  userId: string;
  extras?: Record<string, unknown>;
};

export type CreateDraftResult = {
  id: string;
  /** Catalog discriminator for attachments — not the physical table name. */
  requestTable: RequestTableName;
};

/**
 * Insert a row in `status: 'draft'` and return the new id.
 */
export async function createDraft(
  input: CreateDraftInput
): Promise<CreateDraftResult> {
  const service = getService(input.serviceId);
  if (!service) {
    throw new Error(`createDraft: unknown serviceId ${input.serviceId}`);
  }

  const insertPayload = buildAssistanceDraftInsert(
    service.id,
    input.userId,
    input.extras
  );

  const { data, error } = await supabase
    .from(ASSISTANCE_REQUESTS_TABLE)
    .insert(insertPayload as never)
    .select("id")
    .single();

  if (error) throw error;
  return {
    id: (data as { id: string }).id,
    requestTable: service.requestTable,
  };
}

export async function submitRequest(params: {
  serviceId: ServiceId;
  requestId: string;
  extras?: Record<string, unknown>;
}): Promise<void> {
  // Persist extras first (best effort) so the RPC can be strict about attachments
  // while still allowing notes to save even if submission fails.
  if (params.extras && Object.keys(params.extras).length > 0) {
    const { error: extraErr } = await supabase
      .from(ASSISTANCE_REQUESTS_TABLE)
      .update(params.extras as never)
      .eq("id", params.requestId as never);
    if (extraErr) throw extraErr;
  }

  // Supabase generated `Database` types may lag behind migrations in dev;
  // keep runtime correct and typecheck stable.
  const { error } = await (supabase as any).rpc("submit_assistance_request", {
    p_request_id: params.requestId,
  });

  if (error) throw error;
}

export async function updateRequest(params: {
  serviceId: ServiceId;
  requestId: string;
  patch: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase
    .from(ASSISTANCE_REQUESTS_TABLE)
    .update(params.patch as never)
    .eq("id", params.requestId as never);

  if (error) throw error;
}

export type GetRequestResult<TRow = RequestRowSkeleton> = {
  row: TRow | null;
  requestTable: RequestTableName;
};

export async function getRequest<TRow = RequestRowSkeleton>(params: {
  serviceId: ServiceId;
  requestId: string;
}): Promise<GetRequestResult<TRow>> {
  const service = getService(params.serviceId);
  if (!service) {
    throw new Error(`getRequest: unknown serviceId ${params.serviceId}`);
  }

  const { data, error } = await supabase
    .from(ASSISTANCE_REQUESTS_TABLE)
    .select("*")
    .eq("id", params.requestId as never)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  return {
    row: (data as TRow | null) ?? null,
    requestTable: service.requestTable,
  };
}

export type ListRequestsViewParams = {
  userId?: string;
  /** Route tokens (`request_code_token`) — resolved to UUIDs when catalog is loaded. */
  serviceTypes?: string[];
  serviceIds?: string[];
  statuses?: string[];
  limit?: number;
};

export async function listRequestsView(
  params: ListRequestsViewParams = {}
): Promise<RequestsViewRow[]> {
  return fetchAssistanceRequestsListing({
    userId: params.userId,
    serviceIds: params.serviceIds,
    statuses: params.statuses,
    limit: params.limit ?? 100,
    includePayload: true,
  });
}

export async function adminRequestOp(params: {
  op: "insert" | "update" | "delete" | "transition_status";
  serviceType: string;
  /** Omit or null for insert when the server should allocate the id. */
  requestId: string | null;
  patch?: Record<string, unknown>;
}): Promise<unknown> {
  const { data, error } = await supabase.rpc("admin_request_op" as never, {
    op: params.op,
    service_type: params.serviceType,
    request_id: params.requestId,
    patch: (params.patch ?? {}) as never,
  } as never);
  if (error) throw error;
  return data;
}
