import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  buildApplicantContactPatch,
  composeResidenceAddress,
  formatPhMobileGroups,
  localMobileDigits,
  mapApplicantContactSaveError,
  mergeCachedUserProfile,
  parseResidenceAddress,
  phoneValidationMessage,
  residenceValidationMessage,
} from "@/AppCore/ApplicantProfileContact";
import { STORAGE_KEYS } from "@/AppCore/ClientStorageKeys";
import { displayUserBarangay } from "@/AppCore/Barangays";
import { formatRegisteredVoterId } from "@/AppCore/RegisteredVoterId";
import { supabase } from "@/AppCore/SupabaseClient";
import { useSingleFlight } from "@/AppCore/UseInteractionGuard";
import {
  ACCOUNT_BORDER,
  ACCOUNT_FONT,
  ACCOUNT_MUTED,
  ACCOUNT_SECTION,
  ACCOUNT_TEAL,
  ACCOUNT_TEXT,
  AccountField,
  AccountPillButton,
  AccountSectionLabel,
  AccountSubpage,
} from "@/components/AccountUi";

const PROFILE_PNG = require("../../assets/images/ProfileIcon.png");
const EMPTY = "—";
const DANGER = "#E45454";

type UserProfile = {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  sex: string | null;
  birth_date: string | null;
  email: string | null;
  contact_number: string | null;
  address: string | null;
  barangay: string | null;
  voter_id_number: string | null;
  avatar_url: string | null;
  created_at: string | null;
  registered_voter_id: string | null;
};

function displayText(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text || EMPTY;
}

