import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NAV_TOTAL_HEIGHT } from "../../components/BottomNavBar";
import { ROUTES } from "@/AppCore/AppRoutePaths";
import { signOutLocalSession } from "@/AppCore/AppLogout";
import { formatRegisteredVoterId } from "@/AppCore/RegisteredVoterId";
import { supabase } from "@/AppCore/SupabaseClient";
import {
  ACCOUNT_FONT,
  ACCOUNT_MUTED,
  ACCOUNT_TEAL,
  ACCOUNT_TEXT,
  AccountConfirmModal,
  AccountGradient,
  AccountMenuCard,
  AccountSectionLabel,
  AccountSubpage,
} from "@/components/AccountUi";

const TEAL = ACCOUNT_TEAL;
const TEXT_DARK = ACCOUNT_TEXT;
const MUTED = ACCOUNT_MUTED;
const FONT = ACCOUNT_FONT;

const CACHE_USER = "apoyo_user_cache";

function formatUserFullName(row: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
}): string {
  const parts = [row.first_name, row.middle_name, row.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  const suffix = (row.suffix ?? "").trim();
  return suffix ? `${parts.join(" ")} ${suffix}`.trim() : parts.join(" ");
}

function formatVin(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return formatRegisteredVoterId(raw);
}

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  onPress?: () => void;
};

