import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type DbWebhookDeletePayload = {
  type: "DELETE";
  table: string;
  schema: string;
  record: null;
  old_record: Record<string, unknown>;
};

type LegacyCleanupPayload = {
  bucket?: string;
  paths?: string[];
  table?: string;
  op?: string;
  row_id?: string;
};

type StorageObjectRow = {
  id: string;
  bucket_id: string;
  path_tokens?: string[] | null;
  name?: string | null;
};

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function extractStorageObjectKey(oldRecord: Record<string, unknown>): {
  objectId?: string;
  bucketId?: string;
  objectPath?: string;
} {
  const objectId =
    (oldRecord.storage_object_id as string | undefined) ??
    (oldRecord.object_id as string | undefined) ??
    (oldRecord.storageObjectId as string | undefined);

  const bucketId =
    (oldRecord.bucket_id as string | undefined) ??
    (oldRecord.storage_bucket as string | undefined) ??
    (oldRecord.bucketId as string | undefined);

  const objectPath =
    (oldRecord.storage_path as string | undefined) ??
    (oldRecord.object_path as string | undefined) ??
    (oldRecord.path as string | undefined) ??
    (oldRecord.name as string | undefined);

  return { objectId, bucketId, objectPath };
}

function objectPathFromRow(so: StorageObjectRow): string {
  if (so.path_tokens && so.path_tokens.length > 0) {
    return so.path_tokens.join("/");
  }
  if (so.name) {
    return so.name;
  }
  throw new Error("Unable to determine storage object path from storage.objects row");
}

function toCleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isDeleteEvent(payload: Record<string, unknown>): boolean {
  const type = String(payload.type ?? "").toUpperCase();
  const op = String(payload.op ?? payload.event ?? "").toUpperCase();
  return type === "DELETE" || op === "DELETE";
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return new Response("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", { status: 500 });
  }

  const expectedSecret = Deno.env.get("STORAGE_CLEANUP_HOOK_SECRET") ?? "";
  if (expectedSecret) {
    const providedSecret = request.headers.get("x-cleanup-secret") ?? "";
    if (providedSecret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  try {
    const legacyPayload = payload as LegacyCleanupPayload;
    const legacyBucket = toCleanString(legacyPayload.bucket);
    const legacyPaths = Array.isArray(legacyPayload.paths)
      ? legacyPayload.paths.map((p) => String(p).trim()).filter(Boolean)
      : [];

    if (legacyBucket && legacyPaths.length > 0) {
      const uniquePaths = [...new Set(legacyPaths)];
      const { error: rmErr } = await supabaseAdmin.storage.from(legacyBucket).remove(uniquePaths);

      if (rmErr) {
        return new Response(JSON.stringify({ ok: false, error: rmErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          mode: "legacy-bucket-paths",
          bucket: legacyBucket,
          removed: uniquePaths.length,
          paths: uniquePaths,
          meta: {
            table: legacyPayload.table ?? null,
            op: legacyPayload.op ?? null,
            row_id: legacyPayload.row_id ?? null,
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isDeleteEvent(payload)) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "Expected DELETE event or legacy bucket/paths payload",
          got_type: payload.type ?? null,
          got_op: payload.op ?? payload.event ?? null,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const oldRecord = payload.old_record as Record<string, unknown> | undefined;
    if (!oldRecord || typeof oldRecord !== "object") {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "Missing old_record",
          keys: Object.keys(payload),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const key = extractStorageObjectKey(oldRecord);

    if (key.objectId) {
      const { data: so, error: soErr } = await supabaseAdmin
        .schema("storage")
        .from("objects")
        .select("id,bucket_id,path_tokens,name")
        .eq("id", key.objectId)
        .maybeSingle();

      if (soErr || !so) {
        return new Response(
          JSON.stringify({
            ok: true,
            deleted: false,
            reason: "storage.objects row not found",
            objectId: key.objectId,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      const objectPath = objectPathFromRow(so as StorageObjectRow);
      const { error: rmErr } = await supabaseAdmin.storage.from(so.bucket_id).remove([objectPath]);

      if (rmErr) {
        return new Response(JSON.stringify({ ok: false, error: rmErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          bucket: so.bucket_id,
          path: objectPath,
          objectId: so.id,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (key.bucketId && key.objectPath) {
      const { error: rmErr } = await supabaseAdmin.storage.from(key.bucketId).remove([key.objectPath]);

      if (rmErr) {
        return new Response(JSON.stringify({ ok: false, error: rmErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          mode: "delete-webhook-bucket-path",
          bucket: key.bucketId,
          path: key.objectPath,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: false,
        reason:
          "No storage object reference found in old_record. Expected storage_object_id or bucket_id+storage_path",
        old_record_keys: Object.keys(oldRecord),
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
