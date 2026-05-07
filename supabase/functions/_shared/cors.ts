/**
 * Shared CORS headers used by edge functions invoked from the mobile
 * client. Keeping these in one place avoids drift if we add new
 * authentication headers (e.g. additional secret headers).
 */

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-code-secret, x-cleanup-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

/**
 * Build a JSON `Response` with CORS + Content-Type set.
 * Use the same helper from every edge function so error responses look
 * the same to the client.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/** Standard CORS preflight reply. */
export function corsPreflight(): Response {
  return new Response("ok", { headers: CORS_HEADERS });
}
