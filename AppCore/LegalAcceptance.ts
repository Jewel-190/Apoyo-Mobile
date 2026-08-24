/**
 * Local consent for CMS legal pages before registration.
 *
 * Bound to a content fingerprint so a Superadmin CMS edit requires
 * the user to accept the updated documents again.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";
import {
  LEGAL_PAGES,
  fetchLegalSettings,
  legalContentFingerprint,
  type LegalPageSlug,
} from "./LegalSettings";

export type LegalAcceptanceRecord = {
  v: 1;
  fingerprint: string;
  pages: Partial<Record<LegalPageSlug, string>>;
  updatedAt: string;
};

function emptyRecord(fingerprint = ""): LegalAcceptanceRecord {
  return {
    v: 1,
    fingerprint,
    pages: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function readLegalAcceptance(): Promise<LegalAcceptanceRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.legalAcceptanceV1);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegalAcceptanceRecord;
    if (parsed?.v !== 1 || typeof parsed.fingerprint !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLegalAcceptance(record: LegalAcceptanceRecord): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.legalAcceptanceV1,
    JSON.stringify(record)
  );
}

export function isLegalFullyAccepted(
  record: LegalAcceptanceRecord | null,
  fingerprint: string
): boolean {
  if (!record || !fingerprint || record.fingerprint !== fingerprint) return false;
  return LEGAL_PAGES.every((page) => Boolean(record.pages[page.slug]));
}

export async function recordLegalPageAcceptance(
  slug: LegalPageSlug,
  fingerprint: string
): Promise<LegalAcceptanceRecord> {
  const current = await readLegalAcceptance();
  const base =
    current && current.fingerprint === fingerprint
      ? current
      : emptyRecord(fingerprint);

  const next: LegalAcceptanceRecord = {
    v: 1,
    fingerprint,
    pages: { ...base.pages, [slug]: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  await writeLegalAcceptance(next);
  return next;
}

export async function hasAcceptedCurrentLegalDocuments(): Promise<boolean> {
  const [record, settings] = await Promise.all([
    readLegalAcceptance(),
    fetchLegalSettings(),
  ]);
  return isLegalFullyAccepted(record, legalContentFingerprint(settings));
}

/** True when register should bounce the user back to the legal accept flow. */
export async function shouldGateRegistration(): Promise<boolean> {
  const record = await readLegalAcceptance();
  const complete =
    !!record && LEGAL_PAGES.every((page) => Boolean(record.pages[page.slug]));
  if (!complete || !record) return true;

  try {
    const settings = await fetchLegalSettings();
    return legalContentFingerprint(settings) !== record.fingerprint;
  } catch {
    return false;
  }
}
