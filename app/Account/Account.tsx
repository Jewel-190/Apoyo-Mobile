import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomNavBar, { NAV_TOTAL_HEIGHT, TabKey } from "../../components/BottomNavBar";
import VerifyModal from "../../components/VerifyModal";
import { supabase } from "../../lib/supabase";

const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#6B7A7A";
const FONT = "SF Pro Rounded";

const ROUTE_SETTINGS = "/Account/Settings";

const CACHE_USER = "apoyo_user_cache";

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
  const [verified, setVerified] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleLogout = async () => {
    setShowLogoutModal(false);
    setLoggingOut(true);
    
    // Show "Logging out" for 1 second
    setTimeout(async () => {
      await AsyncStorage.removeItem(CACHE_USER); // Clear cached user data
      await supabase.auth.signOut();
      setLoggingOut(false);
      router.replace("/phase1/login");
    }, 1000);
  };

  useEffect(() => {
    (async () => {
      // Load from cache first (instant)
      const cached = await AsyncStorage.getItem(CACHE_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.first_name) setName(parsed.first_name);
        if (parsed.contact_number) setPhone(parsed.contact_number);
        if (parsed.email) setEmail(parsed.email);
        if (typeof parsed.verified === "boolean") setVerified(parsed.verified);
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
          .select("first_name, middle_name, last_name, contact_number, email, verified, avatar_url")
          .eq("id", user.id)
          .single();
        
        if (data) {
          if (data.first_name) setName(data.first_name);
          if (data.contact_number) setPhone(data.contact_number);
          if (data.email) setEmail(data.email);
          setVerified(data.verified === true);
          if (data.avatar_url) {
            setAvatarUrl(data.avatar_url);
            // Prefetch fresh avatar URL
            ExpoImage.prefetch(data.avatar_url);
          } else {
            setAvatarUrl(null);
          }
          // Update cache (preserve all fields for Verify-acc)
          await AsyncStorage.setItem(CACHE_USER, JSON.stringify(data));
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
      icon: "help-circle",
      iconColor: "#E34B4B",
      iconBg: "#FDE8E8",
      label: "FAQs",
    },
    {
      icon: "information-circle",
      iconColor: "#F0A11A",
      iconBg: "#FFF4DD",
      label: "About Apoyo",
    },
    {
      icon: "megaphone",
      iconColor: "#B36AF3",
      iconBg: "#F3E8FF",
      label: "Contact Us",
    },
    {
      icon: "settings",
      iconColor: "#6B7A7A",
      iconBg: "#EEF2F2",
      label: "Settings",
      onPress: () => router.push(ROUTE_SETTINGS as any),
    },
    {
      icon: "log-out",
      iconColor: "#25B3C7",
      iconBg: "#E2F7FA",
      label: "Logout",
      onPress: () => setShowLogoutModal(true),
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.headerWrap}>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <LinearGradient
        colors={["#0B8F8B", "#6FB8B5", "#D4F3F2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientDivider}
      />

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
            <Text style={styles.profileSubText}>
              {verified ? "Account verified" : "Verify your account"}
            </Text>
            <Text style={styles.profileDetail}>{phone}</Text>
            <Text style={styles.profileDetail}>{email}</Text>
          </View>
        </View>

        <View style={styles.menuWrap}>
          {menuItems.map((item, idx) => (
            <Pressable
              key={idx}
              onPress={item.onPress ?? (() => Alert.alert(item.label))}
              style={({ pressed }) => [
                styles.menuCard,
                pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
              ]}
            >
              <View style={styles.menuLeft}>
                <View
                  style={[styles.iconBubble, { backgroundColor: item.iconBg }]}
                >
                  <Ionicons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#B0BABA" />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <BottomNavBar
        activeTab="account"
        onBeforeNavigate={(tabKey: TabKey) => {
          if (tabKey === "home" || tabKey === "account") return true;
          if (!verified) {
            setShowVerifyModal(true);
            return false;
          }
          return true;
        }}
      />

      <VerifyModal
        visible={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
      />

      {/* Logout Modal */}
      <Modal transparent visible={showLogoutModal || loggingOut} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.logoutCard}>
            {loggingOut ? (
              <Text style={styles.loggingOutText}>Logging out please wait...</Text>
            ) : (
              <>
                <Text style={styles.logoutTitle}>Do you want to Log out?</Text>
                <View style={styles.logoutBtnRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.logoutBtn,
                      styles.logoutBtnYes,
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={handleLogout}
                  >
                    <Text style={styles.logoutBtnYesText}>Yes</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.logoutBtn,
                      styles.logoutBtnNo,
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={() => setShowLogoutModal(false)}
                  >
                    <Text style={styles.logoutBtnNoText}>No</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Avatar Upload Modal */}
      <Modal transparent visible={showAvatarModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.logoutCard}>
            <Text style={styles.logoutTitle}>
              {avatarUrl ? "Change your avatar?" : "Upload an avatar?"}
            </Text>
            <View style={styles.logoutBtnRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.logoutBtn,
                  styles.logoutBtnYes,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={handleAvatarUpload}
              >
                <Text style={styles.logoutBtnYesText}>Yes</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.logoutBtn,
                  styles.logoutBtnNo,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setShowAvatarModal(false)}
              >
                <Text style={styles.logoutBtnNoText}>No</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  gradientDivider: {
    height: 3,
    width: "100%",
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
  profileSubText: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: MUTED,
  },
  profileDetail: {
    marginTop: 3,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 13,
    color: MUTED,
  },

  menuWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  menuCard: {
    height: 62,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6EEEE",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEAL,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  logoutCard: {
    width: "100%",
    height: 150,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6EEEE",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  logoutTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 18,
    color: TEAL,
    textAlign: "center",
    marginBottom: 20,
  },
  logoutBtnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  logoutBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtnYes: {
    backgroundColor: TEAL,
  },
  logoutBtnNo: {
    backgroundColor: "#EDEDED",
  },
  logoutBtnYesText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
    color: "#FFFFFF",
  },
  logoutBtnNoText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
    color: TEAL,
  },
  loggingOutCard: {
    width: "100%",
    maxWidth: 340,
    minHeight: 160,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6EEEE",
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  loggingOutText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 16,
    color: TEAL,
    textAlign: "center",
  },
});
