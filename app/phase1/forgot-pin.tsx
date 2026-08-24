import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ROUTES } from "@/AppCore/AppRoutePaths";
import {
  AUTH_PIN_LENGTH,
  isCompleteAuthPin,
  normalizeAuthPin,
} from "@/AppCore/AuthPin";
import {
  RECOVERY_EMAIL_COOLDOWN_MS,
  RECOVERY_EMAIL_SENT_COPY,
  RECOVERY_OTP_MAX_LEN,
  abandonPinRecovery,
  completePinRecovery,
  isCompleteRecoveryOtp,
  normalizeRecoveryEmail,
  normalizeRecoveryOtp,
  readPinRecoveryPending,
  recoveryEmailFormatError,
  requestPinRecoveryEmail,
  verifyPinRecoveryOtp,
} from "@/AppCore/ForgotPin";
import { resendCooldownRemainingMs } from "@/AppCore/RegistrationDraft";
import { useSingleFlight } from "@/AppCore/UseInteractionGuard";

const { width: SCREEN_W } = Dimensions.get("window");
const SCREEN = Dimensions.get("screen");

const TEAL = "#008E8A";
const BORDER = "#CFCFCF";
const SUB = "#8B8B8B";
const DARK = "#2B2B2B";
const RED = "#E23B3B";
const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;

const H_PADDING = 22;
const SPACING = 10;
const available = SCREEN_W - H_PADDING * 2 - SPACING * 5;
const BOX_SIZE = Math.max(44, Math.min(56, Math.floor(available / 6)));
const DOT_SIZE = Math.max(20, Math.min(28, Math.floor(BOX_SIZE * 0.55)));

type Step = "email" | "code" | "new" | "confirm" | "done";

function PinBoxes({
  value,
  onChange,
  autoFocus,
  accessibilityLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
  accessibilityLabel: string;
}) {
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 180);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      style={styles.pinContainer}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(raw) => onChange(normalizeAuthPin(raw))}
        keyboardType="number-pad"
        maxLength={AUTH_PIN_LENGTH}
        caretHidden
        autoFocus={autoFocus}
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        style={styles.hiddenInput}
        accessibilityLabel={accessibilityLabel}
      />
      <View style={styles.boxRowCenter} pointerEvents="none">
        {Array.from({ length: AUTH_PIN_LENGTH }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.pinBox,
              { width: BOX_SIZE, height: BOX_SIZE, marginRight: index < 5 ? SPACING : 0 },
            ]}
          >
            <Text style={[styles.pinText, { fontSize: DOT_SIZE }]}>
              {value[index] ? "•" : ""}
            </Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

