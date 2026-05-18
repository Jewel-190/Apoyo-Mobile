/**
 * Derived mobile presentation helpers from catalog tokens (`request_code_token`).
 * Prefixes and dedupe keys are not hardcoded per service — CMS / DB owns tokens.
 */

export function applicationCodePrefixForToken(token: string): string {
  const t = token.trim().toUpperCase();
  return t || "APP";
}

export function successDedupeSuffixForToken(token: string): string {
  const k = token.trim().toLowerCase();
  if (!k) return "assistance_success_v1";
  return `${k.replace(/[^a-z0-9]+/gi, "_")}_success_v1`;
}

/** Reserved for per-service success headings when CMS adds a column later. */
export function successHeadingForToken(_token: string): string | null {
  return null;
}

/** @deprecated Use `applicationCodePrefixForToken`. */
export function applicationCodePrefixForService(serviceKey: string): string {
  return applicationCodePrefixForToken(serviceKey);
}

/** @deprecated Use `successDedupeSuffixForToken`. */
export function successDedupeSuffixForService(serviceKey: string): string {
  return successDedupeSuffixForToken(serviceKey);
}

/** @deprecated Use `successHeadingForToken`. */
export function successHeadingForService(serviceKey: string): string | null {
  return successHeadingForToken(serviceKey);
}
