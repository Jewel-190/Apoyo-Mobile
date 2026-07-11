/**
 * Persists in-progress registration so backgrounding or process death does not
 * lose the multi-step flow. Cleared on success or explicit restart.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";

export const REGISTRATION_DRAFT_VERSION = 1 as const;

export type PersistedRegisteredVoterRow = {
  id: string;
  voter_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string;
  sex: string;
  barangay_id: string;
};

export type RegistrationDraftV1 = {
  version: typeof REGISTRATION_DRAFT_VERSION;
  updatedAt: number;
  step: number;
  firstName: string;
  suffix: string;
  middleName: string;
  noMiddle: boolean;
  lastName: string;
  selectedBarangayId: string | null;
  selectedBarangayName: string | null;
  email: string;
  voterIdNumber: string;
  birthDate: string;
  sex: "" | "M" | "F";
  houseUnit: string;
  streetLine: string;
  mobile: string;
  mpin: string;
  pin: string;
  confirmPin: string;
  registrationAttemptToken: string;
  verifiedRegisteredVoterId: string | null;
  registeredVoterRow: PersistedRegisteredVoterRow | null;
  idImageUri: string | null;
  /** Omitted when image is too large for AsyncStorage. */
  idImageBase64: string | null;
  hasIdImage: boolean;
  didAttemptInitialVerificationEmail: boolean;
  emailSentAt: number | null;
};

const DRAFT_KEY = STORAGE_KEYS.registrationDraftV1;

/** Skip persisting huge base64 blobs (AsyncStorage ~6MB limit on some devices). */
const MAX_ID_BASE64_CHARS = 400_000;

export async function readRegistrationDraft(): Promise<RegistrationDraftV1 | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistrationDraftV1;
    if (parsed?.version !== REGISTRATION_DRAFT_VERSION) return null;
    if (typeof parsed.step !== "number" || parsed.step < 0 || parsed.step > 8) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeRegistrationDraft(
  draft: RegistrationDraftV1
): Promise<void> {
  let idImageBase64 = draft.idImageBase64;
  if (idImageBase64 && idImageBase64.length > MAX_ID_BASE64_CHARS) {
    idImageBase64 = null;
  }

  await AsyncStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      ...draft,
      idImageBase64,
      updatedAt: Date.now(),
    })
  );
}

/** Removes draft + legacy registration scratch keys. */
export async function clearRegistrationDraft(): Promise<void> {
  await AsyncStorage.multiRemove([
    DRAFT_KEY,
    STORAGE_KEYS.regFullname,
    STORAGE_KEYS.regEmail,
    STORAGE_KEYS.regMobile,
  ]);
}

export function sanitizeRestoredStep(draft: RegistrationDraftV1): number {
  let step = draft.step;
  if (step >= 4 && !draft.hasIdImage && !draft.idImageBase64) {
    step = 3;
  }
  if (step >= 1 && !draft.verifiedRegisteredVoterId) {
    step = 0;
  }
  if (step >= 3 && !draft.registrationAttemptToken) {
    step = Math.min(step, 2);
  }
  return step;
}

export function resendCooldownRemainingMs(
  emailSentAt: number | null,
  cooldownMs = 60_000
): number {
  if (!emailSentAt) return 0;
  return Math.max(0, cooldownMs - (Date.now() - emailSentAt));
}