export default function ForgotPin() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; resume?: string }>();
  const { inFlight, run } = useSingleFlight();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(normalizeRecoveryEmail(String(params.email ?? "")));
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [emailSentAt, setEmailSentAt] = useState<number | null>(null);
  const [cooldownTick, setCooldownTick] = useState(0);

  const emailError = recoveryEmailFormatError(email);
  const canSend = !emailError;
  const canVerify = isCompleteRecoveryOtp(otp);
  const canAdvanceNew = isCompleteAuthPin(newPin);
  const canSubmitPin = isCompleteAuthPin(confirmPin);
  const cooldownMs = resendCooldownRemainingMs(emailSentAt, RECOVERY_EMAIL_COOLDOWN_MS);
  const cooldownSec = Math.ceil(cooldownMs / 1000) || 0;
  void cooldownTick;
  const resendBlocked = cooldownMs > 0;

  useEffect(() => {
    const incoming = normalizeRecoveryEmail(String(params.email ?? ""));
    if (incoming) setEmail(incoming);
  }, [params.email]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pending = await readPinRecoveryPending();
      if (cancelled || !pending) return;
      setEmail(pending.email);
      setStep("new");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!emailSentAt) return;
    const timer = setInterval(() => setCooldownTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [emailSentAt]);

  const copy = useMemo(() => {
    if (step === "email") {
      return {
        title: "Forgot your MPIN?",
        subtitle: "We'll email a code so you can set a new 6-digit MPIN.",
      };
    }
    if (step === "code") {
      return {
        title: "Enter the code",
        subtitle: `Type the code we sent to ${email || "your email"}. It expires after a few minutes.`,
      };
    }
    if (step === "new") {
      return {
        title: "Create a new MPIN",
        subtitle: "Enter a new 6-digit MPIN. You'll use this to log in.",
      };
    }
    if (step === "confirm") {
      return {
        title: "Re-enter your new MPIN",
        subtitle: "Confirm your new 6-digit MPIN.",
      };
    }
    return {
      title: "MPIN updated",
      subtitle: "Log in with your new MPIN.",
    };
  }, [step, email]);

  const wipeSecrets = () => {
    setOtp("");
    setNewPin("");
    setConfirmPin("");
  };

  const goToLogin = (nextEmail = email) => {
    wipeSecrets();
    router.replace({
      pathname: ROUTES.login,
      params: nextEmail ? { email: nextEmail } : {},
    });
  };

  const onBack = () => {
    setError("");
    setInfo("");
    if (step === "done" || step === "email") {
      void abandonPinRecovery().finally(() => goToLogin());
      return;
    }
    if (step === "code") {
      setOtp("");
      setStep("email");
      return;
    }
    if (step === "new") {
      void abandonPinRecovery().finally(() => goToLogin());
      return;
    }
    setConfirmPin("");
    setStep("new");
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  });

  const sendCode = (isResend: boolean) => {
    if (!canSend || inFlight) return;
    if (isResend && resendBlocked) return;
    void run(async () => {
      setError("");
      const result = await requestPinRecoveryEmail(email);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEmailSentAt(Date.now());
      setInfo(RECOVERY_EMAIL_SENT_COPY);
      setOtp("");
      setStep("code");
    });
  };

  const onVerifyCode = () => {
    if (!canVerify || inFlight) return;
    void run(async () => {
      setError("");
      const result = await verifyPinRecoveryOtp({ email, otp });
      if (!result.ok) {
        setError(result.message);
        setOtp("");
        return;
      }
      setOtp("");
      setInfo("");
      setStep("new");
    });
  };

  const onNextNewPin = () => {
    if (!canAdvanceNew || inFlight) return;
    setError("");
    setConfirmPin("");
    setStep("confirm");
  };

  const onSavePin = () => {
    if (!canSubmitPin || inFlight) return;
    void run(async () => {
      const result = await completePinRecovery({
        newPin,
        confirmPin,
      });
      if (!result.ok) {
        setError(result.message);
        if (result.reason === "validation" && result.message.includes("match")) {
          setConfirmPin("");
        }
        if (result.reason === "session") {
          wipeSecrets();
          setStep("email");
        }
        return;
      }
      wipeSecrets();
      setError("");
      setStep("done");
    });
  };

  return (
    <View style={styles.root}>
      <Image
        source={require("../../assets/images/City Hall.png")}
        style={styles.backdrop}
        resizeMode="cover"
      />
      <View style={styles.backdropScrim} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.container}>
            {step !== "done" ? (
              <>
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.subtitle}>{copy.subtitle}</Text>
              </>
            ) : null}

            {step === "email" ? (
              <View style={{ marginTop: 18 }}>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      if (error) setError("");
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Email Address"
                    placeholderTextColor="#B3B3B3"
                    style={styles.inputFull}
                  />
                </View>
                {email.trim() && emailError ? (
                  <Text style={styles.error}>{emailError}</Text>
                ) : null}
              </View>
            ) : null}

            {step === "code" ? (
              <View style={{ marginTop: 18 }}>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={otp}
                    onChangeText={(value) => {
                      setOtp(normalizeRecoveryOtp(value));
                      if (error) setError("");
                    }}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={RECOVERY_OTP_MAX_LEN}
                    placeholder="Email code"
                    placeholderTextColor="#B3B3B3"
                    style={[styles.inputFull, styles.otpInput]}
                    autoFocus
                  />
                </View>
              </View>
            ) : null}

            {step === "new" ? (
              <>
                <View style={styles.rowTop}>
                  <Text style={styles.label}>New MPIN</Text>
                </View>
                <PinBoxes
                  value={newPin}
                  onChange={(next) => {
                    setNewPin(next);
                    if (error) setError("");
                  }}
                  autoFocus
                  accessibilityLabel="New 6-digit MPIN"
                />
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <View style={styles.rowTop}>
                  <Text style={styles.label}>Confirm MPIN</Text>
                </View>
                <PinBoxes
                  value={confirmPin}
                  onChange={(next) => {
                    setConfirmPin(next);
                    if (error) setError("");
                  }}
                  autoFocus
                  accessibilityLabel="Confirm new 6-digit MPIN"
                />
              </>
            ) : null}

            {step === "new" || step === "confirm" ? (
              <View style={{ alignItems: "flex-end", marginTop: 8, paddingRight: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    if (step === "new") setNewPin("");
                    else setConfirmPin("");
                    setError("");
                  }}
                >
                  <Text style={styles.clear}>Clear</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {step === "done" ? (
              <View style={styles.doneWrap}>
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.subtitle}>{copy.subtitle}</Text>
              </View>
            ) : null}

            {info && step === "code" ? <Text style={styles.info}>{info}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={{ flex: 1 }} />

            {step === "email" ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => sendCode(false)}
                disabled={!canSend || inFlight}
                style={[styles.loginBtn, (!canSend || inFlight) && styles.loginBtnDisabled]}
              >
                <Text style={styles.loginBtnText}>
                  {inFlight ? "Sending…" : "Send code"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {step === "code" ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onVerifyCode}
                  disabled={!canVerify || inFlight}
                  style={[styles.loginBtn, (!canVerify || inFlight) && styles.loginBtnDisabled]}
                >
                  <Text style={styles.loginBtnText}>
                    {inFlight ? "Checking…" : "Verify code"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => sendCode(true)}
                  disabled={resendBlocked || inFlight}
                  style={[styles.createBtn, (resendBlocked || inFlight) && styles.loginBtnDisabled]}
                >
                  <Text style={styles.createBtnText}>
                    {resendBlocked ? `Resend in ${cooldownSec}s` : "Resend code"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}

            {step === "new" ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onNextNewPin}
                disabled={!canAdvanceNew || inFlight}
                style={[styles.loginBtn, (!canAdvanceNew || inFlight) && styles.loginBtnDisabled]}
              >
                <Text style={styles.loginBtnText}>Next</Text>
              </TouchableOpacity>
            ) : null}

            {step === "confirm" ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onSavePin}
                disabled={!canSubmitPin || inFlight}
                style={[styles.loginBtn, (!canSubmitPin || inFlight) && styles.loginBtnDisabled]}
              >
                <Text style={styles.loginBtnText}>
                  {inFlight ? "Saving…" : "Save MPIN"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {step === "done" ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => goToLogin()}
                style={styles.loginBtn}
              >
                <Text style={styles.loginBtnText}>Back to login</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onBack}
                activeOpacity={0.85}
                style={[styles.createBtn, { marginTop: 16 }]}
              >
                <Text style={styles.createBtnText}>
                  {step === "email" || step === "new" ? "Back to login" : "Back"}
                </Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 10 }} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", overflow: "hidden" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN.width,
    height: SCREEN.height,
  },
  backdropScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN.width,
    height: SCREEN.height,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  safe: { flex: 1, backgroundColor: "transparent" },
  container: { flex: 1, paddingHorizontal: H_PADDING, paddingTop: 12 },
  title: { marginTop: 22, fontSize: 32, color: DARK, fontFamily: FONT, fontWeight: "700" },
  subtitle: { marginTop: 6, fontSize: 16, color: SUB, fontFamily: FONT, fontWeight: "500" },
  inputWrap: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    height: 54,
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  inputFull: {
    fontSize: 16,
    color: DARK,
    fontFamily: FONT,
    fontWeight: "500",
    paddingVertical: 0,
  },
  otpInput: {
    textAlign: "center",
    letterSpacing: 4,
    fontWeight: "700",
    fontSize: 20,
  },
  info: { marginTop: 10, color: DARK, fontFamily: FONT, fontWeight: "500" },
  error: { marginTop: 8, color: RED, fontFamily: FONT, fontWeight: "500" },
  loginBtn: {
    height: 54,
    borderRadius: 12,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  loginBtnDisabled: { opacity: 0.35 },
  loginBtnText: { color: "#fff", fontSize: 16, fontFamily: FONT, fontWeight: "700" },
  createBtn: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  createBtnText: { color: TEAL, fontSize: 16, fontFamily: FONT, fontWeight: "700" },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 34,
    marginBottom: 10,
  },
  label: { fontFamily: FONT, fontWeight: "700", color: DARK, fontSize: 15 },
  clear: { fontFamily: FONT, fontWeight: "700", color: "#7D7D7D", fontSize: 14 },
  hiddenInput: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
  pinContainer: { position: "relative", alignItems: "center", justifyContent: "center" },
  boxRowCenter: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  pinBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: {
    fontFamily: FONT,
    fontWeight: "700",
    color: DARK,
    lineHeight: Platform.OS === "ios" ? undefined : 28,
  },
  doneWrap: { marginTop: 48 },
});
