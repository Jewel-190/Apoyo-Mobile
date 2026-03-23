import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const FONT = "SF Pro Rounded";
const TEXT_DARK = "#2B2B2B";
const TEAL = "#0B8F8B";
const MUTED = "#8A9A9A";
const DIVIDER = "#E6EEEE";

const STORAGE_USER_NAME = "apoyo_user_name";
const STORAGE_USER_PHONE = "apoyo_user_phone";
const STORAGE_USER_EMAIL = "apoyo_user_email";

const PROFILE_PNG = require("../../assets/images/ProfileIcon.png");

export default function PersonalInformation() {
  const router = useRouter();

  const [fullName, setFullName] = useState("JUAN DELA GARCIA CRUZ");
  const [email, setEmail] = useState("juandelacruz@gmail.com");
  const [phone, setPhone] = useState("+639123218853");
  const [dob] = useState("July 25, 2003");
  const [address] = useState("Dasmariñas, Paliparan 123");

  useEffect(() => {
    (async () => {
      const nm = await AsyncStorage.getItem(STORAGE_USER_NAME);
      const ph = await AsyncStorage.getItem(STORAGE_USER_PHONE);
      const em = await AsyncStorage.getItem(STORAGE_USER_EMAIL);

      if (nm && nm.trim()) setFullName(nm.trim().toUpperCase());
      if (ph && ph.trim()) setPhone(ph.trim());
      if (em && em.trim()) setEmail(em.trim());
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
        </Pressable>
        <Text style={styles.topTitle}>Personal Information</Text>
        <View style={styles.homeBtn}>
          <Pressable
            onPress={() => router.push("/Home/Home" as any)}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="home" size={22} color={TEAL} />
          </Pressable>
        </View>
      </View>

      {/* Teal gradient divider */}
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
        {/* Profile Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarOuter}>
            <View style={styles.avatarCircle}>
              <Image
                source={PROFILE_PNG}
                style={styles.avatarImg}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Name */}
          <Text style={styles.fullName}>{fullName}</Text>

          {/* Email */}
          <Text style={styles.emailText}>{email}</Text>

          {/* Change Email Button */}
          <Pressable
            onPress={() => {}}
            style={({ pressed }) => [
              styles.changeBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.changeBtnText}>Change Email</Text>
            <Ionicons name="open-outline" size={14} color={TEAL} />
          </Pressable>
        </View>

        {/* Info Fields */}
        <View style={styles.fieldsWrap}>
          {/* Date of Birth */}
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Date of Birth</Text>
          <Text style={styles.fieldValue}>{dob}</Text>

          {/* Phone number */}
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Phone number</Text>
          <Text style={styles.fieldValue}>{phone}</Text>

          {/* Current Address */}
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Current Address</Text>
          <Text style={styles.fieldValue}>{address}</Text>

          {/* Change Address Button */}
          <Pressable
            onPress={() => {}}
            style={({ pressed }) => [
              styles.changeAddressBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.changeAddressBtnText}>Change Address</Text>
            <Ionicons name="open-outline" size={13} color={TEAL} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },

  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 16,
    color: TEXT_DARK,
  },
  homeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  gradientDivider: {
    height: 3,
    width: "100%",
  },

  scrollContent: {
    paddingBottom: 40,
  },

  /* ── Avatar Section ── */
  avatarSection: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 24,
  },
  avatarOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(11,143,139,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  avatarCircle: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "rgba(11,143,139,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 56,
    height: 56,
  },

  fullName: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 18,
    color: TEXT_DARK,
    textAlign: "center",
    letterSpacing: 0.3,
    marginBottom: 6,
  },

  emailText: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    marginBottom: 12,
  },

  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: TEAL,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  changeBtnText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: TEAL,
  },

  /* ── Fields ── */
  fieldsWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  divider: {
    height: 1,
    backgroundColor: DIVIDER,
    marginBottom: 12,
  },

  fieldLabel: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    color: MUTED,
    marginBottom: 6,
  },
  fieldValue: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEAL,
    marginBottom: 18,
  },

  changeAddressBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderColor: TEAL,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: -6,
  },
  changeAddressBtnText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 11,
    color: TEAL,
  },
});
