/** Practical email format check for registration (not full RFC 5322). */
const EMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "invalid.com",
  "localhost",
]);

export function normalizeRegistrationEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

export function validateRegistrationEmailFormat(email: string): string {
  const normalized = normalizeRegistrationEmail(email);
  if (!normalized) return "Email address is required.";
  if (normalized.length > 254) return "Email address is too long.";
  if (/\.\./.test(normalized)) return "Enter a valid email address.";
  if (!EMAIL_FORMAT.test(normalized)) return "Enter a valid email address.";

  const domain = normalized.split("@")[1] ?? "";
  if (!domain.includes(".")) return "Enter a valid email address.";
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return "Enter a real email address you can access.";

  return "";
}
