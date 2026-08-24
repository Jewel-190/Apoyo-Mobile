/**
 * Forgot-MPIN recovery: email OTP (Auth recovery), then set a new Auth password.
 *
 * Dashboard (once): Authentication → Email Templates → Reset password
 * must include the code `{{ .Token }}` so the user can type it in-app.
 * Do not log emails' tokens or MPINs.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { setNewAuthPin, type ChangeAuthPinResult } from "./AuthPin";
import { STORAGE_KEYS } from "./ClientStorageKeys";
import {
  normalizeRegistrationEmail,
  validateRegistrationEmailFormat,
} from "./EmailValidation";
import { supabase } from "./SupabaseClient";

export const RECOVERY_OTP_MIN_LEN = 6;
export const RECOVERY_OTP_MAX_LEN = 8;
export const RECOVERY_EMAIL_COOLDOWN_MS = 60_000;

export const RECOVERY_EMAIL_SENT_COPY =
  "If this email has an Apoyo account, we sent a code. Check your inbox and spam folder.";

export type PinRecoveryPending = {
  email: string;
  verifiedAt: number;
};

export type ForgotPinResult =
  | { ok: true }
  | { ok: false; message: string; reason: "validation" | "otp" | "rate" | "network" | "session" };

function authMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: string }).message ?? "");
  }
  return String(error ?? "");
}

export function normalizeRecoveryEmail(email: string): string {
  return normalizeRegistrationEmail(email);
}

export function recoveryEmailFormatError(email: string): string {
  return validateRegistrationEmailFormat(email);
}

export function normalizeRecoveryOtp(raw: string): string {
  return String(raw ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, RECOVERY_OTP_MAX_LEN);
}

export function isCompleteRecoveryOtp(otp: string): boolean {
  const value = normalizeRecoveryOtp(otp);
  return value.length >= RECOVERY_OTP_MIN_LEN && value.length <= RECOVERY_OTP_MAX_LEN;
}

export function isForgotPinPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "").toLowerCase().includes("forgot-pin");
}

export async function readPinRecoveryPending(): Promise<PinRecoveryPending | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.pinRecoveryPending);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PinRecoveryPending;
    if (!parsed?.email || typeof parsed.verifiedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function markPinRecoveryVerified(email: string): Promise<void> {
  const record: PinRecoveryPending = {
    email: normalizeRecoveryEmail(email),
    verifiedAt: Date.now(),
  };
  await AsyncStorage.setItem(STORAGE_KEYS.pinRecoveryPending, JSON.stringify(record));
}

export async function clearPinRecoveryPending(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.pinRecoveryPending);
}

/**
 * Sends a recovery email. Unknown addresses are treated as success so the
 * UI cannot be used to check whether an account exists.
 */
export async function requestPinRecoveryEmail(email: string): Promise<ForgotPinResult> {
  const normalized = normalizeRecoveryEmail(email);
  const formatError = recoveryEmailFormatError(normalized);
  if (formatError) {
    return { ok: false, reason: "validation", message: formatError };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalized);
  if (error) {
    const msg = authMessage(error).toLowerCase();
    if (msg.includes("rate") || msg.includes("too many") || msg.includes("seconds")) {
      return {
        ok: false,
        reason: "rate",
        message: "Too many attempts. Wait a moment and try again.",
      };
    }
    if (msg.includes("network") || msg.includes("fetch")) {
      return {
        ok: false,
        reason: "network",
        message: "Check your connection and try again.",
      };
    }
  }

  return { ok: true };
}

export async function verifyPinRecoveryOtp(input: {
  email: string;
  otp: string;
}): Promise<ForgotPinResult> {
  const email = normalizeRecoveryEmail(input.email);
  const token = normalizeRecoveryOtp(input.otp);
  const formatError = recoveryEmailFormatError(email);
  if (formatError) {
    return { ok: false, reason: "validation", message: formatError };
  }
  if (!isCompleteRecoveryOtp(token)) {
    return {
      ok: false,
      reason: "validation",
      message: "Enter the code from your email.",
    };
  }

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });
  if (error) {
    const retry = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (!retry.error) {
      await markPinRecoveryVerified(email);
      return { ok: true };
    }
    const msg = authMessage(error).toLowerCase();
    if (msg.includes("rate") || msg.includes("too many")) {
      return {
        ok: false,
        reason: "rate",
        message: "Too many attempts. Wait a moment and try again.",
      };
    }
    if (msg.includes("network") || msg.includes("fetch")) {
      return {
        ok: false,
        reason: "network",
        message: "Check your connection and try again.",
      };
    }
    if (msg.includes("expired")) {
      return {
        ok: false,
        reason: "otp",
        message: "That code expired. Request a new one.",
      };
    }
    return {
      ok: false,
      reason: "otp",
      message: "That code is incorrect or expired.",
    };
  }

  await markPinRecoveryVerified(email);
  return { ok: true };
}

export async function completePinRecovery(input: {
  newPin: string;
  confirmPin: string;
}): Promise<ChangeAuthPinResult> {
  const updated = await setNewAuthPin(input);
  if (!updated.ok) return updated;

  await clearPinRecoveryPending();
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    await supabase.auth.signOut();
  }
  return { ok: true };
}

export async function abandonPinRecovery(): Promise<void> {
  await clearPinRecoveryPending();
  await supabase.auth.signOut();
}
