import { supabase } from "./SupabaseClient";

export const AUTH_PIN_LENGTH = 6;

export type ChangeAuthPinReason =
  | "validation"
  | "current_pin"
  | "update"
  | "session"
  | "network";

export type ChangeAuthPinResult =
  | { ok: true }
  | { ok: false; message: string; reason: ChangeAuthPinReason };

export function normalizeAuthPin(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, AUTH_PIN_LENGTH);
}

export function isCompleteAuthPin(pin: string): boolean {
  return new RegExp(`^\\d{${AUTH_PIN_LENGTH}}$`).test(pin);
}

export function validateNewAuthPinPair(newPin: string, confirmPin: string): string | null {
  const nextPin = normalizeAuthPin(newPin);
  const confirm = normalizeAuthPin(confirmPin);
  if (!isCompleteAuthPin(nextPin)) {
    return "Enter a new 6-digit MPIN.";
  }
  if (!isCompleteAuthPin(confirm) || confirm !== nextPin) {
    return "MPINs do not match.";
  }
  return null;
}

export function validateChangeAuthPinInput(input: {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}): string | null {
  const currentPin = normalizeAuthPin(input.currentPin);
  const newPin = normalizeAuthPin(input.newPin);
  const confirmPin = normalizeAuthPin(input.confirmPin);

  if (!isCompleteAuthPin(currentPin)) {
    return "Enter your current 6-digit MPIN.";
  }
  const pairError = validateNewAuthPinPair(newPin, confirmPin);
  if (pairError) return pairError;
  if (newPin === currentPin) {
    return "Choose a different MPIN from your current one.";
  }
  return null;
}

function authMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: string }).message ?? "");
  }
  return String(error ?? "");
}

function mapCurrentPinError(error: unknown): ChangeAuthPinResult {
  const msg = authMessage(error).toLowerCase();
  if (msg.includes("rate") || msg.includes("too many")) {
    return {
      ok: false,
      reason: "current_pin",
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
  return {
    ok: false,
    reason: "current_pin",
    message: "Current MPIN is incorrect.",
  };
}

function mapUpdateError(error: unknown): ChangeAuthPinResult {
  const msg = authMessage(error).toLowerCase();
  if (msg.includes("different from the old") || msg.includes("same as")) {
    return {
      ok: false,
      reason: "validation",
      message: "Choose a different MPIN from your current one.",
    };
  }
  if (
    msg.includes("weak") ||
    msg.includes("pwned") ||
    msg.includes("leaked") ||
    msg.includes("not strong")
  ) {
    return {
      ok: false,
      reason: "update",
      message: "That MPIN is too easy to guess. Choose a different 6-digit MPIN.",
    };
  }
  if (msg.includes("at least") || msg.includes("characters")) {
    return {
      ok: false,
      reason: "update",
      message: "Your MPIN couldn't be accepted. Use a 6-digit MPIN.",
    };
  }
  if (msg.includes("session") || msg.includes("not authenticated") || msg.includes("jwt")) {
    return {
      ok: false,
      reason: "session",
      message: "Your session expired. Log in again, then change your MPIN.",
    };
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return {
      ok: false,
      reason: "network",
      message: "Check your connection and try again.",
    };
  }
  return {
    ok: false,
    reason: "update",
    message: "Couldn't update your MPIN. Try again.",
  };
}

/**
 * Reauthenticates with the current MPIN (Auth password), then updates it.
 * Does not write to `public.users`. Never log PIN values.
 */
export async function changeAuthPin(input: {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}): Promise<ChangeAuthPinResult> {
  const currentPin = normalizeAuthPin(input.currentPin);
  const newPin = normalizeAuthPin(input.newPin);
  const confirmPin = normalizeAuthPin(input.confirmPin);

  const validation = validateChangeAuthPinInput({
    currentPin,
    newPin,
    confirmPin,
  });
  if (validation) {
    return { ok: false, reason: "validation", message: validation };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const email = (user?.email ?? "").trim().toLowerCase();
  if (userError || !user || !email) {
    return {
      ok: false,
      reason: "session",
      message: "Your session expired. Log in again, then change your MPIN.",
    };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPin,
  });
  if (reauthError) {
    return mapCurrentPinError(reauthError);
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPin,
  });
  if (updateError) {
    return mapUpdateError(updateError);
  }

  return { ok: true };
}

/**
 * Sets a new MPIN on an already-authenticated recovery (or signed-in) session.
 * Does not require the current PIN. Does not write to `public.users`.
 */
export async function setNewAuthPin(input: {
  newPin: string;
  confirmPin: string;
}): Promise<ChangeAuthPinResult> {
  const newPin = normalizeAuthPin(input.newPin);
  const confirmPin = normalizeAuthPin(input.confirmPin);
  const validation = validateNewAuthPinPair(newPin, confirmPin);
  if (validation) {
    return { ok: false, reason: "validation", message: validation };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      ok: false,
      reason: "session",
      message: "This reset expired. Request a new code and try again.",
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPin,
  });
  if (updateError) {
    return mapUpdateError(updateError);
  }

  return { ok: true };
}
