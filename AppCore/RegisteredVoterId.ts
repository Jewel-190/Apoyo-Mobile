/** Philippine voter ID format stored in `registered_voters.voter_id` (4-5-13-1). */
export const REGISTERED_VOTER_ID_PATTERN =
  /^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$/;

export const REGISTERED_VOTER_ID_PLACEHOLDER = "0000-00000-0000000000000-0";
export const REGISTERED_VOTER_ID_MAX_LENGTH = 26;

export function normalizeRegisteredVoterId(value: string): string {
  return String(value ?? "")
    .replace(/[^0-9A-Za-z]/gi, "")
    .toUpperCase();
}

/** Formats raw input into 4-5-13-1 segments (uppercase alphanumeric). */
export function formatRegisteredVoterId(value: string): string {
  const raw = normalizeRegisteredVoterId(value).slice(0, 23);
  if (raw.length <= 4) return raw;
  if (raw.length <= 9) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  if (raw.length <= 22) return `${raw.slice(0, 4)}-${raw.slice(4, 9)}-${raw.slice(9)}`;
  return `${raw.slice(0, 4)}-${raw.slice(4, 9)}-${raw.slice(9, 22)}-${raw.slice(22)}`;
}

export function isValidRegisteredVoterId(value: string): boolean {
  const formatted = formatRegisteredVoterId(value);
  return REGISTERED_VOTER_ID_PATTERN.test(formatted);
}
