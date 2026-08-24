import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { STORAGE_KEYS } from "@/AppCore/ClientStorageKeys";
import { displayUserBarangay } from "@/AppCore/Barangays";
import { formatRegisteredVoterId } from "@/AppCore/RegisteredVoterId";
import { supabase } from "@/AppCore/SupabaseClient";
import {
  ACCOUNT_FONT,
  ACCOUNT_MUTED,
  ACCOUNT_TEAL,
  ACCOUNT_TEXT,
  AccountField,
  AccountSectionLabel,
  AccountSubpage,
} from "@/components/AccountUi";

const PROFILE_PNG = require("../../assets/images/ProfileIcon.png");
const EMPTY = "—";

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

export default function ManageAccount() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.userCache);
      if (cached) {
        const parsed = JSON.parse(cached) as UserProfile;
        if (parsed?.email || parsed?.first_name) {
          setProfile(parsed);
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

      setProfile(data);

      const cachedRaw = await AsyncStorage.getItem(STORAGE_KEYS.userCache);
      const previous = cachedRaw ? JSON.parse(cachedRaw) : {};
      await AsyncStorage.setItem(
        STORAGE_KEYS.userCache,
        JSON.stringify({ ...previous, ...data })
      );
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fullName = profile ? formatFullName(profile) : "";

  return (
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
            <Text style={styles.fullName}>{fullName || EMPTY}</Text>
            <Text style={styles.emailText}>{displayText(profile.email)}</Text>
            <View style={styles.readOnlyPill}>
              <Ionicons name="eye-outline" size={13} color={ACCOUNT_TEAL} />
              <Text style={styles.readOnlyText}>Read only</Text>
            </View>
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
          <AccountField label="Phone number" value={displayText(profile.contact_number)} />
          <AccountField label="VIN" value={formatVin(profile.voter_id_number)} />

          <AccountSectionLabel>RESIDENCE</AccountSectionLabel>
          <AccountField label="Barangay" value={displayText(displayUserBarangay(profile))} />
          <AccountField label="Address" value={displayText(profile.address)} />

          <AccountSectionLabel>ACCOUNT</AccountSectionLabel>
          <AccountField
            label="Registered"
            value={formatRegisteredDate(profile.created_at)}
          />
        </>
      ) : null}
    </AccountSubpage>
  );
}

const styles = StyleSheet.create({
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
  fullName: {
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
  readOnlyPill: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: ACCOUNT_TEAL,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  readOnlyText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_TEAL,
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
