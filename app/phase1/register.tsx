import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Platform,
  Pressable,
  AppState,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { supabase } from "../../lib/supabase";

// Imports & constants: React, navigation, storage, RN components and shared constants
const { width: SCREEN_W } = Dimensions.get("window");

const TEAL = "#008E8A";
const BORDER = "#CFCFCF";
const SUB = "#8B8B8B";
const DARK = "#2B2B2B";
const RED = "#E23B3B";

const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;
const SUFFIX_OPTIONS = ["", "Jr.", "Sr.", "II", "III", "IV"];
const SEX_OPTIONS = [
  { label: "Male", value: "M" as const },
  { label: "Female", value: "F" as const },
];
const BARANGAY_OPTIONS = [
  "Burol Main",
  "Burol I",
  "Burol II",
  "Burol III",
  "Datu Esmael (Bago-a-Ingud)",
  "Emmanuel Bergado I",
  "Emmanuel Bergado II",
  "Fatima I",
  "Fatima II",
  "Fatima III",
  "H-2 (Santa Veronica)",
  "Langkaan I",
  "Langkaan II",
  "Luzviminda I",
  "Luzviminda II",
  "Paliparan I",
  "Paliparan II",
  "Paliparan III",
  "Sabang",
  "Salawag",
  "Saint Peter I",
  "Saint Peter II",
  "Salitran I",
  "Salitran II",
  "Salitran III",
  "Salitran IV",
  "Sampaloc I",
  "Sampaloc II",
  "Sampaloc III",
  "Sampaloc IV",
  "Sampaloc V",
  "San Agustin I",
  "San Agustin II",
  "San Agustin III",
  "San Andres I",
  "San Andres II",
  "San Antonio De Padua I",
  "San Antonio De Padua II",
  "San Dionisio",
  "San Esteban",
  "San Francisco I",
  "San Francisco II",
  "San Isidro Labrador I",
  "San Isidro Labrador II",
  "San Jose",
  "San Juan",
  "San Lorenzo Ruiz I",
  "San Lorenzo Ruiz II",
  "San Luis I",
  "San Luis II",
  "San Manuel I",
  "San Manuel II",
  "San Mateo",
  "San Miguel I",
  "San Miguel II",
  "San Nicolas I",
  "San Nicolas II",
  "San Roque",
  "San Simon",
  "Santa Cristina I",
  "Santa Cristina II",
  "Santa Cruz I",
  "Santa Cruz II",
  "Santa Fe",
  "Santa Lucia",
  "Santa Maria",
  "Santo Cristo",
  "Santo Nino I",
  "Santo Nino II",
  "Victoria Reyes",
  "Zone I",
  "Zone I-B",
  "Zone II",
  "Zone III",
  "Zone IV",
];

