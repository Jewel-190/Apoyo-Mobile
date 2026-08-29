/**
 * Registration Auth: create an unconfirmed user, send the confirmation
 * email, then only establish a session after OTP or the email deep link.
 *
 * Dashboard (once): Authentication → Providers → Email → Confirm email ON.
 * Email Templates → Confirm signup must include `{{ .Token }}`.
 * Do not log emails, tokens, or MPINs.
 */

import { signOutLocalSession } from "./AppLogout";
import { normalizeRegistrationEmail } from "./EmailValidation";
import {
  isAuthEmailConfirmed,
  isCompleteSignupOtp,
  isExistingAuthUserSignup,
  mapSignupOtpError,
  mapVerificationEmailSendError,
  normalizeSignupOtp,
  parseAuthCallbackParams,
  shouldDiscardSessionAfterSignup,
} from "./RegistrationAuthLogic";
import { supabase } from "./SupabaseClient";

export {
  isAuthEmailConfirmed,
  isCompleteSignupOtp,
  isEmailNotConfirmedError,
  mapLoginAuthError,
  mapSignupOtpError,
  mapVerificationEmailSendError,
  normalizeSignupOtp,
  parseAuthCallbackParams,
  SIGNUP_OTP_MAX_LEN,
  SIGNUP_OTP_MIN_LEN,
} from "./RegistrationAuthLogic";

export type RegistrationAuthResult =
  | { ok: true }
  | { ok: false; message: string };

async function discardLocalAuthSession(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    await supabase.auth.signOut();
  }
}

export async function discardSessionAfterSignup(): Promise<void> {
  if (!shouldDiscardSessionAfterSignup()) return;
  await discardLocalAuthSession();
}

async function reclaimUnconfirmedAuthUser(
  email: string,
  attemptToken: string
): Promise<void> {
  const token = attemptToken.trim();
  if (!token) return;
  await supabase.rpc("reclaim_unconfirmed_registration_email", {
    p_email: email,
    p_attempt_token: token,
  });
}

async function resendSignupEmail(
  email: string,
  emailRedirectTo?: string
): Promise<RegistrationAuthResult> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  await discardSessionAfterSignup();
  if (error) {
    return { ok: false, message: mapVerificationEmailSendError(error) };
  }
  return { ok: true };
}

export async function sendRegistrationVerificationEmail(input: {
  email: string;
  pin: string;
  attemptToken?: string;
  emailRedirectTo?: string;
}): Promise<RegistrationAuthResult> {
  const email = normalizeRegistrationEmail(input.email);
  const pin = String(input.pin ?? "").trim();
  if (!email || pin.length !== 6) {
    return {
      ok: false,
      message: "Your MPIN couldn't be accepted for signup. Go back and set your MPIN again.",
    };
  }

  await discardSessionAfterSignup();
  await reclaimUnconfirmedAuthUser(email, input.attemptToken ?? "");

  const { data, error } = await supabase.auth.signUp({
    email,
    password: pin,
    options: {
      emailRedirectTo: input.emailRedirectTo,
    },
  });

  await discardSessionAfterSignup();

  if (error) {
    const mapped = mapVerificationEmailSendError(error);
    if (mapped.toLowerCase().includes("already registered")) {
      return resendSignupEmail(email, input.emailRedirectTo);
    }
    return { ok: false, message: mapped };
  }

  if (isExistingAuthUserSignup(data.user)) {
    return resendSignupEmail(email, input.emailRedirectTo);
  }

  return { ok: true };
}

export async function verifyRegistrationEmailOtp(input: {
  email: string;
  otp: string;
}): Promise<RegistrationAuthResult> {
  const email = normalizeRegistrationEmail(input.email);
  const token = normalizeSignupOtp(input.otp);
  if (!email || !isCompleteSignupOtp(token)) {
    return { ok: false, message: "Enter the code from your email." };
  }

  const first = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });
  if (first.error) {
    const retry = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (retry.error) {
      await discardLocalAuthSession();
      return { ok: false, message: mapSignupOtpError(first.error) };
    }
  }

  const { data } = await supabase.auth.getUser();
  if (!isAuthEmailConfirmed(data.user, email)) {
    await discardLocalAuthSession();
    return {
      ok: false,
      message: "Email is not confirmed yet. Check the code and try again.",
    };
  }

  return { ok: true };
}

export async function readConfirmedRegistrationSession(
  expectedEmail: string
): Promise<{ confirmed: boolean }> {
  const { data } = await supabase.auth.getSession();
  const sessionUser = data.session?.user;
  if (isAuthEmailConfirmed(sessionUser, expectedEmail)) {
    return { confirmed: true };
  }

  const { data: userData } = await supabase.auth.getUser();
  return { confirmed: isAuthEmailConfirmed(userData.user, expectedEmail) };
}

export async function createSessionFromAuthUrl(url: string): Promise<boolean> {
  const params = parseAuthCallbackParams(url);
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return !error;
  }
  if (params.accessToken && params.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    return !error;
  }
  return false;
}

export async function signOutAfterRegistration(): Promise<void> {
  await signOutLocalSession();
}