function formatFullName(row: UserProfile): string {
  const parts = [row.first_name, row.middle_name, row.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  const suffix = (row.suffix ?? "").trim();
  return suffix ? `${parts.join(" ")} ${suffix}`.trim() : parts.join(" ");
}

function formatSex(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return EMPTY;
  if (raw === "M" || /^male$/i.test(raw)) return "Male";
  if (raw === "F" || /^female$/i.test(raw)) return "Female";
  return raw;
}

function formatBirthDate(value: string | null | undefined): string {
  const raw = (value ?? "").trim().slice(0, 10);
  if (!raw) return EMPTY;
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatRegisteredDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatVin(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return EMPTY;
  return formatRegisteredVoterId(raw);
}

function seedContactForm(row: UserProfile) {
  const parsed = parseResidenceAddress(row.address, displayUserBarangay(row));
  return {
    mobile: localMobileDigits(row.contact_number),
    houseUnit: parsed.houseUnit,
    streetLine: parsed.streetLine,
  };
}

export default function ManageAccount() {
  const { inFlight, run } = useSingleFlight();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [mobile, setMobile] = useState("");
  const [houseUnit, setHouseUnit] = useState("");
  const [streetLine, setStreetLine] = useState("");
  const [touched, setTouched] = useState({
    phone: false,
    house: false,
    street: false,
  });
  const [showIdentityTip, setShowIdentityTip] = useState(false);

  const applyProfile = useCallback((row: UserProfile) => {
    setProfile(row);
    const seeded = seedContactForm(row);
    setMobile(seeded.mobile);
    setHouseUnit(seeded.houseUnit);
    setStreetLine(seeded.streetLine);
    setTouched({ phone: false, house: false, street: false });
    setSaveError("");
    setShowIdentityTip(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.userCache);
      if (cached) {
        const parsed = JSON.parse(cached) as UserProfile;
        if (parsed?.email || parsed?.first_name) {
          applyProfile(parsed);
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data, error: queryError } = await supabase
        .from("users")
        .select(
          "first_name, middle_name, last_name, suffix, sex, birth_date, email, contact_number, address, barangay, voter_id_number, avatar_url, created_at, registered_voter_id"
        )
        .eq("id", user.id)
        .single();

      if (queryError) throw queryError;
      if (!data) throw new Error("Profile not found");

      applyProfile(data);
      await mergeCachedUserProfile(data);
    } catch (err) {
      if (__DEV__) {
        console.log("ManageAccount load error:", err);
      }
      setError(
        "Unable to load your account details. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showIdentityTip) return undefined;
    const timer = setTimeout(() => setShowIdentityTip(false), 4000);
    return () => clearTimeout(timer);
  }, [showIdentityTip]);

  const barangayName = profile ? displayUserBarangay(profile) : "";
  const composedPreview = composeResidenceAddress({
    houseUnit,
    streetLine,
    barangay: barangayName,
  });

  const patchResult = useMemo(
    () =>
      buildApplicantContactPatch({
        mobileDigits: mobile,
        houseUnit,
        streetLine,
        barangay: barangayName,
        current: profile
          ? {
              contact_number: profile.contact_number,
              address: profile.address,
            }
          : undefined,
      }),
    [mobile, houseUnit, streetLine, barangayName, profile]
  );

  const phoneError = phoneValidationMessage(mobile);
  const houseStreetError = residenceValidationMessage(houseUnit, streetLine);
  const showPhoneErr = touched.phone && Boolean(phoneError);
  const showHouseErr = touched.house && !houseUnit.trim();
  const showStreetErr = touched.street && !streetLine.trim();
  const fullName = profile ? formatFullName(profile) : "";

  const canSave =
    Boolean(profile) && patchResult.ok && !patchResult.unchanged && !inFlight;

  const persistContact = useCallback(async () => {
    if (!profile || !patchResult.ok || patchResult.unchanged) return;
    setSaveError("");
    await run(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data, error: updateError } = await supabase
        .from("users")
        .update(patchResult.patch)
        .eq("id", user.id)
        .select(
          "first_name, middle_name, last_name, suffix, sex, birth_date, email, contact_number, address, barangay, voter_id_number, avatar_url, created_at, registered_voter_id"
        )
        .single();

      if (updateError) throw updateError;

      const next = data ?? { ...profile, ...patchResult.patch };
      applyProfile(next);
      await mergeCachedUserProfile(next);
    });
  }, [applyProfile, patchResult, profile, run]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AccountSubpage
        title="Manage account"
        scroll
        contentContainerStyle={styles.pagePad}
      >
        {loading && !profile ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={ACCOUNT_TEAL} size="large" />
            <Text style={styles.stateBody}>Loading your account…</Text>
          </View>
        ) : error && !profile ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateTitle}>Could not load account</Text>
            <Text style={styles.stateBody}>{error}</Text>
            <Pressable
              onPress={() => void load()}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : profile ? (
          <>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
                <Pressable onPress={() => void load()}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.hero}>
              <View style={styles.avatarOuter}>
                <View style={styles.avatarCircle}>
                  {profile.avatar_url ? (
                    <ExpoImage
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatarFull}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={profile.avatar_url}
                    />
                  ) : (
                    <Image
                      source={PROFILE_PNG}
                      style={styles.avatarImg}
                      resizeMode="contain"
                    />
                  )}
                </View>
              </View>
              <View style={styles.nameRow}>
                <Text style={styles.fullName}>{fullName || EMPTY}</Text>
                <Pressable
                  onPress={() => setShowIdentityTip((open) => !open)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Why name and VIN cannot be edited"
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={ACCOUNT_MUTED}
                  />
                </Pressable>
              </View>
              <Text style={styles.emailText}>{displayText(profile.email)}</Text>
              {showIdentityTip ? (
                <View style={styles.tooltip} accessibilityLiveRegion="polite">
                  <Text style={styles.tooltipText}>
                    Name and VIN come from your voter record.
                  </Text>
                </View>
              ) : null}
            </View>

            <AccountSectionLabel>IDENTITY</AccountSectionLabel>
            <AccountField label="First name" value={displayText(profile.first_name)} />
            <AccountField label="Middle name" value={displayText(profile.middle_name)} />
            <AccountField label="Last name" value={displayText(profile.last_name)} />
            <AccountField label="Suffix" value={displayText(profile.suffix)} />
            <AccountField label="Sex" value={formatSex(profile.sex)} />
            <AccountField label="Date of birth" value={formatBirthDate(profile.birth_date)} />

            <AccountSectionLabel>CONTACT</AccountSectionLabel>
            <AccountField label="Email" value={displayText(profile.email)} />
            <View style={styles.field}>
              <View style={styles.fieldDivider} />
              <Text style={styles.fieldLabel}>Phone number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.ccBox}>
                  <Text style={styles.ccText}>+63</Text>
                </View>
                <TextInput
                  value={formatPhMobileGroups(mobile)}
                  onChangeText={(text) => setMobile(localMobileDigits(text))}
                  onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                  keyboardType="number-pad"
                  maxLength={12}
                  placeholder="9XX XXX XXXX"
                  placeholderTextColor={ACCOUNT_SECTION}
                  style={[styles.phoneInput, showPhoneErr && styles.inputError]}
                  accessibilityLabel="Phone number"
                />
              </View>
              {showPhoneErr ? (
                <Text style={styles.fieldError}>{phoneError}</Text>
              ) : (
                <Text style={styles.fieldHint}>
                  This is the number the office uses to reach you.
                </Text>
              )}
            </View>
            <AccountField label="VIN" value={formatVin(profile.voter_id_number)} />

            <AccountSectionLabel>RESIDENCE</AccountSectionLabel>
            <AccountField label="Barangay" value={displayText(barangayName)} />
            <View style={styles.field}>
              <View style={styles.fieldDivider} />
              <Text style={styles.fieldLabel}>House no. / block / lot / unit</Text>
              <TextInput
                value={houseUnit}
                onChangeText={setHouseUnit}
                onBlur={() => setTouched((prev) => ({ ...prev, house: true }))}
                autoCapitalize="words"
                placeholder="House No. / Block / Lot / Unit"
                placeholderTextColor={ACCOUNT_SECTION}
                style={[styles.textInput, showHouseErr && styles.inputError]}
                accessibilityLabel="House number, block, lot, or unit"
              />
              {showHouseErr ? (
                <Text style={styles.fieldError}>
                  {houseStreetError ?? "Enter your house no. / block / lot / unit."}
                </Text>
              ) : null}
            </View>
            <View style={styles.field}>
              <View style={styles.fieldDivider} />
              <Text style={styles.fieldLabel}>Street / subdivision / sitio / purok</Text>
              <TextInput
                value={streetLine}
                onChangeText={setStreetLine}
                onBlur={() => setTouched((prev) => ({ ...prev, street: true }))}
                autoCapitalize="words"
                placeholder="Street / Subdivision / Sitio / Purok"
                placeholderTextColor={ACCOUNT_SECTION}
                style={[styles.textInput, showStreetErr && styles.inputError]}
                accessibilityLabel="Street, subdivision, sitio, or purok"
              />
              {showStreetErr ? (
                <Text style={styles.fieldError}>
                  {houseStreetError ?? "Enter your street / subdivision / sitio / purok."}
                </Text>
              ) : null}
            </View>
            <AccountField
              label="Address"
              value={displayText(composedPreview || profile.address)}
            />

            {saveError ? (
              <Text style={styles.saveError}>{saveError}</Text>
            ) : null}

            <View style={styles.saveRow}>
              <AccountPillButton
                label={inFlight ? "Saving…" : "Save changes"}
                block
                disabled={!canSave}
                onPress={() => {
                  void persistContact().catch((err) => {
                    setSaveError(mapApplicantContactSaveError(err));
                  });
                }}
              />
            </View>
          </>
        ) : null}
      </AccountSubpage>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FFFFFF" },
  pagePad: {
    paddingTop: 8,
    paddingBottom: 48,
  },
  hero: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 6,
  },
  avatarOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(11,143,139,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarCircle: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "rgba(11,143,139,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: 56,
    height: 56,
  },
  avatarFull: {
    width: 94,
    height: 94,
    borderRadius: 47,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 20,
  },
  fullName: {
    flexShrink: 1,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 18,
    color: ACCOUNT_TEXT,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  emailText: {
    marginTop: 6,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "400",
    fontSize: 14,
    color: ACCOUNT_MUTED,
    textAlign: "center",
  },
  tooltip: {
    marginTop: 10,
    maxWidth: 260,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCOUNT_BORDER,
    backgroundColor: "#F7FBFB",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tooltipText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 18,
    color: ACCOUNT_MUTED,
    textAlign: "center",
  },
  field: { paddingHorizontal: 4 },
  fieldDivider: {
    height: 1,
    backgroundColor: ACCOUNT_BORDER,
    marginBottom: 12,
  },
  fieldLabel: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "400",
    fontSize: 14,
    color: ACCOUNT_SECTION,
    marginBottom: 6,
  },
  fieldHint: {
    marginTop: 6,
    marginBottom: 18,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "400",
    fontSize: 14,
    color: ACCOUNT_MUTED,
  },
  fieldError: {
    marginTop: 6,
    marginBottom: 18,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    color: DANGER,
  },
  phoneRow: {
    flexDirection: "row",
    gap: 10,
  },
  ccBox: {
    minWidth: 64,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCOUNT_TEAL,
    backgroundColor: "#F7FBFB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ccText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 14,
    color: ACCOUNT_TEAL,
  },
  phoneInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCOUNT_TEAL,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_TEXT,
  },
  textInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCOUNT_TEAL,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_TEXT,
    marginBottom: 18,
  },
  inputError: {
    borderColor: DANGER,
  },
  saveError: {
    marginTop: 8,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    color: DANGER,
    textAlign: "center",
  },
  saveRow: {
    marginTop: 12,
  },
  stateWrap: {
    paddingTop: 48,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  stateTitle: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 16,
    color: ACCOUNT_TEXT,
    textAlign: "center",
  },
  stateBody: {
    marginTop: 8,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
    color: ACCOUNT_MUTED,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 16,
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: ACCOUNT_TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: ACCOUNT_TEAL,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 14,
  },
  errorBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6EEEE",
    backgroundColor: "#F7FBFB",
    gap: 8,
  },
  errorBannerText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    color: ACCOUNT_MUTED,
  },
});
