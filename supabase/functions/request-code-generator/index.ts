// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SERVICE_ALIASES: Record<string, string> = {
  hospitalizationreq: "hospitalizationreq",
  hospitalization: "hospitalizationreq",
  hosp: "hospitalizationreq",
  hospitalization_requests: "hospitalizationreq",

  treatmentreq: "treatmentreq",
  treatment: "treatmentreq",
  treat: "treatmentreq",
  treatment_requests: "treatmentreq",

  medicalreq: "medicalreq",
  medical: "medicalreq",
  med: "medicalreq",
  medical_requests: "medicalreq",

  financialreq: "financialreq",
  financial: "financialreq",
  fin: "financialreq",
  financial_requests: "financialreq",

  monetaryreq: "monetaryreq",
  monetary: "monetaryreq",
  mon: "monetaryreq",
  monetary_requests: "monetaryreq",

  burialreq: "burialreq",
  burial: "burialreq",
  bur: "burialreq",
  burial_requests: "burialreq",

  cremationreq: "cremationreq",
  cremation: "cremationreq",
  crem: "cremationreq",
  cremation_requests: "cremationreq",

  columbariumreq: "columbariumreq",
  columbarium: "columbariumreq",
  colombarium: "columbariumreq",
  colu: "columbariumreq",
  columbarium_requests: "columbariumreq",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-code-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function normalizeService(input: string): string {
  const key = (input || "").trim().toLowerCase();
  return SERVICE_ALIASES[key] || "";
}

function parseTimestamp(value: unknown): Date {
  if (!value) return new Date();
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const expectedSecret = Deno.env.get("REQUEST_CODE_HOOK_SECRET") ?? "";
  if (expectedSecret) {
    const provided = request.headers.get("x-request-code-secret") ?? "";
    if (provided !== expectedSecret) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
  }

  let payload: { serviceType?: string; timestamp?: string };
  try {
    payload = (await request.json()) as { serviceType?: string; timestamp?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const normalized = normalizeService(payload.serviceType || "");
  if (!normalized) {
    return json(
      {
        ok: false,
        error: "Unsupported service type",
        supported: [
          "hospitalizationReq",
          "treatmentReq",
          "medicalReq",
          "financialReq",
          "monetaryReq",
          "burialReq",
          "cremationReq",
          "columbariumReq",
        ],
      },
      400,
    );
  }

  const ts = parseTimestamp(payload.timestamp);
  const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabaseAdmin.rpc("generate_request_code_for_service", {
    p_service: normalized,
    p_timestamp: ts.toISOString(),
  });

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  return json({
    ok: true,
    serviceType: normalized,
    timestamp: ts.toISOString(),
    request_code: data,
  });
});
