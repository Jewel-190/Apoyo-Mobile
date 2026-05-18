/**
 * Canonical Postgres table name for unified assistance requests.
 */

export const REQUEST_TABLES = ["assistance_requests"] as const;

export type RequestTableName = (typeof REQUEST_TABLES)[number];

export function isRequestTableName(
  value: string | null | undefined
): value is RequestTableName {
  if (!value) return false;
  return (REQUEST_TABLES as readonly string[]).includes(value);
}
