/**
 * Applicant-editable contact fields on Manage Account.
 *
 * Identity (name, sex, birth date, VIN, barangay) stays locked to registration
 * and voter records. Phone and the typed address lines update `public.users`,
 * which is also what superadmin User Management and request autofill read.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";

export const PROFILE_CITY_LINE = "Dasmariñas, Cavite";

const HOUSE_MAX = 80;
const STREET_MAX = 160;

export type ParsedResidence = {
  houseUnit: string;
  streetLine: string;
  barangay: string;
};

export type ApplicantContactPatch = {
  contact_number: string;
  address: string;
};

export type ApplicantContactInput = {
  mobileDigits: string;
  houseUnit: string;
  streetLine: string;
  barangay: string;
  current?: {
    contact_number?: string | null;
    address?: string | null;
  };
};

export type ApplicantContactPatchResult =
  | { ok: true; patch: ApplicantContactPatch; unchanged: boolean }
  | { ok: false; error: string };

export function normalizeSpaces(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Last 10 local PH mobile digits, or whatever leading 9-block we can recover. */
export function localMobileDigits(raw: string | null | undefined): string {
  const digits = onlyDigits(raw);
  if (digits.length >= 12 && digits.startsWith("63")) {
    const rest = digits.slice(2);
    if (rest.length >= 10 && rest.startsWith("9")) return rest.slice(0, 10);
  }
  if (digits.length >= 11 && digits.startsWith("0")) {
    const rest = digits.slice(1);
    if (rest.length >= 10 && rest.startsWith("9")) return rest.slice(0, 10);
  }
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    if (last10.startsWith("9")) return last10;
  }
  return digits.slice(0, 10);
}

export function formatPhMobileGroups(digits: string): string {
  const d = onlyDigits(digits).slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `${a} ${b}`;
  return `${a} ${b} ${c}`;
}

/** Same stored shape as registration: `+63 998 301 1200`. */
export function normalizePhMobile(raw: string | null | undefined): string {
  const local = localMobileDigits(raw);
  if (local.length !== 10 || !local.startsWith("9")) return "";
  return `+63 ${formatPhMobileGroups(local)}`;
}

export function phoneValidationMessage(
  raw: string | null | undefined
): string | null {
  const local = localMobileDigits(raw);
  if (!local) return "Enter your 10-digit mobile number.";
  if (local.length !== 10) return "Enter 10 digits (e.g. 9XXXXXXXXX).";
  if (!local.startsWith("9")) return "Must start with 9.";
  return null;
}

export function residenceValidationMessage(
  houseUnit: string,
  streetLine: string
): string | null {
  const house = normalizeSpaces(houseUnit);
  const street = normalizeSpaces(streetLine);
  if (!house) return "Enter your house no. / block / lot / unit.";
  if (!street) return "Enter your street / subdivision / sitio / purok.";
  if (house.length > HOUSE_MAX) return "House / unit is too long.";
  if (street.length > STREET_MAX) return "Street is too long.";
  return null;
}

function splitAddressParts(address: string | null | undefined): string[] {
  return (address ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function cityIndex(parts: string[]): number {
  return parts.findIndex((part) => /^dasmari[ñn]as$/i.test(part));
}

/**
 * Signup stores `{house}, {street}, {barangay}, Dasmariñas, Cavite`.
 * Barangay snapshot is the split anchor so streets may contain commas.
 */
export function parseResidenceAddress(
  address: string | null | undefined,
  barangaySnapshot: string | null | undefined
): ParsedResidence {
  const barangay = normalizeSpaces(barangaySnapshot);
  const parts = splitAddressParts(address);
  const cityIdx = cityIndex(parts);
  const beforeCity = cityIdx >= 0 ? parts.slice(0, cityIdx) : parts;

  let barangayIdx = -1;
  if (barangay) {
    barangayIdx = beforeCity.findIndex(
      (part) => part.toLowerCase() === barangay.toLowerCase()
    );
  }
  if (barangayIdx < 0 && beforeCity.length >= 3) {
    barangayIdx = beforeCity.length - 1;
  }

  const identityParts =
    barangayIdx >= 0 ? beforeCity.slice(0, barangayIdx) : beforeCity;
  const inferredBarangay =
    barangay || (barangayIdx >= 0 ? beforeCity[barangayIdx] ?? "" : "");

  if (identityParts.length === 0) {
    return { houseUnit: "", streetLine: "", barangay: inferredBarangay };
  }
  if (identityParts.length === 1) {
    return {
      houseUnit: identityParts[0] ?? "",
      streetLine: "",
      barangay: inferredBarangay,
    };
  }
  return {
    houseUnit: identityParts[0] ?? "",
    streetLine: identityParts.slice(1).join(", "),
    barangay: inferredBarangay,
  };
}

export function composeResidenceAddress(input: {
  houseUnit: string;
  streetLine: string;
  barangay: string;
}): string {
  const house = normalizeSpaces(input.houseUnit);
  const street = normalizeSpaces(input.streetLine);
  const barangay = normalizeSpaces(input.barangay);
  if (!house || !street || !barangay) return "";
  return `${house}, ${street}, ${barangay}, ${PROFILE_CITY_LINE}`;
}

export function buildApplicantContactPatch(
  input: ApplicantContactInput
): ApplicantContactPatchResult {
  const phoneError = phoneValidationMessage(input.mobileDigits);
  if (phoneError) return { ok: false, error: phoneError };

  const residenceError = residenceValidationMessage(
    input.houseUnit,
    input.streetLine
  );
  if (residenceError) return { ok: false, error: residenceError };

  const barangay = normalizeSpaces(input.barangay);
  if (!barangay) {
    return {
      ok: false,
      error: "Your barangay is missing from this account. Contact the office.",
    };
  }

  const contact_number = normalizePhMobile(input.mobileDigits);
  const address = composeResidenceAddress({
    houseUnit: input.houseUnit,
    streetLine: input.streetLine,
    barangay,
  });
  if (!contact_number || !address) {
    return { ok: false, error: "Enter a valid phone number and address." };
  }

  const currentNumber = normalizePhMobile(input.current?.contact_number ?? "");
  const currentAddress = normalizeSpaces(input.current?.address);
  const unchanged =
    Boolean(input.current) &&
    currentNumber === contact_number &&
    currentAddress === address;

  return { ok: true, patch: { contact_number, address }, unchanged };
}

export function mapApplicantContactSaveError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message ?? "")
      : String(error ?? "");
  if (/permission|42501|row-level|column/i.test(message)) {
    return "You can only update your phone number and address.";
  }
  return "Unable to save your changes. Check your connection and try again.";
}

export async function mergeCachedUserProfile(
  patch: Record<string, unknown>
): Promise<void> {
  let previous: Record<string, unknown> = {};
  try {
    const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.userCache);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        previous = parsed as Record<string, unknown>;
      }
    }
  } catch {
    previous = {};
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.userCache,
    JSON.stringify({ ...previous, ...patch })
  );
}