// sanitizeName: clean input to letters/spaces and title-case each word
function sanitizeName(raw: string) {
  const cleaned = raw.replace(/[^a-zA-Z\s'-]/g, "");
  const collapsed = cleaned.replace(/\s+/g, " ").trimStart();

  return collapsed
    .split(" ")
    .map((word) => {
      if (!word) return "";
      return word
        .split(/([-'])/g)
        .map((chunk) => {
          if (chunk === "-" || chunk === "'") return chunk;
          if (!chunk) return "";
          const lower = chunk.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join("");
    })
    .join(" ");
}

// normalize mobile (PH): accept 10-digit starting with 9, format to '+63 998 301 1200'
function normalizeMobile(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10 && digits.startsWith("9")) {
    const part1 = digits.slice(0, 3);
    const part2 = digits.slice(3, 6);
    const part3 = digits.slice(6, 10);
    return `+63 ${part1} ${part2} ${part3}`;
  }
  return "";
}

function formatBirthDateValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseBirthDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [yRaw, mRaw, dRaw] = value.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }

  return date;
}

function isValidBirthDate(value: string) {
  const candidate = parseBirthDateValue(value);
  if (!candidate) return false;

  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return candidate <= todayDateOnly;
}

/* ---------- Supabase helpers (prep only) ---------- */
// Sends a verification email. Handles both new users and existing unverified users.
async function sendVerificationEmail(email: string, pin: string) {
  try {
    // First, try to sign up (creates user if doesn't exist)
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pin, // Use the 6-digit PIN as the password
    });

    // Check if user already exists (identities array is empty for existing users)
    if (data?.user && data.user.identities?.length === 0) {
      // User exists - try to resend confirmation email
      console.log("User exists, attempting to resend confirmation...");
      const resendResult = await supabase.auth.resend({
        type: "signup",
        email,
      });
      return { data: resendResult.data, error: resendResult.error };
    }

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

// Get the current authenticated user (if any)
async function getCurrentUser() {
  try {
    const res = await supabase.auth.getUser();
    return { user: res.data.user ?? null, error: res.error ?? null };
  } catch (err) {
    return { user: null, error: err };
  }
}

// Check whether the current user's email is confirmed
// When email confirmation is required, we try to sign in to verify
async function isEmailConfirmed(email: string, pin: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });
    
    if (error) {
      // "Email not confirmed" means user exists but hasn't verified
      if (error.message.includes("Email not confirmed")) {
        return { confirmed: false, user: null, error: null };
      }
      // Other errors
      return { confirmed: false, user: null, error };
    }
    
    // Success - email is confirmed and session is created
    return { confirmed: true, user: data.user, error: null };
  } catch (err) {
    return { confirmed: false, user: null, error: err };
  }
}

// Insert a profile row into public.users linked to auth.users via user_id.
async function insertUserProfile(payload: {
  user_id: string; // Links to auth.users.id
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  contact_number: string;
  email: string;
  voter_id_number?: string | null;
  address?: string | null;
  birth_date?: string | null;
  sex?: string | null;
}) {
  try {
    const { data, error } = await supabase.from("users").insert({
      id: payload.user_id, // Use the same ID as auth.users
      first_name: payload.first_name,
      middle_name: payload.middle_name ?? null,
      last_name: payload.last_name,
      suffix: payload.suffix ?? null,
      contact_number: payload.contact_number,
      email: payload.email,
      voter_id_number: payload.voter_id_number ?? null,
      address: payload.address ?? null,
      birth_date: payload.birth_date ?? null,
      sex: payload.sex ?? null,
    }).select("*").single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

async function checkEmailExists(email: string) {
  try {
    const { data, error } = await supabase.from("users").select("id").eq("email", email).limit(1);
    if (error) return { exists: false, error };
    return { exists: (data?.length ?? 0) > 0, error: null };
  } catch (err) {
    return { exists: false, error: err };
  }
}

// Register: multi-step registration root component controlling the whole flow
export default function Register() {
  const router = useRouter();

  // step: 0=register,1=additional-info,2=enter-mobile,3=create-mpin,4=re-enter-mpin,5=enable-notifs,6=verify-email,7=success
  const [step, setStep] = useState<number>(0);
  const stepRef = useRef(step);

  // Shared state: holds user-entered values used across steps
  const [firstName, setFirstName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [noMiddle, setNoMiddle] = useState(false);
  const [lastName, setLastName] = useState("");
  const [barangay, setBarangay] = useState("");
  const [barangayOpen, setBarangayOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [voterIdNumber, setVoterIdNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthDatePickerOpen, setBirthDatePickerOpen] = useState(false);
  const [birthDateDraft, setBirthDateDraft] = useState(new Date(2000, 0, 1));
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [sexOpen, setSexOpen] = useState(false);
  const [addressLine, setAddressLine] = useState("");
  const [mobile, setMobile] = useState("");
  const [mpin, setMpin] = useState("");

  const [emailExistsError, setEmailExistsError] = useState("");

  // UI state: flags for validation, suffix modal and invalid input tracking
  const [attempted, setAttempted] = useState(false);
  const [suffixOpen, setSuffixOpen] = useState(false);
  const [invalid, setInvalid] = useState({ first: false, middle: false, last: false });

  const emailError = useMemo(() => {
    const t = email.trim();
    if (!t) return "";
    if (!t.includes("@")) return "Email must contain @";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return "Enter a valid email";
    return "";
  }, [email]);

  const canCreate = useMemo(() => {
    if (!firstName.trim()) return false;
    if (!lastName.trim()) return false;
    if (!barangay.trim()) return false;
    if (!email.trim()) return false;
    if (emailError) return false;
    if (!noMiddle && !middleName.trim()) return false;
    return true;
  }, [firstName, lastName, barangay, email, emailError, noMiddle, middleName]);

  const voterIdError = useMemo(() => {
    const t = voterIdNumber.trim();
    if (!t) return "";
    if (!/^\d+$/.test(t)) return "Voter's ID Number must contain numbers only";
    return "";
  }, [voterIdNumber]);

  const birthDateError = useMemo(() => {
    const t = birthDate.trim();
    if (!t) return "";
    if (!isValidBirthDate(t)) return "Enter a valid birth date (YYYY-MM-DD)";
    return "";
  }, [birthDate]);

  const sexError = useMemo(() => {
    if (!sex) return "";
    if (sex !== "M" && sex !== "F") return "Select Male or Female";
    return "";
  }, [sex]);

  const composedAddress = useMemo(() => {
    const userPart = addressLine.trim().replace(/\s+/g, " ");
    if (!userPart || !barangay) return "";
    return `${userPart}, ${barangay}, Dasmariñas Cavite`;
  }, [addressLine, barangay]);

  const canNextFromAdditional = useMemo(() => {
    if (!voterIdNumber.trim()) return false;
    if (voterIdError) return false;
    if (!birthDate.trim()) return false;
    if (birthDateError) return false;
    if (!sex) return false;
    if (sexError) return false;
    if (!addressLine.trim()) return false;
    if (!barangay.trim()) return false;
    return true;
  }, [voterIdNumber, voterIdError, birthDate, birthDateError, sex, sexError, addressLine, barangay]);

  const toggleNoMiddle = () => {
    setNoMiddle((v) => {
      const next = !v;
      if (next) setMiddleName("");
      return next;
    });
  };

  const openBirthDatePicker = () => {
    const parsed = parseBirthDateValue(birthDate);
    setBirthDateDraft(parsed || new Date(2000, 0, 1));
    setBirthDatePickerOpen(true);
  };

  const onBirthDatePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (Platform.OS === "android") {
      setBirthDatePickerOpen(false);
      if (event.type === "set" && selectedDate) {
        setBirthDate(formatBirthDateValue(selectedDate));
      }
      return;
    }

    if (selectedDate) {
      setBirthDateDraft(selectedDate);
    }
  };

  const applyBirthDateFromIosPicker = () => {
    setBirthDate(formatBirthDateValue(birthDateDraft));
    setBirthDatePickerOpen(false);
  };

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const onResetFlow = async () => {
    setStep(0);
    setAttempted(false);
    setInvalid({ first: false, middle: false, last: false });
    setSuffix("");
    setSuffixOpen(false);
    setBarangay("");
    setBarangayOpen(false);
    setNoMiddle(false);
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setEmail("");
    setVoterIdNumber("");
    setBirthDate("");
    setBirthDatePickerOpen(false);
    setSex("");
    setSexOpen(false);
    setAddressLine("");
    setEmailExistsError("");
    setMobile("");
    setPin("");
    setMpin("");
    setConfirmPin("");
    setConfirmError("");
    setEmailSeconds(180);
    setEmailVerified(false);
    setEmailChecking(false);
    setEmailVerifyError("");
    setEmailSendError("");
    setProfileSaving(false);
    setProfileError("");
    setEnabled(false);

    await AsyncStorage.multiRemove(["REG_FULLNAME", "REG_EMAIL", "REG_MOBILE"]);
    await supabase.auth.signOut();
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if ((state === "background" || state === "inactive") && stepRef.current > 0) {
        void onResetFlow();
      }
    });

    return () => {
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // onCreate: validate names/barangay/email, store full name and email, then advance
  const onCreate = async () => {
    setAttempted(true);
    if (!canCreate) return;

    setEmailExistsError("");
    const existsCheck = await checkEmailExists(email.trim());
    if (existsCheck.error) {
      setEmailExistsError("Unable to verify email. Try again.");
      return;
    }
    if (existsCheck.exists) {
      setEmailExistsError("Email is already registered.");
      return;
    }

    const fullName = [firstName, noMiddle ? "" : middleName, lastName, suffix]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    await AsyncStorage.setItem("REG_FULLNAME", fullName);
    await AsyncStorage.setItem("REG_EMAIL", email.trim());

    setEmailSendError("");
    setAttempted(false);
    setStep(1);
  };

  const onNextAdditional = () => {
    setAttempted(true);
    if (!canNextFromAdditional) return;
    setAttempted(false);
    setStep(2);
  };

  // Verify Email: manage resend cooldown and verification check (step 6)
  const [emailSeconds, setEmailSeconds] = useState(180);
  const emailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailVerifyError, setEmailVerifyError] = useState("");

  const [emailSendError, setEmailSendError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (step !== 6) return;
    setEmailSeconds(180);
    emailTimerRef.current = setInterval(() => setEmailSeconds((p) => (p <= 1 ? 0 : p - 1)), 1000);
    return () => {
      if (emailTimerRef.current) clearInterval(emailTimerRef.current);
      emailTimerRef.current = null;
    };
  }, [step]);

  useEffect(() => {
    if (step !== 6) return;

    let active = true;
    const checkVerified = async () => {
      setEmailChecking(true);
      const res = await isEmailConfirmed(email.trim(), mpin || pin);
      if (!active) return;
      if (res.error) {
        setEmailVerifyError("Unable to check verification yet.");
        setEmailVerified(false);
      } else {
        setEmailVerifyError("");
        setEmailVerified(res.confirmed);
        
        // Auto-proceed when verified
        if (res.confirmed && !profileSaving) {
          setEmailChecking(false);
          const saved = await onSaveProfileAfterVerification();
          if (saved) setStep(7);
          return;
        }
      }
      setEmailChecking(false);
    };

    checkVerified();
    const intervalId = setInterval(checkVerified, 5000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [step]);

  const emailCanResend = emailSeconds <= 0;
  const canAdvanceEmail = emailVerified;
  const emailTimerLabel = useMemo(() => {
    if (emailCanResend) return "Resend email code";
    const m = Math.floor(emailSeconds / 60);
    const s = String(emailSeconds % 60).padStart(2, "0");
    return `Resend email code in ${m}:${s}`;
  }, [emailSeconds, emailCanResend]);

  // Success screen: show for 2 seconds then navigate to login
  useEffect(() => {
    if (step !== 7) return;
    const timer = setTimeout(() => {
      router.replace("/phase1/login");
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, router]);

  // Enter Mobile: validate 10-digit mobile (starts with 9) and save formatted mobile
  /* ---------- Enter Mobile (step 2) ---------- */
  const mobileError = useMemo(() => {
    const t = mobile.trim();
    if (!t) return "";
    if (!/^\d+$/.test(t)) return "Numbers only";
    if (t.length !== 10) return "Enter 10 digits (e.g. 9XXXXXXXXX)";
    if (!t.startsWith("9")) return "Must start with 9";
    return "";
  }, [mobile]);

  const canNextFromMobile = useMemo(() => mobile.trim().length === 10 && !mobileError, [mobile, mobileError]);

  const onNextMobile = async () => {
    setAttempted(true);
    if (!canNextFromMobile) return;
    const normalized = normalizeMobile(mobile.trim());
    if (!normalized) return;
    await AsyncStorage.setItem("REG_MOBILE", normalized);
    setStep(3);
  };

  // Create MPIN: accept and mask a 6-digit PIN and continue
  /* ---------- Create MPIN (step 3) ---------- */
  const [pin, setPin] = useState("");
  const pinInputRef = useRef<TextInput | null>(null);
  const canNextFromPin = useMemo(() => pin.length === 6, [pin]);

  // confirm/re-enter MPIN state
  const [confirmPin, setConfirmPin] = useState("");
  const confirmPinInputRef = useRef<TextInput | null>(null);
  const [confirmError, setConfirmError] = useState("");

  const onNextPin = () => {
    if (!canNextFromPin) return;
    setMpin(pin);
    setConfirmPin("");
    setConfirmError("");
    setStep(4); // go to re-enter MPIN
  };

  const onConfirmPin = () => {
    if (confirmPin.length !== 6) return;
    if (confirmPin !== mpin) {
      setConfirmError("MPINs do not match");
      return;
    }
    setStep(5);
  };

  const onRetryPin = () => {
    setPin("");
    setMpin("");
    setConfirmPin("");
    setConfirmError("");
    setStep(3);
  };

  useEffect(() => {
    if (confirmPin.length === 6) onConfirmPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPin]);

  // Enable Notifications: toggle to opt into notifications and finish registration
  /* ---------- Enable notifications (step 5) ---------- */
  const [enabled, setEnabled] = useState(false);
  const canFinish = useMemo(() => enabled, [enabled]);
  const onFinish = async () => {
    if (!canFinish) return;
    setEmailSendError("");

    // Only send verification email - profile will be saved AFTER verification
    const emailSend = await sendVerificationEmail(email.trim(), mpin || pin);
    if (emailSend.error) {
      const err = emailSend.error as { message?: string; status?: number };
      if (err.message?.includes("rate") || err.status === 429) {
        setEmailSendError("Email limit reached. Please wait a few minutes and try again.");
      } else if (err.message?.includes("already registered")) {
        setEmailSendError("This email is already registered. Try logging in.");
      } else {
        setEmailSendError(`Could not send email: ${err.message || "Unknown error"}`);
      }
      console.log("Email send error:", JSON.stringify(emailSend.error));
      return;
    }

    console.log("Verification email sent:", JSON.stringify(emailSend.data));
    setStep(6);
  };

  // Save profile AFTER email is verified
  const onSaveProfileAfterVerification = async () => {
    if (profileSaving) return false;
    setProfileSaving(true);
    setProfileError("");

    // Get the authenticated user (should be verified now)
    const { user, error: authError } = await getCurrentUser();
    if (authError || !user?.id) {
      setProfileError("Unable to verify your account. Please try again.");
      setProfileSaving(false);
      return false;
    }

    const fullMobile = normalizeMobile(mobile.trim());
    if (!fullMobile) {
      setProfileError("Invalid mobile number.");
      setProfileSaving(false);
      return false;
    }

    if (!voterIdNumber.trim() || !/^\d+$/.test(voterIdNumber.trim())) {
      setProfileError("Invalid Voter's ID Number.");
      setProfileSaving(false);
      return false;
    }

    if (!isValidBirthDate(birthDate.trim())) {
      setProfileError("Invalid birth date.");
      setProfileSaving(false);
      return false;
    }

    if (sex !== "M" && sex !== "F") {
      setProfileError("Invalid sex value.");
      setProfileSaving(false);
      return false;
    }

    if (!composedAddress) {
      setProfileError("Invalid address.");
      setProfileSaving(false);
      return false;
    }

    const profileRes = await insertUserProfile({
      user_id: user.id,
      first_name: firstName.trim(),
      middle_name: noMiddle ? null : middleName.trim() || null,
      last_name: lastName.trim(),
      suffix: suffix || null,
      contact_number: fullMobile,
      email: email.trim(),
      voter_id_number: voterIdNumber.trim(),
      address: composedAddress,
      birth_date: birthDate.trim(),
      sex,
    });

    if (profileRes.error) {
      console.log("Profile save error:", JSON.stringify(profileRes.error));
      setProfileError("Could not save your profile. Please try again.");
      setProfileSaving(false);
      return false;
    }

    // Cache user data for instant loading on Home/Account screens
    await AsyncStorage.setItem("apoyo_user_cache", JSON.stringify({
      first_name: firstName.trim(),
      contact_number: fullMobile,
      email: email.trim(),
    }));

    console.log("Profile saved successfully:", JSON.stringify(profileRes.data));
    setProfileSaving(false);
    return true;
  };

  // Progress helpers: one segment per step (active if index <= step)

  // Layout helpers: compute responsive box sizes for OTP/MPIN inputs
  const H_PADDING = 22;
  const SPACING = 10;
  const available = SCREEN_W - H_PADDING * 2 - SPACING * 5;
  const boxSize = Math.max(44, Math.min(56, Math.floor(available / 6)));
  const otpFontSize = Math.max(20, Math.min(28, Math.floor(boxSize * 0.52)));
  const dotSize = Math.max(20, Math.min(28, Math.floor(boxSize * 0.55)));

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.progressRow}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressSeg,
                  i <= step && styles.progressActive,
                  i < 7 && { marginRight: 10 },
                ]}
              />
            ))}
          </View>

          {/* --- Step 0: Register details --- */}
          {step === 0 && (
            <>
              <Text style={styles.title}>Let’s Get Started!</Text>

              {attempted && !canCreate && <Text style={styles.fillIn}>Fill in the Fields</Text>}
             

              <View style={styles.row}>
                <View style={[styles.inputWrap, { flex: 1 }, attempted && !firstName.trim() && styles.inputErrorBorder]}>
                  <TextInput
                    value={firstName}
                    onChangeText={(raw) => {
                      const cleaned = sanitizeName(raw);
                      setFirstName(cleaned);
                      if (raw !== cleaned) setInvalid((p) => ({ ...p, first: true }));
                    }}
                    placeholder="First Name"
                    placeholderTextColor="#B3B3B3"
                    style={styles.inputFull}
                    autoCapitalize="words"
                  />
                </View>

                <TouchableOpacity activeOpacity={0.85} onPress={() => setSuffixOpen(true)} style={[styles.inputWrap, { width: 86 }]}>
                  <Text style={[styles.dropdownText, !suffix && styles.dropdownPlaceholder]}>{suffix ? suffix : "Suffix"}</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={[styles.inputWrap, !noMiddle && attempted && !middleName.trim() && styles.inputErrorBorder]}>
                  <TextInput
                    value={middleName}
                    onChangeText={(raw) => {
                      const cleaned = sanitizeName(raw);
                      setMiddleName(cleaned);
                      if (raw !== cleaned) setInvalid((p) => ({ ...p, middle: true }));
                    }}
                    placeholder="Middle Name"
                    placeholderTextColor="#B3B3B3"
                    style={styles.inputFull}
                    editable={!noMiddle}
                    autoCapitalize="words"
                  />
                </View>

                <TouchableOpacity activeOpacity={0.85} onPress={toggleNoMiddle} style={styles.checkRow}>
                  <View style={[styles.checkbox, noMiddle && styles.checkboxChecked]}>{noMiddle ? <View style={styles.checkboxInner} /> : null}</View>
                  <Text style={styles.checkText}>I have no middle name</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={[styles.inputWrap, attempted && !lastName.trim() && styles.inputErrorBorder]}>
                  <TextInput
                    value={lastName}
                    onChangeText={(raw) => {
                      const cleaned = sanitizeName(raw);
                      setLastName(cleaned);
                      if (raw !== cleaned) setInvalid((p) => ({ ...p, last: true }));
                    }}
                    placeholder="Last Name"
                    placeholderTextColor="#B3B3B3"
                    style={styles.inputFull}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setBarangayOpen(true)}
                  style={[styles.inputWrap, attempted && !barangay && styles.inputErrorBorder]}
                >
                  <Text style={[styles.dropdownText, !barangay && styles.dropdownPlaceholder]}>
                    {barangay || "Barangay"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 14 }}>
                <View
                  style={[
                    styles.inputWrap,
                    attempted && (!email.trim() || !!emailError || !!emailExistsError) && styles.inputErrorBorder,
                  ]}
                >
                  <TextInput
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      if (emailExistsError) setEmailExistsError("");
                    }}
                    placeholder="Email Address"
                    placeholderTextColor="#B3B3B3"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.inputFull}
                  />
                </View>
                {attempted && !!emailError && <Text style={styles.error}>{emailError}</Text>}
                {!emailError && !!emailExistsError && <Text style={styles.error}>{emailExistsError}</Text>}
              </View>

              <View style={styles.termsBox}>
                <Text style={styles.termsText}>
                  By tapping <Text style={styles.termsBold}>Create account</Text>, you agree with the
                </Text>
                <View style={styles.termsLinksRow}>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => {}}>
                    <Text style={styles.link}>Terms and Conditions</Text>
                  </TouchableOpacity>
                  <Text style={styles.termsText}> and </Text>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => {}}>
                    <Text style={styles.link}>Privacy Notice</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity activeOpacity={0.9} onPress={onCreate} style={styles.createBtn}>
                <Text style={styles.createBtnText}>Create Account</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />
              <View style={styles.divider} />
              <Text style={styles.bottomText}>Already have an Apoyo account?</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/phase1/login")} style={styles.loginOutlineBtn}>
                <Text style={styles.loginOutlineText}>Login here</Text>
              </TouchableOpacity>

              <Modal visible={suffixOpen} transparent animationType="fade" onRequestClose={() => setSuffixOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setSuffixOpen(false)}>
                  <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Select Suffix</Text>
                    {SUFFIX_OPTIONS.map((opt) => (
                      <TouchableOpacity key={opt || "none"} activeOpacity={0.85} style={styles.modalItem} onPress={() => {
                        setSuffix(opt);
                        setSuffixOpen(false);
                      }}>
                        <Text style={styles.modalItemText}>{opt || "None"}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Pressable>
              </Modal>

              <Modal visible={barangayOpen} transparent animationType="fade" onRequestClose={() => setBarangayOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setBarangayOpen(false)}>
                  <Pressable style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Select Barangay</Text>
                    <ScrollView style={styles.modalList}>
                      {BARANGAY_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt}
                          activeOpacity={0.85}
                          style={styles.modalItem}
                          onPress={() => {
                            setBarangay(opt);
                            setBarangayOpen(false);
                          }}
                        >
                          <Text style={styles.modalItemText}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </Pressable>
                </Pressable>
              </Modal>
            </>
          )}

          {/* --- Step 1: Additional Information --- */}
          {step === 1 && (
            <>
              <Text style={styles.title}>Additional Information</Text>
              {attempted && !canNextFromAdditional && <Text style={styles.fillIn}>Fill in the Fields</Text>}

              <View style={{ marginTop: 14 }}>
                <View style={[styles.inputWrap, attempted && (!voterIdNumber.trim() || !!voterIdError) && styles.inputErrorBorder]}>
                  <TextInput
                    value={voterIdNumber}
                    onChangeText={(value) => setVoterIdNumber(value.replace(/[^\d]/g, ""))}
                    placeholder="Voter's ID Number"
                    placeholderTextColor="#B3B3B3"
                    keyboardType="number-pad"
                    style={styles.inputFull}
                  />
                </View>
                {attempted && !!voterIdError && <Text style={styles.error}>{voterIdError}</Text>}
              </View>

              <View style={{ marginTop: 14 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openBirthDatePicker}
                  style={[styles.inputWrap, attempted && (!birthDate.trim() || !!birthDateError) && styles.inputErrorBorder]}
                >
                  <Text style={[styles.dropdownText, !birthDate && styles.dropdownPlaceholder]}>
                    {birthDate || "Birth Date"}
                  </Text>
                </TouchableOpacity>
                {attempted && !!birthDateError && <Text style={styles.error}>{birthDateError}</Text>}
              </View>

              <View style={{ marginTop: 14 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSexOpen(true)}
                  style={[styles.inputWrap, attempted && !sex && styles.inputErrorBorder]}
                >
                  <Text style={[styles.dropdownText, !sex && styles.dropdownPlaceholder]}>
                    {sex === "M" ? "Male" : sex === "F" ? "Female" : "Sex"}
                  </Text>
                </TouchableOpacity>
                {attempted && !sex && <Text style={styles.error}>Select sex</Text>}
                {attempted && !!sexError && <Text style={styles.error}>{sexError}</Text>}
              </View>

              <Modal visible={sexOpen} transparent animationType="fade" onRequestClose={() => setSexOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setSexOpen(false)}>
                  <Pressable style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Select Sex</Text>
                    {SEX_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        activeOpacity={0.85}
                        style={styles.sexModalItem}
                        onPress={() => {
                          setSex(opt.value);
                          setSexOpen(false);
                        }}
                      >
                        <View style={[styles.sexRadioOuter, sex === opt.value && styles.sexRadioOuterActive]}>
                          {sex === opt.value ? <View style={styles.sexRadioInner} /> : null}
                        </View>
                        <Text style={styles.modalItemText}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </Pressable>
                </Pressable>
              </Modal>

              <View style={{ marginTop: 14 }}>
                <View style={[styles.addressFieldWrap, attempted && !addressLine.trim() && styles.inputErrorBorder]}>
                  <TextInput
                    value={addressLine}
                    onChangeText={setAddressLine}
                    placeholder="Address"
                    placeholderTextColor="#B3B3B3"
                    style={styles.addressFieldInput}
                    autoCapitalize="words"
                  />
                  <Text style={[styles.addressFieldSuffix, !barangay && styles.dropdownPlaceholder]}>
                    {`, ${barangay || "Barangay"}, Dasmariñas Cavite`}
                  </Text>
                </View>
              </View>

              <View style={{ flex: 1 }} />
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onNextAdditional}
                style={[styles.nextBtn, !canNextFromAdditional && styles.nextDisabled]}
              >
                <Text style={styles.nextText}>Next</Text>
              </TouchableOpacity>
            </>
          )}

          {birthDatePickerOpen && Platform.OS === "android" ? (
            <DateTimePicker
              value={birthDateDraft}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={onBirthDatePickerChange}
            />
          ) : null}

          <Modal
            visible={birthDatePickerOpen && Platform.OS === "ios"}
            transparent
            animationType="slide"
            onRequestClose={() => setBirthDatePickerOpen(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setBirthDatePickerOpen(false)}
            >
              <Pressable style={styles.modalCard}>
                <Text style={styles.modalTitle}>Select Birth Date</Text>
                <DateTimePicker
                  value={birthDateDraft}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={onBirthDatePickerChange}
                />
                <View style={styles.birthDateActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setBirthDatePickerOpen(false)}
                    style={styles.birthDateActionGhost}
                  >
                    <Text style={styles.birthDateActionGhostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={applyBirthDateFromIosPicker}
                    style={styles.birthDateActionSolid}
                  >
                    <Text style={styles.birthDateActionSolidText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          {/* --- Step 2: Enter Mobile --- */}
          {step === 2 && (
            <>
              <Text style={styles.title}>Enter mobile number</Text>
              {attempted && !canNextFromMobile && <Text style={styles.fillIn}>*Fill in</Text>}

              <View style={[styles.inputWrapMobile, attempted && !!mobileError && styles.inputErrorBorder]}>
                <View style={styles.prefix}><Text style={styles.prefixText}>+63</Text></View>
                <TextInput value={mobile} onChangeText={(v) => setMobile(v.replace(/[^\d]/g, "").slice(0,10))} keyboardType="number-pad" placeholder="9XXXXXXXXX" placeholderTextColor="#B3B3B3" maxLength={10} style={styles.inputMobile} />
              </View>
              {attempted && !!mobileError && <Text style={styles.error}>{mobileError}</Text>}

              <View style={{ flex: 1 }} />
              <TouchableOpacity activeOpacity={0.9} onPress={onNextMobile} style={[styles.nextBtn, !canNextFromMobile && styles.nextDisabled]}>
                <Text style={styles.nextText}>Next</Text>
              </TouchableOpacity>
            </>
          )}

          {/* --- Step 3: Create MPIN --- */}
          {step === 3 && (
            <>
              <Text style={styles.title}>Create your MPIN</Text>
              <Text style={styles.subtitle}>Create your MPIN. Enter a 6-digit MPIN below.</Text>

              <View style={styles.rowTop}>
                <Text style={styles.label}>Set your MPIN</Text>
              </View>

              <TouchableOpacity activeOpacity={1} onPress={() => pinInputRef.current?.focus()} style={styles.boxRowCenter}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={[styles.pinBox, { width: boxSize, height: boxSize, marginRight: i < 5 ? SPACING : 0 }]}>
                    <Text style={[styles.pinText, { fontSize: dotSize }]}>{pin[i] ? '•' : ''}</Text>
                  </View>
                ))}
              </TouchableOpacity>

              <View style={{ alignItems: 'flex-end', marginTop: 8, paddingRight: 10 }}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setPin("")}>
                  <Text style={styles.clear}>Clear</Text>
                </TouchableOpacity>
              </View>

              <TextInput ref={pinInputRef} value={pin} onChangeText={(v) => setPin(v.replace(/[^\d]/g, "").slice(0,6))} keyboardType="number-pad" maxLength={6} style={styles.hiddenInput} autoFocus />

              <Text style={styles.helper}>You will use this 6-digit PIN to login next time.</Text>

              <View style={{ flex: 1 }} />
              <TouchableOpacity activeOpacity={0.9} onPress={onNextPin} disabled={!canNextFromPin} style={[styles.nextBtn, !canNextFromPin && styles.nextDisabled]}>
                <Text style={styles.nextText}>Next</Text>
              </TouchableOpacity>
            </>
          )}

          {/* --- Step 4: Re-enter MPIN --- */}
          {step === 4 && (
            <>
              <Text style={styles.title}>Re-enter your MPIN</Text>
              <Text style={styles.subtitle}>Confirm your 6-digit MPIN below.</Text>

              <View style={styles.rowTop}>
                <Text style={styles.label}>Confirm your MPIN</Text>
              </View>

              <TouchableOpacity activeOpacity={1} onPress={() => confirmPinInputRef.current?.focus()} style={styles.boxRowCenter}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={[styles.pinBox, { width: boxSize, height: boxSize, marginRight: i < 5 ? SPACING : 0 }]}>
                    <Text style={[styles.pinText, { fontSize: dotSize }]}>{confirmPin[i] ? '•' : ''}</Text>
                  </View>
                ))}
              </TouchableOpacity>

              <View style={{ alignItems: 'flex-end', marginTop: 8, paddingRight: 10 }}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setConfirmPin("")}>
                  <Text style={styles.clear}>Clear</Text>
                </TouchableOpacity>
              </View>

              <TextInput ref={confirmPinInputRef} value={confirmPin} onChangeText={(v) => setConfirmPin(v.replace(/[^\d]/g, "").slice(0,6))} keyboardType="number-pad" maxLength={6} style={styles.hiddenInput} />

              {confirmError ? <Text style={styles.error}>{confirmError}</Text> : null}

              <View style={{ flex: 1 }} />
              {confirmError ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onRetryPin}
                  style={styles.nextBtn}
                >
                  <Text style={styles.nextText}>Re-enter MPIN</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

          {/* --- Step 5: Enable Notifications --- */}
          {step === 5 && (
            <>
              <View style={styles.headerStack}>
                <Image source={require("../../assets/images/Dasma.png")} style={styles.headerSeal} resizeMode="contain" />
                <Image source={require("../../assets/images/apoyo2.png")} style={styles.brandLogo} resizeMode="contain" />
              </View>

              <Text style={styles.titleNotif}>Enable notifications?</Text>
              <Text style={styles.subtitle}>Don’t miss important messages from{"\n"}government updates and account activity</Text>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Enable notifications</Text>
                <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: "#CFCFCF", true: "rgba(0,142,138,0.35)" }} thumbColor={enabled ? TEAL : "#FFFFFF"} ios_backgroundColor="#CFCFCF" />
              </View>

              {emailSendError ? <Text style={styles.error}>{emailSendError}</Text> : null}

              <View style={{ flex: 1 }} />
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onFinish}
                disabled={!canFinish}
                style={[styles.nextBtn, !canFinish && styles.nextDisabled]}
              >
                <Text style={styles.nextText}>Next</Text>
              </TouchableOpacity>
            </>
          )}

          {/* --- Step 6: Verify Email --- */}
          {step === 6 && (
            <>
              <Text style={styles.titleLarge}>Email Verification Sent</Text>
              <Text style={styles.subtitle}>Check your email inbox</Text>
              <Text style={styles.desc}>
                We've sent a verification email to <Text style={styles.bold}>{email || "sample@gmail.com"}</Text>. Open the email and click the confirmation link to verify your address and finish setup.
                If you don’t see it, please check your spam or junk folder.
              </Text>

              {emailSendError ? <Text style={styles.error}>{emailSendError}</Text> : null}
              {emailChecking && !emailVerified ? <Text style={styles.subtitle}>Checking verification...</Text> : null}
              {emailVerifyError ? <Text style={styles.error}>{emailVerifyError}</Text> : null}

              <View style={styles.rowTop}>
                <Text style={styles.label}>Didn’t receive the email?</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={async () => {
                  if (!emailCanResend) return;
                  const resend = await sendVerificationEmail(email.trim(), mpin || pin);
                  if (resend.error) {
                    setEmailSendError("We could not send a verification email. Try again.");
                    return;
                  }
                  setEmailSendError("");
                  setEmailSeconds(180);
                }}
                disabled={!emailCanResend}
                style={{ marginTop: 14 }}
              >
                <Text style={[styles.resend, !emailCanResend && styles.resendDisabled]}>{emailTimerLabel}</Text>
              </TouchableOpacity>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Kindly wait for at least <Text style={styles.infoBold}>3 minutes</Text> for the <Text style={styles.infoBold}>Verification email</Text> to arrive. Sometimes, there may be delays in receiving it. Thank you for your patience!
                </Text>
              </View>

              {profileSaving ? <Text style={styles.subtitle}>Saving your info...</Text> : null}
              {profileError ? <Text style={styles.error}>{profileError}</Text> : null}
              {emailVerified && !profileSaving && !profileError ? <Text style={styles.subtitle}>Email verified! Setting up your account...</Text> : null}

              <View style={{ flex: 1 }} />
            </>
          )}

          {/* --- Step 7: Success --- */}
          {step === 7 && (
            <>
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={styles.titleLarge}>Successfully Registered</Text>
                <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 16 }]}>
                  Returning to log-in screen...
                </Text>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}