export default function Account() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vin, setVin] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showingSettings, setShowingSettings] = useState(false);

  const handleLogout = async () => {
    setShowLogoutModal(false);
    setLoggingOut(true);

    setTimeout(async () => {
      await signOutLocalSession();
      setLoggingOut(false);
      router.replace(ROUTES.login);
    }, 1000);
  };

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android" || !showingSettings) return undefined;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        setShowingSettings(false);
        return true;
      });
      return () => sub.remove();
    }, [showingSettings])
  );

  useEffect(() => {
    (async () => {
      // Load from cache first (instant)
      const cached = await AsyncStorage.getItem(CACHE_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cachedName = formatUserFullName(parsed);
        if (cachedName) setName(cachedName);
        else if (parsed.first_name) setName(parsed.first_name);
        if (parsed.contact_number) setPhone(parsed.contact_number);
        if (parsed.email) setEmail(parsed.email);
        const cachedVin = formatVin(parsed.voter_id_number);
        if (cachedVin) setVin(cachedVin);
        if (parsed.avatar_url) {
          setAvatarUrl(parsed.avatar_url);
          // Prefetch image into memory for instant display
          ExpoImage.prefetch(parsed.avatar_url);
        }
      }

      // Fetch fresh data from Supabase in background
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("users")
          .select("first_name, middle_name, last_name, suffix, contact_number, email, avatar_url, voter_id_number, barangay")
          .eq("id", user.id)
          .single();
        
        if (data) {
          const fullName = formatUserFullName(data);
          if (fullName) setName(fullName);
          if (data.contact_number) setPhone(data.contact_number);
          if (data.email) setEmail(data.email);
          setVin(formatVin(data.voter_id_number));
          if (data.avatar_url) {
            setAvatarUrl(data.avatar_url);
            // Prefetch fresh avatar URL
            ExpoImage.prefetch(data.avatar_url);
          } else {
            setAvatarUrl(null);
          }
          const cachedRaw = await AsyncStorage.getItem(CACHE_USER);
          const previous = cachedRaw ? JSON.parse(cachedRaw) : {};
          await AsyncStorage.setItem(
            CACHE_USER,
            JSON.stringify({ ...previous, ...data })
          );
        }
      }
    })();
  }, []);

  const handleAvatarUpload = async () => {
    setShowAvatarModal(false);
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    setUploadingAvatar(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const uri = result.assets[0].uri;
      const filePath = `${user.id}/avatar.jpg`; // Always use .jpg to avoid duplicate files

      // Fetch image as blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Convert blob to ArrayBuffer for Supabase
      const arrayBuffer = await new Response(blob).arrayBuffer();

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, arrayBuffer, { 
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const newAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`; // Cache bust

      // Update user record
      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar_url: newAvatarUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setAvatarUrl(newAvatarUrl);

      // Update cache
      const cached = await AsyncStorage.getItem(CACHE_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.avatar_url = newAvatarUrl;
        await AsyncStorage.setItem(CACHE_USER, JSON.stringify(parsed));
      }
    } catch (err: any) {
      console.log("Avatar upload error:", err);
      Alert.alert("Error", err.message || "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const menuItems: MenuItem[] = [
    {
      icon: "person-circle",
      iconColor: "#0B8F8B",
      iconBg: "#DFF3F2",
      label: "Manage account",
      onPress: () => router.push(ROUTES.manageAccount),
    },
    {
      icon: "document-text",
      iconColor: "#E8A817",
      iconBg: "#FFF3D0",
      label: "Terms and Conditions",
      onPress: () => router.push(ROUTES.termsAndConditions),
    },
    {
      icon: "shield-checkmark",
      iconColor: "#6BBF5B",
      iconBg: "#E6F7E2",
      label: "User Acceptance",
      onPress: () => router.push(ROUTES.userAcceptance),
    },
    {
      icon: "megaphone",
      iconColor: "#B36AF3",
      iconBg: "#F3E8FF",
      label: "Contact Us",
      onPress: () => router.push(ROUTES.contactUs),
    },
    {
      icon: "settings",
      iconColor: "#6B7A7A",
      iconBg: "#EEF2F2",
      label: "Settings",
      onPress: () => setShowingSettings(true),
    },
    {
      icon: "log-out",
      iconColor: "#25B3C7",
      iconBg: "#E2F7FA",
      label: "Logout",
      onPress: () => setShowLogoutModal(true),
    },
  ];

  const settingsItems: MenuItem[] = [
    {
      icon: "notifications",
      iconColor: "#E8A817",
      iconBg: "#FFF3D0",
      label: "Notification Settings",
      onPress: () => router.push(ROUTES.notificationSettings),
    },
    {
      icon: "lock-closed",
      iconColor: "#4A5252",
      iconBg: "#E4EAEA",
      label: "Change PIN",
      onPress: () => router.push(ROUTES.changePin),
    },
  ];

  if (showingSettings) {
    return (
      <AccountSubpage
        title="Settings"
        scroll
        onBack={() => setShowingSettings(false)}
      >
        <AccountSectionLabel>PRIVACY AND SECURITY</AccountSectionLabel>
        {settingsItems.map((item) => (
          <AccountMenuCard key={item.label} {...item} />
        ))}
      </AccountSubpage>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.headerWrap}>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <AccountGradient />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.profileRow}>
          <View style={styles.avatarWrapper}>
            <Pressable
              onPress={() => setShowAvatarModal(true)}
              style={({ pressed }) => [
                styles.avatarCircle,
                pressed && { opacity: 0.8 },
              ]}
            >
              {uploadingAvatar ? (
                <ActivityIndicator color={TEAL} size="small" />
              ) : avatarUrl ? (
                <ExpoImage
                  source={{ uri: avatarUrl }}
                  style={styles.avatarFullImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={avatarUrl}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={28} color="rgba(11,143,139,0.4)" />
                </View>
              )}
            </Pressable>
            {!avatarUrl && !uploadingAvatar && (
              <View style={styles.plusBadge}>
                <Ionicons name="add" size={14} color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.hiText}>
              Hi, <Text style={styles.hiName}>{name}</Text>
            </Text>
            <Text style={styles.profileDetail}>{phone}</Text>
            <Text style={styles.profileDetail}>{email}</Text>
            {vin ? <Text style={styles.profileDetail}>{vin}</Text> : null}
          </View>
        </View>

        <View style={styles.menuWrap}>
          {menuItems.map((item) => (
            <AccountMenuCard key={item.label} {...item} />
          ))}
        </View>
      </ScrollView>

      <AccountConfirmModal
        visible={showLogoutModal || loggingOut}
        title="Do you want to Log out?"
        busy={loggingOut}
        busyText="Logging out please wait..."
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutModal(false)}
      />

      <AccountConfirmModal
        visible={showAvatarModal}
        title={avatarUrl ? "Change your avatar?" : "Upload an avatar?"}
        onConfirm={handleAvatarUpload}
        onCancel={() => setShowAvatarModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },

  headerWrap: {
    paddingTop: 10,
    paddingBottom: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 22,
    color: TEXT_DARK,
  },

  scrollContent: {
    paddingBottom: NAV_TOTAL_HEIGHT + 40,
  },

  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(11,143,139,0.10)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(11,143,139,0.15)",
    overflow: "hidden",
  },
  avatarImg: {
    width: 38,
    height: 38,
  },
  avatarFullImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  plusBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  profileInfo: {
    flex: 1,
  },
  hiText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 18,
    color: TEAL,
  },
  hiName: {
    fontFamily: FONT,
    fontWeight: "700",
    color: TEAL,
  },
  profileDetail: {
    marginTop: 3,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: MUTED,
  },

  menuWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
});
