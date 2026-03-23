import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

const FONT = "SF Pro Rounded";
const TEXT_DARK = "#2B2B2B";
const TEAL = "#0B8F8B";
const MUTED = "#8A9A9A";
const DIVIDER = "#E6EEEE";

const STORAGE_PUSH = "apoyo_push_notif";
const STORAGE_INAPP = "apoyo_inapp_notif";

export default function NotificationSettings() {
  const router = useRouter();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      const push = await AsyncStorage.getItem(STORAGE_PUSH);
      const inApp = await AsyncStorage.getItem(STORAGE_INAPP);
      if (push !== null) setPushEnabled(push === "1");
      if (inApp !== null) setInAppEnabled(inApp === "1");
    })();
  }, []);

  const togglePush = async (val: boolean) => {
    setPushEnabled(val);
    await AsyncStorage.setItem(STORAGE_PUSH, val ? "1" : "0");
  };

  const toggleInApp = async (val: boolean) => {
    setInAppEnabled(val);
    await AsyncStorage.setItem(STORAGE_INAPP, val ? "1" : "0");
  };

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
        <Text style={styles.topTitle}>Notification Settings</Text>
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

      <View style={styles.content}>
        {/* Section Title */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <Text style={styles.sectionDesc}>
          Customize your notification settings to control what alerts you
          receive.
        </Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Push Notification */}
        <Text style={styles.settingLabel}>Push Notification</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingDesc}>
            Receive important updates and alerts directly on your device, even
            when the app isn't open.
          </Text>
          <Switch
            value={pushEnabled}
            onValueChange={togglePush}
            trackColor={{ false: "#D0D8D8", true: TEAL }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#D0D8D8"
            style={styles.switch}
          />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* In-App Notification */}
        <Text style={styles.settingLabel}>In-App Notification</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingDesc}>
            Get timely messages and alerts within the app itself.
          </Text>
          <Switch
            value={inAppEnabled}
            onValueChange={toggleInApp}
            trackColor={{ false: "#D0D8D8", true: TEAL }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#D0D8D8"
            style={styles.switch}
          />
        </View>

        {/* Divider */}
        <View style={styles.divider} />
      </View>
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

  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  sectionTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 20,
    color: TEXT_DARK,
    marginBottom: 8,
  },
  sectionDesc: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12.5,
    color: MUTED,
    lineHeight: 18,
    marginBottom: 20,
  },

  divider: {
    height: 1,
    backgroundColor: DIVIDER,
    marginBottom: 16,
  },

  settingLabel: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    color: MUTED,
    marginBottom: 10,
  },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  settingDesc: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: TEAL,
    lineHeight: 19,
  },
  switch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
});
