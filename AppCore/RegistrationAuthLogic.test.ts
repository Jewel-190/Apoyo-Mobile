import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAuthEmailConfirmed,
  isCompleteSignupOtp,
  isEmailNotConfirmedError,
  isExistingAuthUserSignup,
  mapLoginAuthError,
  mapSignupOtpError,
  mapVerificationEmailSendError,
  normalizeSignupOtp,
  parseAuthCallbackParams,
  shouldDiscardSessionAfterSignup,
} from "./RegistrationAuthLogic";

describe("registration email confirmation rules", () => {
  it("does not treat a signup session as confirmed before email_confirmed_at", () => {
    assert.equal(
      isAuthEmailConfirmed(
        { email: "ada@example.com", email_confirmed_at: null },
        "ada@example.com"
      ),
      false
    );
  });

  it("requires the confirmed email to match the registration email", () => {
    assert.equal(
      isAuthEmailConfirmed(
        {
          email: "other@example.com",
          email_confirmed_at: "2026-08-25T00:00:00Z",
        },
        "ada@example.com"
      ),
      false
    );
    assert.equal(
      isAuthEmailConfirmed(
        {
          email: "Ada@Example.com",
          email_confirmed_at: "2026-08-25T00:00:00Z",
        },
        "ada@example.com"
      ),
      true
    );
  });

  it("always discards the Auth session returned by signUp", () => {
    assert.equal(shouldDiscardSessionAfterSignup(), true);
  });
});

describe("signup OTP and callback parsing", () => {
  it("normalizes OTP input to 6-8 alphanumeric characters", () => {
    assert.equal(normalizeSignupOtp(" 12-3456 "), "123456");
    assert.equal(isCompleteSignupOtp("123456"), true);
    assert.equal(isCompleteSignupOtp("12345"), false);
  });

  it("parses PKCE and implicit auth callback URLs", () => {
    assert.deepEqual(
      parseAuthCallbackParams("apoyocapstone://auth/callback?code=abc123"),
      {
        code: "abc123",
        accessToken: null,
        refreshToken: null,
        type: null,
      }
    );
    assert.deepEqual(
      parseAuthCallbackParams(
        "apoyocapstone://auth/callback#access_token=tok&refresh_token=ref&type=signup"
      ),
      {
        code: null,
        accessToken: "tok",
        refreshToken: "ref",
        type: "signup",
      }
    );
  });

  it("detects an existing unconfirmed Auth user from empty identities", () => {
    assert.equal(isExistingAuthUserSignup({ identities: [] }), true);
    assert.equal(isExistingAuthUserSignup({ identities: [{ id: "1" }] }), false);
  });
});

describe("auth error mapping", () => {
  it("maps unconfirmed login without leaking a session path", () => {
    assert.equal(isEmailNotConfirmedError({ message: "Email not confirmed" }), true);
    assert.match(mapLoginAuthError({ message: "Email not confirmed" }), /verify your email/i);
  });

  it("maps signup email send and OTP errors", () => {
    assert.match(
      mapVerificationEmailSendError({ status: 429, message: "rate limit" }),
      /too many verification emails/i
    );
    assert.match(mapSignupOtpError({ message: "Token has expired" }), /expired/i);
  });
});
