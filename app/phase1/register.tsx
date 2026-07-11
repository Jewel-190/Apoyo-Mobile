import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  ScrollView,
  Platform,
  Pressable,
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
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { fetchBarangays, type BarangayOption } from "@/AppCore/Barangays";
import { validateRegistrationEmailFormat } from "@/AppCore/EmailValidation";
import {
  formatRegisteredVoterId,
  isValidRegisteredVoterId,
  REGISTERED_VOTER_ID_MAX_LENGTH,
  REGISTERED_VOTER_ID_PLACEHOLDER,
} from "@/AppCore/RegisteredVoterId";
import {
  REGISTRATION_VOTER_REGISTRY_MISMATCH_MESSAGE,
  verifyRegisteredVoterForRegistration,
} from "@/AppCore/RegisteredVoterVerification";
import { STORAGE_KEYS } from "@/AppCore/ClientStorageKeys";
import {
  clearRegistrationDraft,
  readRegistrationDraft,
  resendCooldownRemainingMs,
  sanitizeRestoredStep,
  writeRegistrationDraft,
  type RegistrationDraftV1,
} from "@/AppCore/RegistrationDraft";
import { supabase } from "@/AppCore/SupabaseClient";

// Imports & constants: React, navigation, storage, RN components and shared constants
const { width: SCREEN_W } = Dimensions.get("window");

const TEAL = "#008E8A";
const EMAIL_RESEND_COOLDOWN_SEC = 60;
const BORDER = "#CFCFCF";
const SUB = "#8B8B8B";
const DARK = "#2B2B2B";
const RED = "#E23B3B";
const LIGHT_RED = "#E88787";

