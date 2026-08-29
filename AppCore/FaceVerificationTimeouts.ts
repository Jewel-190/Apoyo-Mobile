/**
 * Face-verify timeouts must stay stacked: CompreFace read < verifier < edge < client.
 * The first CompreFace /find_faces call loads FaceNet; 60s API reads timed out every
 * first attempt. Keep the client the last to give up.
 */
export const FACE_VERIFY_EDGE_TIMEOUT_MS = 180_000;
export const FACE_VERIFY_CLIENT_TIMEOUT_MS = FACE_VERIFY_EDGE_TIMEOUT_MS + 20_000;

export function comprefaceWarmupSucceeded(
  code: string | null | undefined
): boolean {
  if (!code) return true;
  return code === "NO_FACE";
}
