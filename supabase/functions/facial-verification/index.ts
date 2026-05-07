import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CompareFacesCommand, RekognitionClient } from "npm:@aws-sdk/client-rekognition@3.699.0";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function parseSimilarityThreshold(): number {
  const raw = Deno.env.get("AWS_REKOGNITION_SIMILARITY_THRESHOLD");
  if (!raw) return 85;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 50 || n > 100) return 85;
  return n;
}

function stripDataUrl(b64: string): string {
  const t = b64.trim();
  const idx = t.indexOf("base64,");
  if (idx === -1) return t.replace(/\s/g, "");
  return t.slice(idx + 7).replace(/\s/g, "");
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = stripDataUrl(b64);
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

type RequestBody = {
  email?: string;
  registrationAttemptToken?: string;
  idImageBase64?: string;
  selfieImageBase64?: string;
};

async function validateRegistrationToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  tokenStr: string,
): Promise<boolean> {
  const { data: tokenOk, error: tokenErr } = await supabaseAdmin.rpc(
    "validate_registration_attempt_token",
    { p_token: tokenStr, p_email: email },
  );

  if (tokenErr) {
    console.error("validate_registration_attempt_token", tokenErr.message);
    return false;
  }
  return tokenOk === true;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return corsPreflight();
  }

  // Use HTTP 200 + { ok: boolean } for application outcomes so Supabase JS
  // clients parse the JSON body instead of only surfacing "non-2xx status code".

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 200);
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, error: "Server configuration error" },
      200,
    );
  }

  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
  const region = Deno.env.get("AWS_REGION") ?? "";

  if (!accessKeyId || !secretAccessKey || !region) {
    return jsonResponse(
      {
        ok: false,
        error:
          "AWS credentials are not configured for this function (set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION secrets).",
      },
      200,
    );
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 200);
  }

  const email = (body.email ?? "").toString().trim().toLowerCase();
  const tokenStr = (body.registrationAttemptToken ?? "").toString().trim();
  const idB64 = (body.idImageBase64 ?? "").toString();
  const selfieB64 = (body.selfieImageBase64 ?? "").toString();

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(tokenStr)) {
    return jsonResponse({ ok: false, error: "Invalid registration token" }, 200);
  }

  if (!email) {
    return jsonResponse({ ok: false, error: "Missing email" }, 200);
  }

  if (!selfieB64) {
    return jsonResponse({ ok: false, error: "Missing selfieImageBase64" }, 200);
  }

  if (!idB64) {
    return jsonResponse({ ok: false, error: "Missing idImageBase64" }, 200);
  }

  let idBytes: Uint8Array;
  let selfieBytes: Uint8Array;
  try {
    idBytes = base64ToBytes(idB64);
    selfieBytes = base64ToBytes(selfieB64);
  } catch {
    return jsonResponse({ ok: false, error: "Invalid image data" }, 200);
  }

  if (idBytes.byteLength < 100 || selfieBytes.byteLength < 100) {
    return jsonResponse({ ok: false, error: "Image too small" }, 200);
  }
  if (idBytes.byteLength > MAX_IMAGE_BYTES || selfieBytes.byteLength > MAX_IMAGE_BYTES) {
    return jsonResponse({ ok: false, error: "Image too large (max 15 MB)" }, 200);
  }

  const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const tokenOk = await validateRegistrationToken(
    supabaseAdmin,
    email,
    tokenStr,
  );
  if (!tokenOk) {
    return jsonResponse(
      { ok: false, error: "Invalid or expired registration session" },
      200,
    );
  }

  const similarityThreshold = parseSimilarityThreshold();
  const rekognition = new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    const out = await rekognition.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: selfieBytes },
        TargetImage: { Bytes: idBytes },
        SimilarityThreshold: similarityThreshold,
        QualityFilter: "AUTO",
      }),
    );

    const matches = out.FaceMatches ?? [];
    let similarity = 0;
    for (const m of matches) {
      const s = m.Similarity ?? 0;
      if (s > similarity) similarity = s;
    }
    const verified = matches.length > 0;

    return jsonResponse({
      ok: true,
      verified,
      similarity: Math.round(similarity * 100) / 100,
      threshold: similarityThreshold,
    });
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e
      ? String((e as { name?: string }).name)
      : "";
    const msg = e instanceof Error ? e.message : String(e);

    if (
      name === "InvalidParameterException" ||
      msg.includes("InvalidParameterException")
    ) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Could not detect a clear face in one or both photos. Retake in good lighting, face the camera, and ensure your ID photo is visible.",
          code: "NO_FACE",
        },
        200,
      );
    }

    console.error("Rekognition CompareFaces", msg);
    return jsonResponse(
      { ok: false, error: "Face comparison failed. Try again." },
      200,
    );
  }
});
