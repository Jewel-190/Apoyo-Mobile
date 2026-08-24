import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  AUTH_PIN_LENGTH,
  changeAuthPin,
  isCompleteAuthPin,
  normalizeAuthPin,
} from "@/AppCore/AuthPin";
import { useSingleFlight } from "@/AppCore/UseInteractionGuard";
import {
  ACCOUNT_BORDER,
  ACCOUNT_FONT,
  ACCOUNT_MUTED,
  ACCOUNT_TEAL,
  ACCOUNT_TEXT,
  AccountPillButton,
  AccountSubpage,
} from "@/components/AccountUi";

const SCREEN_W = Dimensions.get("window").width;
const RED = "#E23B3B";
const PIN_SPACING = 10;
const H_PAD = 16;
const available = SCREEN_W - H_PAD * 2 - PIN_SPACING * 5;
const BOX_SIZE = Math.max(44, Math.min(56, Math.floor(available / 6)));
const DOT_SIZE = Math.max(18, Math.min(22, Math.floor(BOX_SIZE * 0.42)));

type Step = "current" | "next" | "confirm" | "done";

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
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={styles.pinWrap}
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
      <View style={styles.boxRow} pointerEvents="none">
        {Array.from({ length: AUTH_PIN_LENGTH }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.pinBox,
              index < AUTH_PIN_LENGTH - 1 ? { marginRight: PIN_SPACING } : null,
              value.length === index ? styles.pinBoxActive : null,
            ]}
          >
            <Text style={styles.pinDot}>{value[index] ? "•" : ""}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function ChangePin() {
  const router = useRouter();
  const { inFlight, run } = useSingleFlight();

  const [step, setStep] = useState<Step>("current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const canAdvanceCurrent = isCompleteAuthPin(currentPin);
  const canAdvanceNew = isCompleteAuthPin(newPin);
  const canSubmit = isCompleteAuthPin(confirmPin);

  const copy = useMemo(() => {
    if (step === "current") {
      return {
        heading: "Enter your current MPIN",
        body: "Confirm it's you before choosing a new 6-digit MPIN.",
        label: "Current MPIN",
      };
    }
    if (step === "next") {
      return {
        heading: "Create a new MPIN",
        body: "Enter a new 6-digit MPIN. You'll use this to log in.",
        label: "New MPIN",
      };
    }
    return {
      heading: "Re-enter your new MPIN",
      body: "Confirm your new 6-digit MPIN.",
      label: "Confirm MPIN",
    };
  }, [step]);

  const wipePins = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
  };

  const goBack = () => {
    setError("");
    if (step === "done" || step === "current") {
      wipePins();
      router.back();
      return;
    }
    if (step === "next") {
      setNewPin("");
      setStep("current");
      return;
    }
    setConfirmPin("");
    setStep("next");
  };

  const onNextFromCurrent = () => {
    if (!canAdvanceCurrent || inFlight) return;
    setError("");
    setStep("next");
  };

  const onNextFromNew = () => {
    if (!canAdvanceNew || inFlight) return;
    if (newPin === currentPin) {
      setError("Choose a different MPIN from your current one.");
      return;
    }
    setError("");
    setConfirmPin("");
    setStep("confirm");
  };

  const onSubmit = () => {
    if (!canSubmit || inFlight) return;
    void run(async () => {
      const result = await changeAuthPin({
        currentPin,
        newPin,
        confirmPin,
      });
      if (!result.ok) {
        setError(result.message);
        if (result.reason === "current_pin") {
          setCurrentPin("");
          setConfirmPin("");
          setStep("current");
        } else if (result.reason === "validation" && result.message.includes("match")) {
          setConfirmPin("");
        } else if (result.reason === "session") {
          wipePins();
        }
        return;
      }
      wipePins();
      setError("");
      setStep("done");
    });
  };

  return (
    <AccountSubpage title="Change PIN" showHome onBack={goBack}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {step === "done" ? (
          <View style={styles.page}>
            <View style={styles.successHero}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={52} color={ACCOUNT_TEAL} />
              </View>
              <Text style={styles.heading}>MPIN updated</Text>
              <Text style={styles.body}>
                Use your new MPIN the next time you log in. This device stays signed in.
              </Text>
            </View>
            <AccountPillButton label="Done" block onPress={() => router.back()} />
          </View>
        ) : (
          <View style={styles.page}>
            <Text style={styles.heading}>{copy.heading}</Text>
            <Text style={styles.body}>{copy.body}</Text>
            <Text style={styles.label}>{copy.label}</Text>

            {step === "current" ? (
              <PinBoxes
                value={currentPin}
                onChange={(next) => {
                  setCurrentPin(next);
                  if (error) setError("");
                }}
                autoFocus
                accessibilityLabel="Current 6-digit MPIN"
              />
            ) : null}
            {step === "next" ? (
              <PinBoxes
                value={newPin}
                onChange={(next) => {
                  setNewPin(next);
                  if (error) setError("");
                }}
                autoFocus
                accessibilityLabel="New 6-digit MPIN"
              />
            ) : null}
            {step === "confirm" ? (
              <PinBoxes
                value={confirmPin}
                onChange={(next) => {
                  setConfirmPin(next);
                  if (error) setError("");
                }}
                autoFocus
                accessibilityLabel="Confirm new 6-digit MPIN"
              />
            ) : null}

            <Pressable
              onPress={() => {
                if (step === "current") setCurrentPin("");
                if (step === "next") setNewPin("");
                if (step === "confirm") setConfirmPin("");
                setError("");
              }}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear MPIN"
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.flex} />

            {step === "current" ? (
              <AccountPillButton
                label="Next"
                block
                disabled={!canAdvanceCurrent}
                onPress={onNextFromCurrent}
              />
            ) : null}
            {step === "next" ? (
              <AccountPillButton
                label="Next"
                block
                disabled={!canAdvanceNew}
                onPress={onNextFromNew}
              />
            ) : null}
            {step === "confirm" ? (
              <AccountPillButton
                label={inFlight ? "Updating…" : "Update MPIN"}
                block
                disabled={!canSubmit || inFlight}
                onPress={onSubmit}
              />
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </AccountSubpage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: {
    flex: 1,
    paddingHorizontal: H_PAD,
    paddingTop: 18,
    paddingBottom: 28,
  },
  heading: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 22,
    color: ACCOUNT_TEXT,
    letterSpacing: 0.2,
  },
  body: {
    marginTop: 8,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
    color: ACCOUNT_MUTED,
  },
  label: {
    marginTop: 28,
    marginBottom: 12,
    textAlign: "center",
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 14,
    color: ACCOUNT_TEXT,
  },
  pinWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: BOX_SIZE,
  },
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  boxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  pinBox: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ACCOUNT_BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  pinBoxActive: {
    borderColor: ACCOUNT_TEAL,
  },
  pinDot: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: DOT_SIZE,
    color: ACCOUNT_TEXT,
    lineHeight: Platform.OS === "ios" ? undefined : DOT_SIZE + 6,
  },
  clearBtn: {
    alignSelf: "flex-end",
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  clearText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 14,
    color: ACCOUNT_MUTED,
  },
  error: {
    marginTop: 10,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 19,
    color: RED,
  },
  successHero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  successIcon: {
    marginBottom: 16,
  },
});