const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;
const SUFFIX_OPTIONS = ["", "Jr.", "Sr.", "II", "III", "IV"];
const SEX_OPTIONS = [
  { label: "Male", value: "M" as const },
  { label: "Female", value: "F" as const },
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

/** Earliest selectable birth year (platform default is ~1970 if minimumDate is omitted). */
const BIRTH_DATE_MIN = new Date(1900, 0, 1);

function birthDateMax(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function clampBirthDate(date: Date): Date {
  const max = birthDateMax();
  if (date.getTime() < BIRTH_DATE_MIN.getTime()) return new Date(BIRTH_DATE_MIN);
  if (date.getTime() > max.getTime()) return max;
  return date;
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

  const max = birthDateMax();
  return candidate >= BIRTH_DATE_MIN && candidate <= max;
}

function formatBirthDateDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  const parsed = parseBirthDateValue(trimmed);
  if (!parsed) return trimmed;
  return parsed.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function previewDisplayValue(value: string): string {
  const trimmed = value.trim();
  return trimmed || "—";
}

type PreviewRowProps = {
  label: string;
  value: string;
  isLast?: boolean;
};

function PreviewRow({ label, value, isLast }: PreviewRowProps) {
  return (
    <View style={[styles.previewRow, !isLast && styles.previewRowDivider]}>
      <Text style={styles.previewRowLabel}>{label}</Text>
      <Text style={styles.previewRowValue} selectable>
        {previewDisplayValue(value)}
      </Text>
    </View>
  );
}

type PreviewSectionProps = {
  title: string;
  children: React.ReactNode;
};

function PreviewSection({ title, children }: PreviewSectionProps) {
  return (
    <View style={styles.previewSection}>
      <Text style={styles.previewSectionTitle}>{title}</Text>
      <View style={styles.previewCard}>{children}</View>
    </View>
  );
}

type EmailVerifyStepRowProps = {
  label: string;
  detail?: string;
  status: "pending" | "active" | "done";
};

function EmailVerifyStepRow({ label, detail, status }: EmailVerifyStepRowProps) {
  const iconName =
    status === "done" ? "checkmark-circle" : status === "active" ? "ellipse" : "ellipse-outline";
  const iconColor = status === "done" ? TEAL : status === "active" ? TEAL : "#B8B8B8";

  return (
    <View style={styles.emailVerifyStepRow}>
      {status === "active" ? (
        <ActivityIndicator size="small" color={TEAL} style={styles.emailVerifyStepSpinner} />
      ) : (
        <Ionicons name={iconName} size={22} color={iconColor} />
      )}
      <View style={styles.emailVerifyStepCopy}>
        <Text
          style={[
            styles.emailVerifyStepLabel,
            status === "done" && styles.emailVerifyStepLabelDone,
            status === "active" && styles.emailVerifyStepLabelActive,
          ]}
        >
          {label}
        </Text>
        {detail ? <Text style={styles.emailVerifyStepDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

async function openEmailApp() {
  const candidates = Platform.select({
    ios: ["message://", "googlegmail://", "mailto:"],
    android: ["googlegmail://", "mailto:"],
    default: ["mailto:"],
  }) ?? ["mailto:"];

  for (const url of candidates) {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // try next handler
    }
  }
}

type AuthLikeError = {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
};

function extractAuthErrorFields(raw: unknown): AuthLikeError {
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

function mapVerificationEmailSendError(raw: unknown): string {
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

  if (__DEV__ && err.message) {
    const details = [err.code, err.status ? String(err.status) : ""].filter(Boolean).join(" · ");
    return details
      ? `Couldn't send verification email (${details}): ${err.message}`
      : `Couldn't send verification email: ${err.message}`;
  }

  if (err.message) {
    return `Couldn't send verification email: ${err.message}`;
  }

  return "Couldn't send the verification email. Check your connection and try again.";
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
      if (__DEV__) {
        console.log("User exists, attempting to resend confirmation...");
      }
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
// Prefer an existing session; otherwise sign in once confirmation is expected.
async function isEmailConfirmed(email: string, pin: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const { user: sessionUser } = await getCurrentUser();
    if (
      sessionUser?.email_confirmed_at &&
      sessionUser.email?.toLowerCase() === normalizedEmail
    ) {
      return { confirmed: true, user: sessionUser, error: null };
    }

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
type FacialVerificationPayload = {
  ok?: boolean;
  verified?: boolean;
  liveness_passed?: boolean;
  similarity?: number;
  threshold?: number;
  error?: string;
  code?: string;
};

type IdDocumentCheck = {
  field: string;
  label: string;
  matched: boolean;
  score: number;
  expected: string;
};

type IdDocumentVerificationPayload = {
  ok?: boolean;
  verified?: boolean;
  error?: string;
  code?: string;
  checks?: IdDocumentCheck[];
  ocr_preview?: string;
};

const FACIAL_CAPTURE_COUNTDOWN_SEC = 5;
const FACIAL_CAPTURE_STEPS = [
  { pose: "front", hint: "Look straight at the camera" },
  { pose: "left", hint: "Turn your head to the LEFT" },
  { pose: "right", hint: "Turn your head to the RIGHT" },
  { pose: "front", hint: "Look straight and blink once" },
] as const;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Supabase `invoke` throws on non-2xx before parsing JSON; read body from `error.context` when needed. */
async function readFacialVerificationPayload(
  data: unknown,
  error: unknown,
): Promise<FacialVerificationPayload | null> {
  if (data !== null && data !== undefined && typeof data === "object") {
    return data as FacialVerificationPayload;
  }
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const res = error.context as Response;
      const ct = res.headers.get("Content-Type") ?? "";
      if (ct.includes("application/json")) {
        const parsed: unknown = await res.clone().json();
        if (parsed && typeof parsed === "object") {
          return parsed as FacialVerificationPayload;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function readIdVerificationPayload(
  data: unknown,
  error: unknown,
): Promise<IdDocumentVerificationPayload | null> {
  if (data !== null && data !== undefined && typeof data === "object") {
    return data as IdDocumentVerificationPayload;
  }
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const res = error.context as Response;
      const ct = res.headers.get("Content-Type") ?? "";
      if (ct.includes("application/json")) {
        const parsed: unknown = await res.clone().json();
        if (parsed && typeof parsed === "object") {
          return parsed as IdDocumentVerificationPayload;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function insertUserProfile(payload: {
  attempt_token: string;
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
  registered_voter_id: string;
}) {
  try {
    const { data, error } = await supabase.rpc("finalize_registration_profile", {
      p_attempt_token: payload.attempt_token,
      p_first_name: payload.first_name,
      p_middle_name: payload.middle_name ?? "",
      p_last_name: payload.last_name,
      p_suffix: payload.suffix ?? "",
      p_contact_number: payload.contact_number,
      p_email: payload.email,
      p_voter_id_number: payload.voter_id_number ?? "",
      p_address: payload.address ?? "",
      p_birth_date: payload.birth_date ?? "",
      p_sex: payload.sex ?? "",
      p_registered_voter_id: payload.registered_voter_id,
    });

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

function mapFinalizeRegistrationError(raw: unknown): string {
  const msg =
    typeof raw === "object" && raw !== null && "message" in raw
      ? String((raw as { message?: string }).message || "")
      : String(raw ?? "");
  const lower = msg.toLowerCase();
  if (lower.includes("outdated")) {
    return "This verification link is no longer valid. Please restart registration.";
  }
  if (lower.includes("already used")) {
    return "This step was already completed. Try logging in with your email and PIN.";
  }
  if (lower.includes("no active registration")) {
    return "Registration session expired. Please restart registration.";
  }
  if (lower.includes("invalid registration attempt")) {
    return "Registration session expired. Please restart registration.";
  }
  if (lower.includes("unauthorized")) {
    return "Unable to verify your session. Please try again.";
  }
  if (lower.includes("registered voter verification is required")) {
    return "Please complete voter verification on the first step before continuing.";
  }
  if (
    lower.includes("do not match the registered voter") ||
    lower.includes("voter id number does not match") ||
    lower.includes("already linked to this voter") ||
    lower.includes("registration_voter_registry_mismatch")
  ) {
    return REGISTRATION_VOTER_REGISTRY_MISMATCH_MESSAGE;
  }
  if (lower.includes("voter id number must use the full format")) {
    return "Voter's ID Number must use the full format 0000-00000-0000000000000-0.";
  }
  if (lower.includes("invalid registered voter reference")) {
    return "Voter verification expired. Please go back to the first step and try again.";
  }
  if (__DEV__ && msg) {
    return msg;
  }
  return "Could not save your profile. Please try again.";
}

async function checkEmailExists(email: string) {
  try {
    const { data, error } = await supabase.rpc("is_registration_email_available", {
      p_email: email.trim().toLowerCase(),
    });
    if (error) return { exists: false, error };
    return { exists: data === false, error: null };
  } catch (err) {
    return { exists: false, error: err };
  }
}

// Register: multi-step registration root component controlling the whole flow
export default function Register() {
  const router = useRouter();

  // step: 0=register,1=additional-info,2=mobile,3=id-upload,4=facial-verify,5=mpin,6=re-mpin,7=verify-email,8=success
  const [step, setStep] = useState<number>(0);

  // Shared state: holds user-entered values used across steps
  const [firstName, setFirstName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [noMiddle, setNoMiddle] = useState(false);
  const [lastName, setLastName] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState<BarangayOption | null>(null);
  const [barangayOpen, setBarangayOpen] = useState(false);
  const [barangayOptions, setBarangayOptions] = useState<BarangayOption[]>([]);
  const [barangaysError, setBarangaysError] = useState("");
  const [email, setEmail] = useState("");
  const [voterIdNumber, setVoterIdNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthDatePickerOpen, setBirthDatePickerOpen] = useState(false);
  const [birthDateDraft, setBirthDateDraft] = useState(new Date(2000, 0, 1));
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [sexOpen, setSexOpen] = useState(false);
  const [houseUnit, setHouseUnit] = useState("");
  const [streetLine, setStreetLine] = useState("");
  const [mobile, setMobile] = useState("");
  const [mpin, setMpin] = useState("");
  const [registrationAttemptToken, setRegistrationAttemptToken] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [emailSentAt, setEmailSentAt] = useState<number | null>(null);
  const pendingBarangayIdRef = useRef<string | null>(null);
  const persistDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runEmailVerificationCheckRef = useRef<(() => Promise<void>) | null>(null);
  const profileFinalizeInFlightRef = useRef(false);
  // Registration email verification happens after MPIN confirm.

  const loadBarangays = useCallback(async () => {
    setBarangaysError("");
    try {
      const rows = await fetchBarangays();
      setBarangayOptions(rows);
      setSelectedBarangay((prev) => {
        if (!prev) return prev;
        return rows.find((r) => r.id === prev.id) ?? null;
      });
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : "Unable to load barangays. Check your connection and try again.";
      setBarangaysError(message);
      setBarangayOptions([]);
    }
  }, []);

  useEffect(() => {
    void loadBarangays();
  }, [loadBarangays]);

  const [idImageUri, setIdImageUri] = useState<string | null>(null);
  const [idImageBase64, setIdImageBase64] = useState<string | null>(null);
  const [idVerifying, setIdVerifying] = useState(false);
  const [idVerifyError, setIdVerifyError] = useState("");
  const [idVerifyChecks, setIdVerifyChecks] = useState<IdDocumentCheck[]>([]);
  const [facialVerifying, setFacialVerifying] = useState(false);
  const [facialError, setFacialError] = useState("");
  const [livenessPhase, setLivenessPhase] = useState<"idle" | "capturing" | "verifying">("idle");
  const [livenessCaptureHint, setLivenessCaptureHint] = useState("");
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const [capturePoseIndex, setCapturePoseIndex] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<React.ComponentRef<typeof CameraView> | null>(null);

  const [emailExistsError, setEmailExistsError] = useState("");
  const [voterRegistryError, setVoterRegistryError] = useState("");
  const [verifiedRegisteredVoterId, setVerifiedRegisteredVoterId] = useState<string | null>(null);
  const [registeredVoterRow, setRegisteredVoterRow] = useState<{
    id: string;
    voter_id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    birth_date: string;
    sex: string;
    barangay_id: string;
  } | null>(null);

  // UI state: flags for validation, suffix modal and invalid input tracking
  const [attempted, setAttempted] = useState(false);
  const [suffixOpen, setSuffixOpen] = useState(false);
  const [invalid, setInvalid] = useState({ first: false, middle: false, last: false });

  const emailError = useMemo(() => {
    const t = email.trim();
    if (!t) return "";
    return validateRegistrationEmailFormat(t);
  }, [email]);

  const voterIdError = useMemo(() => {
    const t = voterIdNumber.trim();
    if (!t) return "";
    if (!isValidRegisteredVoterId(t)) {
      return `Use the full format ${REGISTERED_VOTER_ID_PLACEHOLDER}`;
    }
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

  // Enter Mobile: validate 10-digit mobile (starts with 9)
  const mobileError = useMemo(() => {
    const t = mobile.trim();
    if (!t) return "";
    if (!/^\d+$/.test(t)) return "Numbers only";
    if (t.length !== 10) return "Enter 10 digits (e.g. 9XXXXXXXXX)";
    if (!t.startsWith("9")) return "Must start with 9";
    return "";
  }, [mobile]);

  const canNextFromStart = useMemo(() => {
    if (!voterIdNumber.trim() || voterIdError) return false;
    if (!email.trim() || emailError) return false;
    if (!mobile.trim() || mobileError) return false;
    return true;
  }, [voterIdNumber, voterIdError, email, emailError, mobile, mobileError]);

  const composedAddress = useMemo(() => {
    const housePart = houseUnit.trim().replace(/\s+/g, " ");
    const streetPart = streetLine.trim().replace(/\s+/g, " ");
    const cityPart = "Dasmariñas, Cavite";

    const barangayName = selectedBarangay?.name ?? "";
    if (!housePart || !streetPart || !barangayName) return "";
    return `${housePart}, ${streetPart}, ${barangayName}, ${cityPart}`;
  }, [houseUnit, streetLine, selectedBarangay]);

  const canNextFromAdditional = useMemo(() => {
    if (!houseUnit.trim()) return false;
    if (!streetLine.trim()) return false;
    return true;
  }, [houseUnit, streetLine]);

  const step1Preview = useMemo(() => {
    const sexLabel =
      sex === "M" ? "Male" : sex === "F" ? "Female" : sex?.trim() || "";
    const middleLabel = noMiddle
      ? "No middle name"
      : middleName.trim();
    const nameParts = [
      firstName.trim(),
      noMiddle ? "" : middleName.trim(),
      lastName.trim(),
      suffix.trim(),
    ].filter(Boolean);

    return {
      voterId: registeredVoterRow?.voter_id || voterIdNumber.trim(),
      fullName: nameParts.join(" "),
      firstName: firstName.trim(),
      middleName: middleLabel,
      lastName: lastName.trim(),
      suffix: suffix.trim(),
      birthDate: formatBirthDateDisplay(birthDate),
      sex: sexLabel,
      barangay: selectedBarangay?.name ?? "",
      mobile: normalizeMobile(mobile.trim()) || mobile.trim(),
      email: email.trim(),
    };
  }, [
    registeredVoterRow,
    voterIdNumber,
    firstName,
    middleName,
    lastName,
    suffix,
    noMiddle,
    birthDate,
    sex,
    selectedBarangay,
    mobile,
    email,
  ]);

  const toggleNoMiddle = () => {
    setNoMiddle((v) => {
      const next = !v;
      if (next) setMiddleName("");
      return next;
    });
  };

  const openBirthDatePicker = () => {
    const parsed = parseBirthDateValue(birthDate);
    setBirthDateDraft(clampBirthDate(parsed || new Date(2000, 0, 1)));
    setBirthDatePickerOpen(true);
  };

  const onBirthDatePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (Platform.OS === "android") {
      setBirthDatePickerOpen(false);
      if (event.type === "set" && selectedDate) {
        setBirthDate(formatBirthDateValue(clampBirthDate(selectedDate)));
      }
      return;
    }

    if (selectedDate) {
      setBirthDateDraft(clampBirthDate(selectedDate));
    }
  };

  const applyBirthDateFromIosPicker = () => {
    setBirthDate(formatBirthDateValue(clampBirthDate(birthDateDraft)));
    setBirthDatePickerOpen(false);
  };

  const onNextFromStart = async () => {
    setAttempted(true);
    setVoterRegistryError("");
    if (!canNextFromStart) return;

    const formattedVoterId = formatRegisteredVoterId(voterIdNumber.trim());
    setVoterIdNumber(formattedVoterId);

    setEmailExistsError("");

    const existsCheck = await checkEmailExists(email.trim());
    if (existsCheck.error) {
      setEmailExistsError("Unable to verify email. Try again.");
      return;
    }
    if (existsCheck.exists) {
      setEmailExistsError("This email is already registered. Try logging in instead.");
      return;
    }

    const attemptRes = await supabase.rpc("begin_registration_attempt", {
      p_email: email.trim().toLowerCase(),
    });
    if (attemptRes.error || !attemptRes.data) {
      setEmailExistsError("Unable to start registration. Please try again.");
      return;
    }
    setRegistrationAttemptToken(String(attemptRes.data));

    const normalized = normalizeMobile(mobile.trim());
    if (!normalized) return;
    await AsyncStorage.setItem(STORAGE_KEYS.regMobile, normalized);
    await AsyncStorage.setItem(STORAGE_KEYS.regEmail, email.trim());

    const { data, error } = await (supabase as any).rpc(
      "lookup_registered_voter_by_voter_id",
      {
        p_voter_id: formattedVoterId,
      }
    );

    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.id) {
      setVoterRegistryError(REGISTRATION_VOTER_REGISTRY_MISMATCH_MESSAGE);
      return;
    }

    const rv = row as {
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

    setRegisteredVoterRow(rv);
    setVerifiedRegisteredVoterId(rv.id);

    // Populate what will be saved into `users` from the registry.
    setFirstName(rv.first_name ?? "");
    setMiddleName(rv.middle_name ?? "");
    setNoMiddle(!String(rv.middle_name ?? "").trim());
    setLastName(rv.last_name ?? "");
    setSuffix(rv.suffix ?? "");
    setBirthDate(String(rv.birth_date ?? "").slice(0, 10));
    setSex(rv.sex === "M" || rv.sex === "F" ? (rv.sex as "M" | "F") : "");
    setSelectedBarangay(
      barangayOptions.find((b) => b.id === rv.barangay_id) ?? null
    );

    const fullName = [
      rv.first_name,
      rv.middle_name ?? "",
      rv.last_name,
      rv.suffix ?? "",
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    await AsyncStorage.setItem(STORAGE_KEYS.regFullname, fullName);

    setAttempted(false);
    setStep(1);
  };

  const onNextAddress = () => {
    setAttempted(true);
    if (!verifiedRegisteredVoterId) {
      setVoterRegistryError("Please verify your voter registration on the first step before continuing.");
      setStep(0);
      return;
    }
    if (!canNextFromAdditional) return;

    setAttempted(false);
    setStep(3);
  };

  // Verify Email: manage resend cooldown and verification check (carousel 3 — verify phase)
  const [emailSeconds, setEmailSeconds] = useState(EMAIL_RESEND_COOLDOWN_SEC);
  const emailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailVerifyError, setEmailVerifyError] = useState("");

  const [emailSendError, setEmailSendError] = useState("");
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [didAttemptInitialVerificationEmail, setDidAttemptInitialVerificationEmail] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");

  const isEmailVerifyStep = step === 7;

  const emailVerifyUiPhase = useMemo(() => {
    if (isSendingVerificationEmail) return "sending" as const;
    if (emailSendError) return "send_failed" as const;
    if (profileSaving) return "saving" as const;
    if (emailVerified) return "verified" as const;
    if (emailChecking) return "checking" as const;
    if (didAttemptInitialVerificationEmail) return "waiting" as const;
    return "sending" as const;
  }, [
    isSendingVerificationEmail,
    emailSendError,
    profileSaving,
    emailVerified,
    emailChecking,
    didAttemptInitialVerificationEmail,
  ]);

  useEffect(() => {
    if (!isEmailVerifyStep) return;
    if (didAttemptInitialVerificationEmail) return;

    setDidAttemptInitialVerificationEmail(true);
    void onFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmailVerifyStep, didAttemptInitialVerificationEmail]);

  useEffect(() => {
    if (!isEmailVerifyStep || !emailSentAt) return;

    const tick = () => {
      const remaining = resendCooldownRemainingMs(emailSentAt);
      setEmailSeconds(remaining <= 0 ? 0 : Math.ceil(remaining / 1000));
    };

    tick();
    emailTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (emailTimerRef.current) clearInterval(emailTimerRef.current);
      emailTimerRef.current = null;
    };
  }, [isEmailVerifyStep, emailSentAt]);

  useEffect(() => {
    if (!isEmailVerifyStep) return;

    profileFinalizeInFlightRef.current = false;
    let active = true;

    const finalizeIfConfirmed = async () => {
      if (!active || profileFinalizeInFlightRef.current) return;
      profileFinalizeInFlightRef.current = true;
      setEmailChecking(false);
      const saved = await onSaveProfileAfterVerification();
      if (!saved) profileFinalizeInFlightRef.current = false;
      if (saved) setStep(8);
    };

    const checkVerified = async () => {
      if (!active || profileFinalizeInFlightRef.current) return;
      setEmailChecking(true);
      const res = await isEmailConfirmed(email.trim(), mpin || pin);
      if (!active) return;
      if (res.error) {
        setEmailVerifyError("Unable to check verification yet.");
        setEmailVerified(false);
      } else {
        setEmailVerifyError("");
        setEmailVerified(res.confirmed);

        if (res.confirmed) {
          await finalizeIfConfirmed();
          return;
        }
      }
      setEmailChecking(false);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active || profileFinalizeInFlightRef.current) return;
        const confirmed =
          !!session?.user?.email_confirmed_at &&
          session.user.email?.toLowerCase() === email.trim().toLowerCase();
        if (
          confirmed &&
          (event === "SIGNED_IN" ||
            event === "USER_UPDATED" ||
            event === "TOKEN_REFRESHED")
        ) {
          setEmailVerified(true);
          setEmailVerifyError("");
          void finalizeIfConfirmed();
        }
      }
    );

    runEmailVerificationCheckRef.current = checkVerified;
    void checkVerified();
    const intervalId = setInterval(checkVerified, 12_000);
    return () => {
      active = false;
      runEmailVerificationCheckRef.current = null;
      clearInterval(intervalId);
      authListener.subscription.unsubscribe();
    };
  }, [isEmailVerifyStep]);

  const emailResendOnCooldown = useMemo(() => {
    if (!emailSentAt) return false;
    return resendCooldownRemainingMs(emailSentAt) > 0;
  }, [emailSentAt, emailSeconds]);

  const emailCanResend = useMemo(() => {
    if (isSendingVerificationEmail) return false;
    if (!emailSentAt) return didAttemptInitialVerificationEmail;
    return !emailResendOnCooldown;
  }, [
    isSendingVerificationEmail,
    emailSentAt,
    didAttemptInitialVerificationEmail,
    emailResendOnCooldown,
  ]);

  const showEmailResendStatus =
    isSendingVerificationEmail || emailResendOnCooldown || !didAttemptInitialVerificationEmail;

  const emailResendStatusLabel = useMemo(() => {
    if (!didAttemptInitialVerificationEmail) return "Preparing verification email…";
    if (isSendingVerificationEmail) return "Sending verification email…";
    if (emailResendOnCooldown) {
      const m = Math.floor(emailSeconds / 60);
      const s = String(emailSeconds % 60).padStart(2, "0");
      return `You can resend in ${m}:${s}`;
    }
    return "";
  }, [
    didAttemptInitialVerificationEmail,
    isSendingVerificationEmail,
    emailResendOnCooldown,
    emailSeconds,
  ]);

  // Success screen: show for 2 seconds then navigate to login
  useEffect(() => {
    if (step !== 8) return;
    const timer = setTimeout(() => {
      router.replace("/phase1/login");
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, router]);

  // (Moved mobile validation earlier for Step 0)

  const idImagePickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 0.85,
    base64: true,
  };

  const applyIdImageAsset = (a: ImagePicker.ImagePickerAsset) => {
    setIdImageUri(a.uri);
    setIdImageBase64(a.base64 ?? null);
    setIdVerifyError("");
    setIdVerifyChecks([]);
    if (!a.base64) {
      setIdVerifyError("Could not read image. Try another photo.");
    }
  };

  const pickIdFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setIdVerifyError("Photo library access is needed to choose your ID.");
      return;
    }
    setIdVerifyError("");
    const res = await ImagePicker.launchImageLibraryAsync(idImagePickerOptions);
    if (res.canceled || !res.assets[0]) return;
    applyIdImageAsset(res.assets[0]);
  };

  const takeIdPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setIdVerifyError("Camera access is needed to photograph your ID.");
      return;
    }
    setIdVerifyError("");
    const res = await ImagePicker.launchCameraAsync(idImagePickerOptions);
    if (res.canceled || !res.assets[0]) return;
    applyIdImageAsset(res.assets[0]);
  };


  const verifyIdAndContinue = async () => {
    setAttempted(true);
    if (!idImageBase64 || !registrationAttemptToken || !email.trim()) {
      setIdVerifyError("Missing registration data. Go back and try again.");
      return;
    }

    setIdVerifying(true);
    setIdVerifyError("");
    setIdVerifyChecks([]);

    try {
      const { data, error } = await supabase.functions.invoke("id-document-verification", {
        body: {
          email: email.trim().toLowerCase(),
          registrationAttemptToken,
          idImageBase64,
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          suffix: suffix.trim(),
          noMiddle,
          birthDate: birthDate.trim(),
          voterIdNumber: voterIdNumber.trim(),
          sex,
        },
      });

      const payload = await readIdVerificationPayload(data, error);
      if (!payload) {
        setIdVerifyError(
          error instanceof Error ? error.message : "ID verification request failed.",
        );
        return;
      }

      if (payload.checks?.length) {
        setIdVerifyChecks(payload.checks);
      }

      if (!payload.ok) {
        setIdVerifyError(payload.error || "Could not verify your ID. Try again.");
        return;
      }

      if (!payload.verified) {
        setIdVerifyError(
          payload.error ||
            "ID details do not match your registration info. Use a clear photo of your own ID.",
        );
        return;
      }

      setAttempted(false);
      setFacialError("");
      setCameraReady(false);
      setLivenessPhase("idle");
      setStep(4);
    } catch (e) {
      setIdVerifyError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIdVerifying(false);
    }
  };

  const onNextIdUpload = () => {
    void verifyIdAndContinue();
  };

  const invokeFacialVerification = useCallback(
    async (body: {
      email: string;
      registrationAttemptToken: string;
      idImageBase64: string;
      selfieImageBase64: string;
      livenessFramesBase64: string[];
      poseLabels: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("facial-verification", {
        body: {
          ...body,
          poseLabels: body.poseLabels,
        },
      });
      const payload = await readFacialVerificationPayload(data, error);

      if (!payload) {
        setFacialError(
          error instanceof Error ? error.message : "Verification request failed.",
        );
        return;
      }

      if (!payload.ok) {
        setFacialError(payload.error || "Verification failed.");
        return;
      }
      if (payload.liveness_passed === false) {
        setFacialError(
          payload.error ||
            "Live check failed. Face the camera directly—do not use a photo or screen.",
        );
        return;
      }
      if (!payload.verified) {
        setFacialError(
          payload.error ||
            "Face did not match your ID photo. Try again with clearer lighting and face the camera.",
        );
        return;
      }
      setLivenessPhase("idle");
      setStep(5);
    },
    [],
  );

  const runFacialVerification = async () => {
    if (!idImageBase64 || !registrationAttemptToken || !email.trim()) {
      setFacialError("Missing registration data. Go back and try again.");
      return;
    }
    if (!cameraRef.current || !cameraReady) {
      setFacialError("Camera is not ready yet.");
      return;
    }
    setFacialVerifying(true);
    setFacialError("");
    setLivenessPhase("capturing");
    try {
      const frames: string[] = [];
      const poseLabels: string[] = [];

      for (let i = 0; i < FACIAL_CAPTURE_STEPS.length; i++) {
        const captureStep = FACIAL_CAPTURE_STEPS[i]!;
        setCapturePoseIndex(i + 1);
        setLivenessCaptureHint(
          `${captureStep.hint} — photo ${i + 1} of ${FACIAL_CAPTURE_STEPS.length}`,
        );

        for (let sec = FACIAL_CAPTURE_COUNTDOWN_SEC; sec >= 1; sec--) {
          setCaptureCountdown(sec);
          await sleep(1000);
        }
        setCaptureCountdown(null);
        setLivenessCaptureHint("Hold still…");

        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.7,
          shutterSound: false,
        });
        if (!photo?.base64) {
          setFacialError("Could not capture live frames. Try again.");
          return;
        }
        frames.push(photo.base64);
        poseLabels.push(captureStep.pose);
      }

      setCapturePoseIndex(0);
      setLivenessCaptureHint("");
      setCaptureCountdown(null);

      if (new Set(frames).size < frames.length) {
        setFacialError(
          "Camera did not capture new frames. Wait for each countdown and try again.",
        );
        return;
      }

      const frontSelfie =
        frames.find((_, idx) => poseLabels[idx] === "front" && idx === frames.length - 1) ??
        frames[frames.length - 1] ??
        "";

      setLivenessPhase("verifying");
      await withTimeout(
        invokeFacialVerification({
          email: email.trim().toLowerCase(),
          registrationAttemptToken,
          idImageBase64,
          selfieImageBase64: frontSelfie,
          livenessFramesBase64: frames,
          poseLabels,
        }),
        150_000,
        "Verification timed out. Ensure Docker is running, wait a moment, and try again.",
      );
    } catch (e) {
      setFacialError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setFacialVerifying(false);
      setLivenessPhase("idle");
      setLivenessCaptureHint("");
      setCaptureCountdown(null);
      setCapturePoseIndex(0);
    }
  };

  // Contact details are collected on Step 0 now; continue to ID upload after address.

  // Create MPIN: accept and mask a 6-digit PIN and continue
  /* ---------- Create MPIN (step 5) ---------- */
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
    setStep(6); // go to re-enter MPIN
  };

  const onConfirmPin = async () => {
    if (confirmPin.length !== 6) return;
    if (confirmPin !== mpin) {
      setConfirmError("MPINs do not match");
      return;
    }

    setConfirmError("");
    setEmailSendError("");
    setDidAttemptInitialVerificationEmail(false);
    setStep(7);
  };

  const onRetryPin = () => {
    setPin("");
    setMpin("");
    setConfirmPin("");
    setConfirmError("");
    setDidAttemptInitialVerificationEmail(false);
    setStep(5);
  };

  useEffect(() => {
    if (step !== 6) return;
    if (confirmPin.length !== 6) return;
    void onConfirmPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, confirmPin]);

  // Send verification email after MPIN confirmation
  const onFinish = async () => {
    if (isSendingVerificationEmail) return false;

    setIsSendingVerificationEmail(true);
    setEmailSendError("");

    // Only send verification email - profile will be saved AFTER verification
    const emailSend = await sendVerificationEmail(email.trim(), mpin || pin);
    if (emailSend.error) {
      setEmailSendError(mapVerificationEmailSendError(emailSend.error));
      if (__DEV__) {
        console.log("Email send error:", JSON.stringify(emailSend.error));
      }
      setIsSendingVerificationEmail(false);
      return false;
    }

    if (__DEV__) {
      console.log("Verification email sent:", JSON.stringify(emailSend.data));
    }
    setEmailSentAt(Date.now());
    setEmailSeconds(EMAIL_RESEND_COOLDOWN_SEC);
    setIsSendingVerificationEmail(false);
    return true;
  };

  // Save profile AFTER email is verified
  const onSaveProfileAfterVerification = async () => {
    if (profileSaving) return false;
    setProfileSaving(true);
    setProfileError("");

    if (!registrationAttemptToken) {
      setProfileError("Registration session expired. Please restart registration.");
      setProfileSaving(false);
      return false;
    }

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

    if (!verifiedRegisteredVoterId) {
      setProfileError("Voter verification expired. Please restart registration from the first step.");
      setProfileSaving(false);
      return false;
    }

    const formattedVoterId = voterIdNumber.trim()
      ? formatRegisteredVoterId(voterIdNumber.trim())
      : "";
    if (formattedVoterId && !isValidRegisteredVoterId(formattedVoterId)) {
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

    const profileEmail = email.trim().toLowerCase();

    const profileRes = await insertUserProfile({
      attempt_token: registrationAttemptToken,
      first_name: firstName.trim(),
      middle_name: noMiddle ? null : middleName.trim() || null,
      last_name: lastName.trim(),
      suffix: suffix || null,
      contact_number: fullMobile,
      email: profileEmail,
      voter_id_number: formattedVoterId,
      address: composedAddress,
      birth_date: birthDate.trim(),
      sex,
      registered_voter_id: verifiedRegisteredVoterId,
    });

    if (profileRes.error) {
      setProfileError(mapFinalizeRegistrationError(profileRes.error));
      if (__DEV__) {
        console.log("Profile save error:", JSON.stringify(profileRes.error));
      }
      setProfileSaving(false);
      return false;
    }

    // Cache user data for instant loading on Home/Account screens
    await AsyncStorage.setItem("apoyo_user_cache", JSON.stringify({
      first_name: firstName.trim(),
      contact_number: fullMobile,
      email: profileEmail,
    }));

    if (__DEV__) {
      console.log("Profile saved successfully:", JSON.stringify(profileRes.data));
    }
    setProfileSaving(false);
    return true;
  };

  const clearDownstreamRegistrationPayload = useCallback(() => {
    setRegistrationAttemptToken("");
    setVerifiedRegisteredVoterId(null);
    setRegisteredVoterRow(null);
    setFirstName("");
    setMiddleName("");
    setNoMiddle(false);
    setLastName("");
    setSuffix("");
    setSelectedBarangay(null);
    setBirthDate("");
    setSex("");
    setHouseUnit("");
    setStreetLine("");
    setIdImageUri(null);
    setIdImageBase64(null);
    setFacialError("");
    setFacialVerifying(false);
    setLivenessPhase("idle");
    setCameraReady(false);
    setPin("");
    setMpin("");
    setConfirmPin("");
    setConfirmError("");
    setDidAttemptInitialVerificationEmail(false);
    setEmailVerified(false);
    setEmailChecking(false);
    setEmailVerifyError("");
    setEmailSendError("");
    setIsSendingVerificationEmail(false);
    setEmailSentAt(null);
    setEmailSeconds(EMAIL_RESEND_COOLDOWN_SEC);
    setProfileSaving(false);
    setProfileError("");
    profileFinalizeInFlightRef.current = false;
  }, []);

  const restartRegistration = useCallback(async () => {
    await clearRegistrationDraft();
    clearDownstreamRegistrationPayload();
    setVoterRegistryError("");
    setEmailExistsError("");
    setAttempted(false);
    setVoterIdNumber("");
    setEmail("");
    setMobile("");
    setStep(0);
  }, [clearDownstreamRegistrationPayload]);

  const goRegisterBack = useCallback(() => {
    switch (step) {
      case 1:
        clearDownstreamRegistrationPayload();
        setAttempted(false);
        setStep(0);
        break;
      case 2:
        setAttempted(false);
        setStep(1);
        break;
      case 3:
        setAttempted(false);
        setFacialError("");
        setStep(2);
        break;
      case 4:
        setFacialError("");
        setFacialVerifying(false);
        setCameraReady(false);
        setStep(3);
        break;
      case 5:
        setAttempted(false);
        setStep(4);
        break;
      case 6:
        setConfirmPin("");
        setConfirmError("");
        setStep(5);
        break;
      case 7:
        setAttempted(false);
        setConfirmPin("");
        setConfirmError("");
        setStep(6);
        break;
      default:
        break;
    }
  }, [step, clearDownstreamRegistrationPayload]);

  const buildRegistrationDraft = useCallback((): RegistrationDraftV1 => {
    return {
      version: 1,
      updatedAt: Date.now(),
      step,
      firstName,
      suffix,
      middleName,
      noMiddle,
      lastName,
      selectedBarangayId: selectedBarangay?.id ?? null,
      selectedBarangayName: selectedBarangay?.name ?? null,
      email,
      voterIdNumber,
      birthDate,
      sex,
      houseUnit,
      streetLine,
      mobile,
      mpin,
      pin,
      confirmPin,
      registrationAttemptToken,
      verifiedRegisteredVoterId,
      registeredVoterRow,
      idImageUri,
      idImageBase64,
      hasIdImage: !!idImageBase64,
      didAttemptInitialVerificationEmail,
      emailSentAt,
    };
  }, [
    step,
    firstName,
    suffix,
    middleName,
    noMiddle,
    lastName,
    selectedBarangay,
    email,
    voterIdNumber,
    birthDate,
    sex,
    houseUnit,
    streetLine,
    mobile,
    mpin,
    pin,
    confirmPin,
    registrationAttemptToken,
    verifiedRegisteredVoterId,
    registeredVoterRow,
    idImageUri,
    idImageBase64,
    didAttemptInitialVerificationEmail,
    emailSentAt,
  ]);

  const persistRegistrationDraft = useCallback(async () => {
    if (!draftHydrated || step === 8) return;
    await writeRegistrationDraft(buildRegistrationDraft());
  }, [buildRegistrationDraft, draftHydrated, step]);

  const schedulePersistRegistrationDraft = useCallback(() => {
    if (!draftHydrated || step === 8) return;
    if (persistDraftTimerRef.current) clearTimeout(persistDraftTimerRef.current);
    persistDraftTimerRef.current = setTimeout(() => {
      void persistRegistrationDraft();
    }, 350);
  }, [draftHydrated, persistRegistrationDraft, step]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const draft = await readRegistrationDraft();
      if (cancelled) return;

      if (draft) {
        const restoredStep = sanitizeRestoredStep(draft);
        setStep(restoredStep);
        setFirstName(draft.firstName);
        setSuffix(draft.suffix);
        setMiddleName(draft.middleName);
        setNoMiddle(draft.noMiddle);
        setLastName(draft.lastName);
        setEmail(draft.email);
        setVoterIdNumber(draft.voterIdNumber);
        setBirthDate(draft.birthDate);
        setSex(draft.sex);
        setHouseUnit(draft.houseUnit);
        setStreetLine(draft.streetLine);
        setMobile(draft.mobile);
        setMpin(draft.mpin);
        setPin(draft.pin);
        setConfirmPin(draft.confirmPin);
        setRegistrationAttemptToken(draft.registrationAttemptToken);
        setVerifiedRegisteredVoterId(draft.verifiedRegisteredVoterId);
        setRegisteredVoterRow(draft.registeredVoterRow);
        setIdImageUri(draft.idImageUri);
        setIdImageBase64(draft.idImageBase64);
        setDidAttemptInitialVerificationEmail(draft.didAttemptInitialVerificationEmail);
        setEmailSentAt(draft.emailSentAt);
        setEmailSeconds(
          Math.max(0, Math.ceil(resendCooldownRemainingMs(draft.emailSentAt) / 1000))
        );
        pendingBarangayIdRef.current = draft.selectedBarangayId;
      }

      setDraftHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated || !pendingBarangayIdRef.current || barangayOptions.length === 0) {
      return;
    }
    const match = barangayOptions.find((b) => b.id === pendingBarangayIdRef.current);
    if (match) {
      setSelectedBarangay(match);
      pendingBarangayIdRef.current = null;
    }
  }, [draftHydrated, barangayOptions]);

  useEffect(() => {
    if (!draftHydrated || !registeredVoterRow) return;
    const matchesRegistry =
      firstName === (registeredVoterRow.first_name ?? "") &&
      middleName === (registeredVoterRow.middle_name ?? "") &&
      lastName === (registeredVoterRow.last_name ?? "") &&
      suffix === (registeredVoterRow.suffix ?? "") &&
      birthDate === String(registeredVoterRow.birth_date ?? "").slice(0, 10) &&
      sex === registeredVoterRow.sex &&
      (selectedBarangay?.id ?? null) === registeredVoterRow.barangay_id;
    if (matchesRegistry) return;
    setVoterRegistryError("");
    setVerifiedRegisteredVoterId(null);
  }, [
    draftHydrated,
    registeredVoterRow,
    firstName,
    middleName,
    lastName,
    suffix,
    birthDate,
    sex,
    selectedBarangay,
  ]);

  useEffect(() => {
    schedulePersistRegistrationDraft();
    return () => {
      if (persistDraftTimerRef.current) clearTimeout(persistDraftTimerRef.current);
    };
  }, [schedulePersistRegistrationDraft]);

  useEffect(() => {
    if (step !== 8) return;
    void clearRegistrationDraft();
  }, [step]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        void persistRegistrationDraft();
        return;
      }
      if (nextState === "active" && step === 7) {
        void runEmailVerificationCheckRef.current?.();
      }
    });
    return () => sub.remove();
  }, [persistRegistrationDraft, step]);

  const profileErrorNeedsRestart = useMemo(
    () => /restart registration|session expired|no longer valid/i.test(profileError),
    [profileError]
  );

  // Progress helpers: one segment per step (active if index <= step)

  // Layout helpers: compute responsive box sizes for OTP/MPIN inputs
  const H_PADDING = 22;
  const SPACING = 10;
  const available = SCREEN_W - H_PADDING * 2 - SPACING * 5;
  const boxSize = Math.max(44, Math.min(56, Math.floor(available / 6)));
  const otpFontSize = Math.max(20, Math.min(28, Math.floor(boxSize * 0.52)));
  const dotSize = Math.max(20, Math.min(28, Math.floor(boxSize * 0.55)));

  const progressStep = step;

  if (!draftHydrated) {
    return (
      <SafeAreaView style={[styles.safe, styles.draftHydrateRoot]}>
        <ActivityIndicator size="large" color={TEAL} />
        <Text style={styles.draftHydrateText}>Restoring your registration…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.progressRow}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressSeg,
                  i <= progressStep && styles.progressActive,
                  i < 8 && { marginRight: 4 },
                ]}
              />
            ))}
          </View>

          {/* --- Step 0: Voter ID + Email + Mobile --- */}
          {step === 0 && (
            <ScrollView
              style={styles.step0Scroll}
              contentContainerStyle={styles.step0ScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {attempted && !canNextFromStart ? (
                <Text style={styles.fillIn}>Fill in the Fields</Text>
              ) : null}

              <View style={styles.step0Top}>
                <View style={styles.step0Gap}>
                  <View
                    style={[
                      styles.inputWrap,
                      styles.step0InputWrap,
                      attempted && (!voterIdNumber.trim() || !!voterIdError) && styles.inputErrorBorder,
                    ]}
                  >
                    <TextInput
                      value={voterIdNumber}
                      onChangeText={(value) => setVoterIdNumber(formatRegisteredVoterId(value))}
                      placeholder={`Voter's ID Number (${REGISTERED_VOTER_ID_PLACEHOLDER})`}
                      placeholderTextColor="#B3B3B3"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={REGISTERED_VOTER_ID_MAX_LENGTH}
                      style={styles.inputFull}
                    />
                  </View>
                  {attempted && !voterIdNumber.trim() ? (
                    <Text style={styles.error}>Required</Text>
                  ) : attempted && !!voterIdError ? (
                    <Text style={styles.error}>{voterIdError}</Text>
                  ) : null}
                </View>

                <View style={styles.step0Gap}>
                  <View
                    style={[
                      styles.inputWrapMobile,
                      attempted && !!mobileError && styles.inputErrorBorder,
                      attempted && !!mobileError && styles.inputWrapWithInlineError,
                    ]}
                  >
                    <View style={styles.prefix}><Text style={styles.prefixText}>+63</Text></View>
                    <TextInput
                      value={mobile}
                      onChangeText={(v) => setMobile(v.replace(/[^\d]/g, "").slice(0,10))}
                      keyboardType="number-pad"
                      placeholder="9XXXXXXXXX"
                      placeholderTextColor="#B3B3B3"
                      maxLength={10}
                      style={[
                        styles.inputMobile,
                        attempted && !!mobileError && styles.inputMobileWithInlineError,
                      ]}
                    />
                    {attempted && !!mobileError ? (
                      <Text style={styles.errorInline} numberOfLines={1}>
                        {mobileError}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.step0Gap}>
                  <View
                    style={[
                      styles.inputWrap,
                      styles.step0InputWrap,
                      attempted && (!email.trim() || !!emailError || !!emailExistsError) && styles.inputErrorBorder,
                      attempted && (!!emailError || !!emailExistsError) && styles.inputWrapWithInlineError,
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
                      style={[
                        styles.inputFull,
                        attempted && (!!emailError || !!emailExistsError) && styles.inputFullWithInlineError,
                      ]}
                    />
                    {attempted && !!emailError ? (
                      <Text style={styles.errorInline} numberOfLines={1}>
                        {emailError}
                      </Text>
                    ) : null}
                    {!emailError && !!emailExistsError ? (
                      <Text style={styles.errorInline} numberOfLines={1}>
                        {emailExistsError}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.step0Bottom}>
                <View style={[styles.termsBox, styles.step0TermsBox]}>
                  <Text style={[styles.termsText, styles.voterReminderText]}>
                    You must be a registered voter of Dasmariñas City to create an account.
                  </Text>
                  {voterRegistryError ? (
                    <Text style={[styles.error, { marginTop: 10, textAlign: "center" }]}>{voterRegistryError}</Text>
                  ) : null}
                  <Text style={[styles.termsText, styles.step0TermsFollowUp]}>
                    By tapping <Text style={styles.termsBold}>Next</Text>, you agree with the
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

                <TouchableOpacity activeOpacity={0.9} onPress={onNextFromStart} style={[styles.createBtn, styles.step0CreateBtn]}>
                  <Text style={styles.createBtnText}>Next</Text>
                </TouchableOpacity>

                <View style={[styles.divider, styles.step0Divider]} />
                <Text style={[styles.bottomText, styles.step0BottomText]}>Already have an Apoyo account?</Text>
                <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/phase1/login")} style={[styles.loginOutlineBtn, styles.step0LoginBtn]}>
                  <Text style={styles.loginOutlineText}>Login here</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          )}

          {/* --- Step 1: Read-only preview from registered_voters --- */}
          {step === 1 && (
            <View style={styles.step1Root}>
              <View style={styles.step1Header}>
                <Text style={[styles.title, styles.step1HeaderTitle]}>
                  Confirm your details
                </Text>
              </View>

              <ScrollView
                style={styles.step1Scroll}
                contentContainerStyle={styles.step1ScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.step1Subtitle}>
                  Review the information below. It comes from the registered voter
                  list and will be saved to your Apoyo account.
                </Text>

                <View style={[styles.infoBox, styles.step1InfoBox]}>
                  <Text style={styles.infoText}>
                    These fields are <Text style={styles.infoBold}>read-only</Text>.
                    {" "}
                    If something looks wrong, go back and re-enter your Voter&apos;s ID,
                    or contact your barangay office.
                  </Text>
                </View>

                <PreviewSection title="Voter record">
                  <PreviewRow
                    label="Voter's ID number"
                    value={step1Preview.voterId}
                    isLast
                  />
                </PreviewSection>

                <PreviewSection title="Personal information">
                  <PreviewRow label="Full name" value={step1Preview.fullName} />
                  <PreviewRow label="First name" value={step1Preview.firstName} />
                  <PreviewRow label="Middle name" value={step1Preview.middleName} />
                  <PreviewRow label="Last name" value={step1Preview.lastName} />
                  <PreviewRow label="Suffix" value={step1Preview.suffix} />
                  <PreviewRow label="Birth date" value={step1Preview.birthDate} />
                  <PreviewRow label="Sex" value={step1Preview.sex} />
                  <PreviewRow
                    label="Barangay (registered)"
                    value={step1Preview.barangay}
                    isLast
                  />
                </PreviewSection>

                <PreviewSection title="Contact information">
                  <PreviewRow label="Mobile number" value={step1Preview.mobile} />
                  <PreviewRow
                    label="Email address"
                    value={step1Preview.email}
                    isLast
                  />
                </PreviewSection>
              </ScrollView>

              <View style={styles.step1Footer}>
                <View style={styles.primaryFooterRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={goRegisterBack}
                    style={styles.backBtn}
                  >
                    <Text style={styles.backBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setAttempted(false);
                      setStep(2);
                    }}
                    style={[styles.nextBtn, styles.primaryBtnFlexible]}
                  >
                    <Text style={styles.nextText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {birthDatePickerOpen && Platform.OS === "android" ? (
            <DateTimePicker
              value={birthDateDraft}
              mode="date"
              display="default"
              minimumDate={BIRTH_DATE_MIN}
              maximumDate={birthDateMax()}
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
                  minimumDate={BIRTH_DATE_MIN}
                  maximumDate={birthDateMax()}
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

          {/* --- Step 2: Address input --- */}
          {step === 2 && (
            <>
              <Text style={styles.title}>Additional Information</Text>
              {attempted && !canNextFromAdditional && <Text style={styles.fillIn}>Fill in the Fields</Text>}

              <View style={{ marginTop: 14 }}>
                <View style={[styles.inputWrapAlt, attempted && !houseUnit.trim() && styles.inputErrorBorder]}>
                  <TextInput
                    value={houseUnit}
                    onChangeText={setHouseUnit}
                    placeholder="House No. / Block / Lot / Unit"
                    placeholderTextColor="#B3B3B3"
                    style={styles.inputAlt}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={{ marginTop: 10 }}>
                <View style={[styles.inputWrapAlt, attempted && !streetLine.trim() && styles.inputErrorBorder]}>
                  <TextInput
                    value={streetLine}
                    onChangeText={setStreetLine}
                    placeholder="Street / Subdivision / Sitio / Purok"
                    placeholderTextColor="#B3B3B3"
                    style={styles.inputAlt}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={{ marginTop: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setBarangayOpen(true)}
                  style={[styles.inputWrap, attempted && !selectedBarangay && styles.inputErrorBorder]}
                >
                  <Text
                    style={[
                      styles.dropdownText,
                      !selectedBarangay && styles.dropdownPlaceholder,
                    ]}
                  >
                    {selectedBarangay?.name || "Barangay"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Modal visible={barangayOpen} transparent animationType="fade" onRequestClose={() => setBarangayOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setBarangayOpen(false)}>
                  <Pressable style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Select Barangay</Text>
                    {barangaysError ? (
                      <View style={styles.modalMessage}>
                        <Text style={styles.error}>{barangaysError}</Text>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => void loadBarangays()}>
                          <Text style={styles.link}>Retry</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <ScrollView style={styles.modalList}>
                        {barangayOptions.map((opt) => (
                          <TouchableOpacity
                            key={opt.id}
                            activeOpacity={0.85}
                            style={styles.modalItem}
                            onPress={() => {
                              setSelectedBarangay(opt);
                              setBarangayOpen(false);
                            }}
                          >
                            <Text style={styles.modalItemText}>{opt.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </Pressable>
                </Pressable>
              </Modal>

              <View style={{ flex: 1 }} />
              <View style={styles.primaryFooterRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={goRegisterBack}
                  style={styles.backBtn}
                >
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onNextAddress}
                  style={[
                    styles.nextBtn,
                    styles.primaryBtnFlexible,
                    !canNextFromAdditional && styles.nextDisabled,
                  ]}
                >
                  <Text style={styles.nextText}>Next</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 7 && (
            <View style={styles.emailVerifyRoot}>
              <View style={styles.emailVerifyTop}>
                <Text style={styles.titleLarge}>Verify your email</Text>
                <Text style={styles.subtitle}>
                  We sent a confirmation link to{" "}
                  <Text style={styles.bold}>{email.trim() || "your email"}</Text>
                </Text>

                <View style={styles.emailVerifyCard}>
                  <EmailVerifyStepRow
                    label="Send verification email"
                    detail={
                      emailSendError
                        ? "Could not send — tap resend below"
                        : emailSentAt
                          ? "Email sent — check inbox and spam"
                          : "Preparing your verification email"
                    }
                    status={
                      emailSendError
                        ? "pending"
                        : emailVerifyUiPhase === "sending"
                          ? "active"
                          : didAttemptInitialVerificationEmail
                            ? "done"
                            : "pending"
                    }
                  />
                  <EmailVerifyStepRow
                    label="Open email and confirm"
                    detail={
                      emailVerifyUiPhase === "checking"
                        ? "Checking whether you confirmed…"
                        : "Tap the link in the email, then return here"
                    }
                    status={
                      emailVerified || emailVerifyUiPhase === "verified" || emailVerifyUiPhase === "saving"
                        ? "done"
                        : emailVerifyUiPhase === "checking"
                          ? "active"
                          : didAttemptInitialVerificationEmail && !emailSendError
                            ? "active"
                            : "pending"
                    }
                  />
                  <EmailVerifyStepRow
                    label="Finish account setup"
                    detail={
                      profileSaving
                        ? "Saving your profile…"
                        : emailVerified
                          ? "Almost done"
                          : "Runs automatically after confirmation"
                    }
                    status={
                      profileSaving
                        ? "active"
                        : emailVerified && !profileError
                          ? "active"
                          : "pending"
                    }
                  />
                </View>

                {emailSendError ? <Text style={styles.error}>{emailSendError}</Text> : null}
                {emailVerifyError ? <Text style={styles.error}>{emailVerifyError}</Text> : null}
                {profileError ? <Text style={styles.error}>{profileError}</Text> : null}

                {profileErrorNeedsRestart ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => void restartRegistration()}
                    style={styles.restartRegistrationBtn}
                  >
                    <Text style={styles.restartRegistrationBtnText}>Restart registration</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.emailVerifyBottom}>
                <Text style={styles.emailVerifyBottomLabel}>Didn’t receive the email?</Text>

                {showEmailResendStatus ? (
                  <View style={styles.resendCooldownWrap}>
                    <Text style={styles.resendCooldownText}>{emailResendStatusLabel}</Text>
                  </View>
                ) : emailCanResend ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={async () => {
                      setIsSendingVerificationEmail(true);
                      setEmailSendError("");
                      const resend = await sendVerificationEmail(email.trim(), mpin || pin);
                      setIsSendingVerificationEmail(false);
                      if (resend.error) {
                        setEmailSendError(mapVerificationEmailSendError(resend.error));
                        if (__DEV__) {
                          console.log("Email resend error:", JSON.stringify(resend.error));
                        }
                        return;
                      }
                      setEmailSendError("");
                      setEmailSentAt(Date.now());
                      setEmailSeconds(EMAIL_RESEND_COOLDOWN_SEC);
                      void runEmailVerificationCheckRef.current?.();
                    }}
                    style={styles.resendBtn}
                  >
                    <Ionicons name="refresh-outline" size={18} color={TEAL} />
                    <Text style={styles.resendBtnText}>Resend verification email</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.emailVerifyInfoBox}>
                  <Text style={styles.infoText}>
                    After you tap the link in your email, return to this app. We’ll detect confirmation
                    automatically — you don’t need to press anything else.
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => void openEmailApp()}
                  style={styles.openMailBtn}
                >
                  <Ionicons name="mail-outline" size={20} color="#fff" />
                  <Text style={styles.openMailBtnText}>Open email app</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.emailVerifyFooter}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={goRegisterBack}
                  disabled={profileSaving}
                  style={[styles.backBtn, profileSaving && styles.backBtnDisabled]}
                >
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* --- Step 3: Valid ID upload --- */}
          {step === 3 && (
            <>
              <Text style={styles.title}>Upload your ID</Text>
              <Text style={styles.subtitle}>
                Any government-issued ID is accepted. We read the text on your ID and check that it matches the name and details you registered with.
              </Text>
              {attempted && !idImageBase64 ? (
                <Text style={styles.fillIn}>Upload your ID photo</Text>
              ) : null}

              <View style={styles.rowTopCompact}>
                <Text style={styles.label}>ID image</Text>
              </View>

              <View
                style={[
                  styles.idUploadCard,
                  attempted && !idImageBase64 && styles.inputErrorBorder,
                ]}
              >
                {idImageUri ? (
                  <>
                    <View style={styles.idPreviewWrap}>
                      <Image source={{ uri: idImageUri }} style={styles.idPreview} resizeMode="contain" />
                    </View>
                    <View style={styles.idChangePhotoRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={pickIdFromGallery}
                        style={styles.idChangePhotoHalf}
                      >
                        <Ionicons name="images-outline" size={18} color={TEAL} />
                        <Text style={styles.idChangePhotoHalfText}>Gallery</Text>
                      </TouchableOpacity>
                      <View style={styles.idChangePhotoDivider} />
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={takeIdPhoto}
                        style={styles.idChangePhotoHalf}
                      >
                        <Ionicons name="camera-outline" size={18} color={TEAL} />
                        <Text style={styles.idChangePhotoHalfText}>Camera</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={styles.idUploadEmpty}>
                    <View style={styles.idUploadIconCircle}>
                      <Ionicons name="id-card-outline" size={28} color={TEAL} />
                    </View>
                    <Text style={styles.idUploadTitle}>Add your ID photo</Text>
                    <Text style={styles.idUploadSubtitle}>
                      Any clear ID photo · full card visible · no glare
                    </Text>
                    <View style={styles.idSourceRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={pickIdFromGallery}
                        style={styles.idSourceBtnOutline}
                      >
                        <Ionicons name="images-outline" size={20} color={TEAL} />
                        <Text style={styles.idSourceBtnOutlineText}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={takeIdPhoto}
                        style={styles.idSourceBtnSolid}
                      >
                        <Ionicons name="camera-outline" size={20} color="#fff" />
                        <Text style={styles.idSourceBtnSolidText}>Camera</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              <View style={[styles.infoBox, styles.idInfoBox]}>
                <Text style={styles.infoText}>
                  We match your first and last name, plus birth date or voter ID when visible. Minor spelling differences are OK.
                </Text>
              </View>

              {idVerifyChecks.length > 0 ? (
                <View style={styles.idVerifyResultsCard}>
                  <Text style={styles.idVerifyResultsTitle}>ID check results</Text>
                  {idVerifyChecks.map((check) => (
                    <View key={check.field} style={styles.idVerifyResultRow}>
                      <Ionicons
                        name={check.matched ? "checkmark-circle" : "close-circle"}
                        size={18}
                        color={check.matched ? "#2E7D32" : "#C62828"}
                      />
                      <View style={styles.idVerifyResultTextWrap}>
                        <Text style={styles.idVerifyResultLabel}>{check.label}</Text>
                        {check.expected ? (
                          <Text style={styles.idVerifyResultExpected}>{check.expected}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {idVerifyError ? <Text style={styles.error}>{idVerifyError}</Text> : null}

              <View style={{ flex: 1 }} />
              <View style={styles.primaryFooterRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={goRegisterBack}
                  style={styles.backBtn}
                >
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onNextIdUpload}
                  disabled={!idImageBase64 || idVerifying}
                  style={[
                    styles.nextBtn,
                    styles.primaryBtnFlexible,
                    (!idImageBase64 || idVerifying) && styles.nextDisabled,
                  ]}
                >
                  <Text style={styles.nextText}>
                    {idVerifying ? "Verifying ID…" : "Verify ID & continue"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* --- Step 4: Live face verification (ID match + liveness) --- */}
          {step === 4 && (
            <>
              <Text style={styles.title}>Verify your face</Text>
              <Text style={styles.subtitle}>
                We capture 4 live photos at different angles to match your face to your ID.
              </Text>

              <View style={styles.livenessTipsCard}>
                <Text style={styles.livenessTipsTitle}>How it works</Text>
                <Text style={styles.livenessTipsLine}>• Photo 1 — look straight at the camera</Text>
                <Text style={styles.livenessTipsLine}>• Photo 2 — turn your head left</Text>
                <Text style={styles.livenessTipsLine}>• Photo 3 — turn your head right</Text>
                <Text style={styles.livenessTipsLine}>• Photo 4 — look straight and blink once</Text>
                <Text style={styles.livenessTipsLine}>• Each photo starts after a 5-second countdown</Text>
              </View>

              {!camPermission?.granted ? (
                <>
                  <View style={styles.cameraPermissionCard}>
                    <View style={styles.cameraPermissionIconWrap}>
                      <Ionicons name="camera-outline" size={36} color={TEAL} />
                    </View>
                    <Text style={styles.cameraPermissionTitle}>Camera access</Text>
                    <Text style={styles.cameraPermissionBody}>
                      Apoyo uses the camera only for this one-time identity check. You can change this anytime in your device settings.
                    </Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <View style={styles.primaryFooterRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={goRegisterBack}
                      style={styles.backBtn}
                    >
                      <Text style={styles.backBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => void requestCamPermission()}
                      style={[styles.nextBtn, styles.primaryBtnFlexible]}
                    >
                      <Text style={styles.nextText}>Allow camera access</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.rowTopCompact}>
                    <Text style={styles.label}>Live preview</Text>
                  </View>
                  <View style={styles.cameraFrame}>
                    <CameraView
                      ref={cameraRef}
                      facing="front"
                      style={StyleSheet.absoluteFill}
                      onCameraReady={() => setCameraReady(true)}
                    />
                    {!cameraReady ? (
                      <View style={styles.cameraLoadingOverlay}>
                        <ActivityIndicator size="large" color="#fff" />
                        <Text style={styles.cameraOverlayText}>Starting camera…</Text>
                      </View>
                    ) : null}
                    {facialVerifying ? (
                      <View style={styles.cameraOverlay}>
                        {captureCountdown !== null ? (
                          <Text style={styles.captureCountdownText}>{captureCountdown}</Text>
                        ) : (
                          <ActivityIndicator size="large" color="#fff" />
                        )}
                        <Text style={styles.cameraOverlayText}>
                          {captureCountdown !== null
                            ? `Get ready — photo ${capturePoseIndex} of ${FACIAL_CAPTURE_STEPS.length}`
                            : livenessCaptureHint ||
                              (livenessPhase === "capturing"
                                ? "Capturing live frames…"
                                : "Verifying face & liveness… (may take up to a minute)")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.helper}>
                    {livenessPhase === "capturing"
                      ? livenessCaptureHint ||
                        `Follow the prompts — ${FACIAL_CAPTURE_STEPS.length} photos, ${FACIAL_CAPTURE_COUNTDOWN_SEC}s apart.`
                      : "Tap Start when your face is centered in the preview."}
                  </Text>
                  {facialError ? <Text style={styles.error}>{facialError}</Text> : null}
                  <View style={{ flex: 1 }} />
                  <View style={styles.primaryFooterRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={goRegisterBack}
                      disabled={facialVerifying}
                      style={[styles.backBtn, facialVerifying && styles.backBtnDisabled]}
                    >
                      <Text style={styles.backBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => void runFacialVerification()}
                      disabled={facialVerifying || !cameraReady}
                      style={[
                        styles.nextBtn,
                        styles.primaryBtnFlexible,
                        (facialVerifying || !cameraReady) && styles.nextDisabled,
                      ]}
                    >
                      <Text style={styles.nextText}>
                        {facialVerifying
                          ? livenessPhase === "capturing"
                            ? captureCountdown !== null
                              ? `Starting in ${captureCountdown}…`
                              : `Photo ${capturePoseIndex}/${FACIAL_CAPTURE_STEPS.length}…`
                            : "Verifying…"
                          : "Start face verification"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}

          {/* --- Step 5: Create MPIN --- */}
          {step === 5 && (
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
              <View style={styles.primaryFooterRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={goRegisterBack}
                  style={styles.backBtn}
                >
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onNextPin}
                  disabled={!canNextFromPin}
                  style={[
                    styles.nextBtn,
                    styles.primaryBtnFlexible,
                    !canNextFromPin && styles.nextDisabled,
                  ]}
                >
                  <Text style={styles.nextText}>Next</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* --- Step 6: Re-enter MPIN --- */}
          {step === 6 && (
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
              <View style={styles.primaryFooterRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={goRegisterBack}
                  style={styles.backBtn}
                >
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                {confirmError ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={onRetryPin}
                    style={[styles.nextBtn, styles.primaryBtnFlexible]}
                  >
                    <Text style={styles.nextText}>Re-enter MPIN</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={onConfirmPin}
                    disabled={confirmPin.length !== 6}
                    style={[
                      styles.nextBtn,
                      styles.primaryBtnFlexible,
                      confirmPin.length !== 6 && styles.nextDisabled,
                    ]}
                  >
                    <Text style={styles.nextText}>Next</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* --- Step 8: Success --- */}
          {step === 8 && (
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
  container: { flex: 1, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16 },

  progressRow: { flexDirection: "row", gap: 1, marginTop: 10, marginBottom: 10 },
  progressSeg: { flex: 1, height: 6, borderRadius: 999, backgroundColor: "#D9D9D9" },
  progressActive: { backgroundColor: TEAL },

  rowTopCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    marginBottom: 10,
  },

  idUploadCard: {
    marginTop: 0,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  idUploadEmpty: {
    minHeight: 240,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  idSourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 18,
    paddingHorizontal: 4,
    width: "100%",
  },
  idSourceBtnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TEAL,
    backgroundColor: "#fff",
  },
  idSourceBtnOutlineText: {
    color: TEAL,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
  },
  idSourceBtnSolid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: TEAL,
  },
  idSourceBtnSolidText: {
    color: "#fff",
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
  },
  idUploadIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(0,142,138,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  idUploadTitle: {
    color: DARK,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  idUploadSubtitle: {
    marginTop: 8,
    color: SUB,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  idPreviewWrap: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: "#F7F7F7",
    overflow: "hidden",
    position: "relative",
  },
  idPreview: {
    ...StyleSheet.absoluteFillObject,
  },
  idChangePhotoRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: "#FAFAFA",
  },
  idChangePhotoHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  idChangePhotoHalfText: {
    color: TEAL,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
  },
  idChangePhotoDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: BORDER,
    marginVertical: 10,
  },
  idInfoBox: {
    marginTop: 14,
    marginBottom: 0,
  },
  idVerifyResultsCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#FAFAFA",
    gap: 10,
  },
  idVerifyResultsTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#1A1A1A",
  },
  idVerifyResultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  idVerifyResultTextWrap: {
    flex: 1,
    gap: 2,
  },
  idVerifyResultLabel: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: "#1A1A1A",
  },
  idVerifyResultExpected: {
    fontFamily: FONT,
    fontSize: 12,
    color: "#666",
  },
  captureCountdownText: {
    color: "#fff",
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 56,
    lineHeight: 64,
    marginBottom: 8,
  },
  livenessTipsCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  livenessTipsTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    color: TEAL,
    marginBottom: 4,
  },
  livenessTipsLine: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 13,
    lineHeight: 19,
    color: SUB,
  },

  cameraPermissionCard: {
    marginTop: 18,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  cameraPermissionIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: "rgba(0,142,138,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  cameraPermissionTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 17,
    color: DARK,
    marginBottom: 8,
    textAlign: "center",
  },
  cameraPermissionBody: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 14,
    color: SUB,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 6,
  },

  cameraFrame: {
    marginTop: 10,
    height: Math.min(340, Math.round(SCREEN_W * 1.05)),
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
    borderColor: "rgba(0,142,138,0.35)",
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraOverlayText: {
    color: "#fff",
    marginTop: 12,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 15,
  },

  title: { marginTop: 20, fontSize: 34, color: DARK, fontFamily: FONT, fontWeight: "600", marginBottom: 6 },
  step0Scroll: { flex: 1 },
  step0ScrollContent: { paddingBottom: 8, flexGrow: 1 },
  step0Gap: { marginTop: 10 },
  step0InputWrap: { height: 48 },
  step0CheckRow: { marginTop: 6 },
  step0Title: { marginTop: 4, marginBottom: 10, fontSize: 30, lineHeight: 34 },
  step0TermsBox: { marginTop: 12 },
  voterReminderText: { color: LIGHT_RED },
  step0TermsFollowUp: { marginTop: 8 },
  step0CreateBtn: { marginTop: 14, height: 50 },
  step0Divider: { marginTop: 14 },
  step0BottomText: { marginTop: 12, marginBottom: 8 },
  step0LoginBtn: { height: 50, marginBottom: 4 },
  step0Top: { flexGrow: 1 },
  step0Bottom: { marginTop: "auto" },
  step1Root: { flex: 1 },
  step1Header: {
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E6E6",
  },
  step1HeaderTitle: {
    marginTop: 0,
    marginBottom: 0,
  },
  step1Scroll: { flex: 1 },
  step1ScrollContent: { paddingTop: 14, paddingBottom: 12 },
  step1Subtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: SUB,
    fontFamily: FONT,
    fontWeight: "500",
  },
  step1InfoBox: { marginTop: 16, marginBottom: 4 },
  step1Footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E6E6E6",
  },
  previewSection: { marginTop: 20 },
  previewSectionTitle: {
    marginBottom: 10,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: TEAL,
  },
  previewCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    overflow: "hidden",
  },
  previewRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  previewRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  previewRowLabel: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: SUB,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  previewRowValue: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 16,
    lineHeight: 22,
    color: DARK,
  },
  step0HeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  titleLarge: { marginTop: 36, fontSize: 34, color: DARK, fontFamily: FONT, fontWeight: "700" },
  titleNotif: { marginTop: 6, fontSize: 26, color: DARK, fontFamily: FONT, fontWeight: "700" },

  fillIn: { color: RED, fontFamily: FONT, fontWeight: "500", marginBottom: 10 },
  fillInInline: { color: RED, fontFamily: FONT, fontWeight: "500", marginBottom: 10, textAlign: "right" },

  row: { flexDirection: "row", gap: 12 },

  inputWrap: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, height: 52, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#fff" },
  inputWrapWithInlineError: { paddingRight: 168 },
  inputWrapAlt: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, height: 54, justifyContent: "center", paddingHorizontal: 14, backgroundColor: "#fff" },
  inputWrapAltDisabled: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    height: 54,
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#F5F5F5",
  },
  inputWrapAltDisabledPreview: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F5F5F5",
  },
  inputWrapMobile: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, height: 54, flexDirection: "row", alignItems: "center", overflow: "hidden", backgroundColor: "#fff" },
  inputErrorBorder: { borderColor: RED },

  inputFull: { fontSize: 16, color: DARK, fontFamily: FONT, fontWeight: "500", paddingVertical: 0 },
  inputFullWithInlineError: { paddingRight: 8 },
  inputAlt: { fontSize: 16, color: DARK, fontFamily: FONT, fontWeight: "600", paddingVertical: 0 },
  inputAltDisabled: { fontSize: 14, color: SUB, fontFamily: FONT, fontWeight: "500", lineHeight: 19 },
  inputMobile: { flex: 1, fontSize: 16, paddingRight: 14, color: DARK, fontFamily: FONT, fontWeight: "500" },
  inputMobileWithInlineError: { paddingRight: 6 },

  prefix: { width: 70, height: "100%", alignItems: "center", justifyContent: "center" },
  prefixText: { fontSize: 15, color: "#B3B3B3", fontFamily: FONT, fontWeight: "500" },

  dropdownText: { fontSize: 16, color: DARK, fontFamily: FONT, fontWeight: "500" },
  dropdownPlaceholder: { color: "#B3B3B3" },

  checkRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  checkboxChecked: { borderColor: TEAL },
  checkboxInner: { width: 12, height: 12, borderRadius: 2, backgroundColor: TEAL },
  checkText: { color: SUB, fontFamily: FONT, fontWeight: "500", fontSize: 13 },
  fieldOptionalTip: {
    marginTop: 6,
    fontSize: 12,
    color: SUB,
    fontFamily: FONT,
    fontWeight: "500",
    lineHeight: 17,
  },

  error: { marginTop: 8, color: RED, fontFamily: FONT, fontWeight: "500" },
  errorInline: {
    position: "absolute",
    right: 12,
    bottom: 6,
    maxWidth: 156,
    color: RED,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 15,
    textAlign: "right",
  },

  termsBox: { marginTop: 10, alignItems: "center" },
  termsText: { color: SUB, fontFamily: FONT, fontWeight: "500", fontSize: 13, textAlign: "center" },
  termsBold: { color: SUB, fontFamily: FONT, fontWeight: "600" },
  termsLinksRow: { flexDirection: "row", alignItems: "center", marginTop: 2.5, flexWrap: "wrap", justifyContent: "center" },
  link: { color: TEAL, fontFamily: FONT, fontWeight: "600", fontSize: 13 },

  primaryFooterRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  backBtn: {
    width: Math.max(76, Math.min(92, Math.round(SCREEN_W * 0.21))),
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  backBtnDisabled: {
    opacity: 0.45,
  },
  backBtnText: {
    color: DARK,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
  },
  primaryBtnFlexible: {
    flex: 1,
    minWidth: 0,
  },

  createBtn: { height: 56, borderRadius: 12, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: FONT, fontWeight: "600" },

  divider: { height: 1, backgroundColor: "#E6E6E6", marginTop: 22 },
  bottomText: { marginTop: 20, textAlign: "center", color: "#7D7D7D", fontFamily: FONT, fontWeight: "500", marginBottom: 12 },
  loginOutlineBtn: { height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: TEAL, alignItems: "center", justifyContent: "center" },
  loginOutlineText: { color: TEAL, fontSize: 16, fontFamily: FONT, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", paddingHorizontal: 22 },
  modalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  modalList: { maxHeight: 360 },
  modalMessage: { alignItems: "center", paddingVertical: 20, gap: 12 },
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

  emailVerifyRoot: {
    flex: 1,
  },
  emailVerifyTop: {
    flex: 1,
  },
  emailVerifyBottom: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E6E6E6",
  },
  emailVerifyBottomLabel: {
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    color: DARK,
    fontSize: 15,
    marginBottom: 12,
  },
  resendBtn: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TEAL,
    backgroundColor: "rgba(0,142,138,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  resendBtnDisabled: {
    borderColor: BORDER,
    backgroundColor: "#F5F5F5",
  },
  resendBtnText: {
    color: TEAL,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
  },
  resendBtnTextDisabled: {
    color: SUB,
    fontWeight: "600",
  },
  resendCooldownWrap: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  resendCooldownText: {
    textAlign: "center",
    color: SUB,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 15,
    lineHeight: 21,
  },
  emailVerifyInfoBox: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: TEAL,
    backgroundColor: "rgba(0,142,138,0.12)",
    borderRadius: 10,
    padding: 14,
  },
  emailVerifyFooter: {
    paddingTop: 12,
  },

  draftHydrateRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  draftHydrateText: {
    color: SUB,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 15,
  },
  emailVerifyCard: {
    marginTop: 22,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  emailVerifyStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  emailVerifyStepSpinner: {
    width: 22,
    height: 22,
  },
  emailVerifyStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  emailVerifyStepLabel: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 15,
    color: DARK,
    lineHeight: 20,
  },
  emailVerifyStepLabelActive: {
    color: TEAL,
  },
  emailVerifyStepLabelDone: {
    color: TEAL,
  },
  emailVerifyStepDetail: {
    marginTop: 4,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 13,
    lineHeight: 18,
    color: SUB,
  },
  openMailBtn: {
    marginTop: 14,
    height: 50,
    borderRadius: 12,
    backgroundColor: TEAL,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  openMailBtnText: {
    color: "#fff",
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 15,
  },
  restartRegistrationBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  restartRegistrationBtnText: {
    color: TEAL,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
  },

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
