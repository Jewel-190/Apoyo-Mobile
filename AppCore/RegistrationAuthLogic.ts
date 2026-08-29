/**
 * Pure registration-auth helpers (no Supabase client).
 * Email confirmation must happen before the app treats a signup as a session.
 */

import { normalizeRegistrationEmail } from "./EmailValidation";

export const SIGNUP_OTP_MIN_LEN = 6;
export const SIGNUP_OTP_MAX_LEN = 8;

export type AuthLikeError = {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
};

export type AuthCallbackParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
};

export function extractAuthErrorFields(raw: unknown): AuthLikeError {
  if (!raw || typeof raw !== "object") {
    return { message: String(raw ?? "") };
  }
  const err = raw as Record<string, unknown>;
  return {
    message: typeof err.message === "string" ? err.message : undefined,
    status: typeof err.status === "number" ? err.status : undefined,
    code: typeof err.code === "string" ? err.code : undefined,
    name: typeof err.name === "string" ? err.name : undefined,
  };
}

export function normalizeSignupOtp(raw: string): string {
  return String(raw ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, SIGNUP_OTP_MAX_LEN);
}

export function isCompleteSignupOtp(otp: string): boolean {
  const value = normalizeSignupOtp(otp);
  return value.length >= SIGNUP_OTP_MIN_LEN && value.length <= SIGNUP_OTP_MAX_LEN;
}

export function isAuthEmailConfirmed(
  user:
    | {
        email?: string | null;
        email_confirmed_at?: string | null;
      }
    | null
    | undefined,
  expectedEmail: string
): boolean {
  if (!user?.email_confirmed_at) return false;
  const expected = normalizeRegistrationEmail(expectedEmail);
  if (!expected) return false;
  return normalizeRegistrationEmail(user.email ?? "") === expected;
}

export function isEmailNotConfirmedError(error: unknown): boolean {
  const err = extractAuthErrorFields(error);
  const msg = (err.message ?? "").toLowerCase();
  const code = (err.code ?? "").toLowerCase();
  return (
    code === "email_not_confirmed" ||
    msg.includes("email not confirmed") ||
    msg.includes("email_not_confirmed")
  );
}

export function isExistingAuthUserSignup(user: {
  identities?: { id?: string }[] | null;
} | null): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

/**
 * signUp must never leave the applicant logged in. Confirmation happens
 * via email OTP or the confirmation deep link — not the signup response.
 */
export function shouldDiscardSessionAfterSignup(): boolean {
  return true;
}

export function parseAuthCallbackParams(url: string): AuthCallbackParams {
  const raw = String(url ?? "").trim();
  const empty: AuthCallbackParams = {
    code: null,
    accessToken: null,
    refreshToken: null,
    type: null,
  };
  if (!raw) return empty;

  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");
  let encoded = "";
  if (hashIndex >= 0) {
    encoded = raw.slice(hashIndex + 1);
    const nextQuery = encoded.indexOf("?");
    if (nextQuery >= 0) encoded = encoded.slice(nextQuery + 1);
  } else if (queryIndex >= 0) {
    encoded = raw.slice(queryIndex + 1);
  }

  const params = new URLSearchParams(encoded.split("&").join("&"));
  const read = (key: string) => {
    const value = params.get(key);
    return value && value.length > 0 ? value : null;
  };

  return {
    code: read("code"),
    accessToken: read("access_token"),
    refreshToken: read("refresh_token"),
    type: read("type"),
  };
}

export function mapVerificationEmailSendError(raw: unknown): string {
  const err = extractAuthErrorFields(raw);
  const msg = (err.message ?? "").toLowerCase();
  const code = (err.code ?? "").toLowerCase();

  if (
    err.status === 429 ||
    code === "over_email_send_rate_limit" ||
    code.includes("rate") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("email rate limit")
  ) {
    return "Too many verification emails were sent. Please wait a few minutes, then tap Resend.";
  }

  if (
    code === "email_address_invalid" ||
    code === "invalid_email" ||
    msg.includes("invalid email") ||
    msg.includes("unable to validate email")
  ) {
    return "That email address doesn't look valid. Check the spelling and try again.";
  }

  if (
    code === "user_already_registered" ||
    code === "email_exists" ||
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("user already registered")
  ) {
    return "This email is already registered. Try logging in instead.";
  }

  if (code === "weak_password" || msg.includes("password should be at least")) {
    return "Your MPIN couldn't be accepted for signup. Go back and set your MPIN again.";
  }

  if (code === "signup_disabled" || msg.includes("signups not allowed")) {
    return "New sign-ups are temporarily disabled. Please try again later.";
  }

  if (err.status === 500 || err.status === 502 || err.status === 503) {
    return "Our email service is temporarily unavailable. Please try again in a few minutes.";
  }

  if (err.status === 403) {
    return "Verification email couldn't be sent due to a permission issue. Contact support if this continues.";
  }

  if (err.status === 422) {
    return err.message
      ? `Couldn't send verification email: ${err.message}`
      : "The email request was rejected. Check your email address and try again.";
  }

  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }

  if (msg.includes("smtp") || msg.includes("mail")) {
    return err.message
      ? `Email delivery failed: ${err.message}`
      : "Email delivery failed. Please try again shortly.";
  }

  if (err.message) {
    return `Couldn't send verification email: ${err.message}`;
  }

  return "Couldn't send the verification email. Check your connection and try again.";
}

export function mapSignupOtpError(raw: unknown): string {
  const err = extractAuthErrorFields(raw);
  const msg = (err.message ?? "").toLowerCase();
  const code = (err.code ?? "").toLowerCase();

  if (err.status === 429 || code.includes("rate") || msg.includes("rate") || msg.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Check your connection and try again.";
  }
  if (msg.includes("expired") || code.includes("otp_expired")) {
    return "That code expired. Request a new one.";
  }
  return "That code is incorrect or expired.";
}

export function mapLoginAuthError(error: unknown): string {
  if (isEmailNotConfirmedError(error)) {
    return "Please verify your email before logging in. Enter the code we sent during registration.";
  }
  const err = extractAuthErrorFields(error);
  const msg = (err.message ?? "").toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return "Invalid email or PIN. Please try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Check your connection and try again.";
  }
  return err.message || "Login failed. Please try again.";
}