const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 10 },

  progressRow: { flexDirection: "row", gap: 1, marginTop: 10, marginBottom: 26 },
  progressSeg: { flex: 1, height: 6, borderRadius: 999, backgroundColor: "#D9D9D9" },
  progressActive: { backgroundColor: TEAL },

  title: { marginTop: 20, fontSize: 34, color: DARK, fontFamily: FONT, fontWeight: "600", marginBottom: 6 },
  titleLarge: { marginTop: 36, fontSize: 34, color: DARK, fontFamily: FONT, fontWeight: "700" },
  titleNotif: { marginTop: 6, fontSize: 26, color: DARK, fontFamily: FONT, fontWeight: "700" },

  fillIn: { color: RED, fontFamily: FONT, fontWeight: "500", marginBottom: 10 },

  row: { flexDirection: "row", gap: 12 },

  inputWrap: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, height: 52, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#fff" },
  inputWrapAlt: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, height: 54, justifyContent: "center", paddingHorizontal: 14, backgroundColor: "#fff" },
  inputWrapMobile: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, height: 54, flexDirection: "row", alignItems: "center", overflow: "hidden", backgroundColor: "#fff" },
  inputErrorBorder: { borderColor: RED },

  inputFull: { fontSize: 16, color: DARK, fontFamily: FONT, fontWeight: "500", paddingVertical: 0 },
  inputAlt: { fontSize: 16, color: DARK, fontFamily: FONT, fontWeight: "600", paddingVertical: 0 },
  inputMobile: { flex: 1, fontSize: 16, paddingRight: 14, color: DARK, fontFamily: FONT, fontWeight: "500" },

  prefix: { width: 70, height: "100%", alignItems: "center", justifyContent: "center" },
  prefixText: { fontSize: 15, color: "#B3B3B3", fontFamily: FONT, fontWeight: "500" },

  dropdownText: { fontSize: 16, color: DARK, fontFamily: FONT, fontWeight: "500" },
  dropdownPlaceholder: { color: "#B3B3B3" },

  checkRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  checkboxChecked: { borderColor: TEAL },
  checkboxInner: { width: 12, height: 12, borderRadius: 2, backgroundColor: TEAL },
  checkText: { color: SUB, fontFamily: FONT, fontWeight: "500", fontSize: 13 },

  error: { marginTop: 8, color: RED, fontFamily: FONT, fontWeight: "500" },

  termsBox: { marginTop: 18, alignItems: "center" },
  termsText: { color: SUB, fontFamily: FONT, fontWeight: "500", fontSize: 12, textAlign: "center" },
  termsBold: { color: SUB, fontFamily: FONT, fontWeight: "600" },
  termsLinksRow: { flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap", justifyContent: "center" },
  link: { color: TEAL, fontFamily: FONT, fontWeight: "600", fontSize: 13 },

  createBtn: { height: 56, borderRadius: 12, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", marginTop: 30 },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: FONT, fontWeight: "600" },

  divider: { height: 1, backgroundColor: "#E6E6E6", marginTop: 22 },
  bottomText: { marginTop: 20, textAlign: "center", color: "#7D7D7D", fontFamily: FONT, fontWeight: "500", marginBottom: 12 },
  loginOutlineBtn: { height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: TEAL, alignItems: "center", justifyContent: "center" },
  loginOutlineText: { color: TEAL, fontSize: 16, fontFamily: FONT, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", paddingHorizontal: 22 },
  modalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  modalList: { maxHeight: 360 },
  modalTitle: { fontFamily: FONT, fontWeight: "600", fontSize: 16, color: DARK, marginBottom: 10 },
  modalItem: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  modalItemText: { fontFamily: FONT, fontWeight: "500", fontSize: 15, color: DARK },
  birthDateActionsRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  birthDateActionGhost: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  birthDateActionGhostText: {
    fontFamily: FONT,
    fontWeight: "600",
    color: SUB,
    fontSize: 13,
  },
  birthDateActionSolid: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  birthDateActionSolidText: {
    fontFamily: FONT,
    fontWeight: "600",
    color: "#fff",
    fontSize: 13,
  },

  sexModalItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sexRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  sexRadioOuterActive: {
    borderColor: TEAL,
  },
  sexRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: TEAL,
  },

  addressFieldWrap: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingVertical: 8,
  },
  addressFieldInput: {
    minWidth: 110,
    flexGrow: 1,
    fontSize: 16,
    color: DARK,
    fontFamily: FONT,
    fontWeight: "500",
    paddingVertical: 0,
  },
  addressFieldSuffix: {
    flexShrink: 1,
    fontSize: 14,
    color: SUB,
    fontFamily: FONT,
    fontWeight: "500",
  },

  // verify email / otp styles
  subtitle: { marginTop: 6, fontSize: 16, color: SUB, fontFamily: FONT, fontWeight: "600" },
  desc: { marginTop: 22, fontSize: 15, color: SUB, fontFamily: FONT, fontWeight: "500", lineHeight: 22 },
  bold: { color: DARK, fontFamily: FONT, fontWeight: "700" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 34, marginBottom: 10 },
  label: { fontFamily: FONT, fontWeight: "700", color: DARK, fontSize: 15 },
  clear: { fontFamily: FONT, fontWeight: "700", color: "#7D7D7D", fontSize: 14 },

  resend: { textAlign: "center", fontFamily: FONT, fontWeight: "600", color: DARK },
  resendDisabled: { color: SUB },

  infoBox: { marginTop: 26, borderWidth: 1.5, borderColor: TEAL, backgroundColor: "rgba(0,142,138,0.12)", borderRadius: 10, padding: 14 },
  infoText: { color: TEAL, fontFamily: FONT, fontWeight: "600", fontSize: 13, lineHeight: 18, textAlign: "center" },
  infoBold: { fontFamily: FONT, fontWeight: "800", color: TEAL },

  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },

  nextBtn: { height: 56, borderRadius: 12, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  nextDisabled: { backgroundColor: "rgba(0,142,138,0.18)" },
  nextText: { color: "#fff", fontFamily: FONT, fontWeight: "600", fontSize: 16 },

  // pin
  boxRowCenter: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  pinBox: { borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  pinText: { fontFamily: FONT, fontWeight: "700", color: DARK, lineHeight: Platform.OS === "ios" ? undefined : 28 },
  helper: { marginTop: 16, color: SUB, fontFamily: FONT, fontWeight: "500" },

  /* notifications */
  headerStack: { alignItems: "center", marginTop: 8, marginBottom: 14 },
  headerSeal: { width: SCREEN_W * 0.78, height: 46, marginBottom: 6 },
  brandLogo: { width: SCREEN_W * 0.42, height: 60 },
  toggleRow: { marginTop: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { color: DARK, fontFamily: FONT, fontWeight: "600", fontSize: 14 },
});
