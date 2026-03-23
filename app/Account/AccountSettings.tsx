import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
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
const SECTION_MUTED = "#8A9A9A";
const CHEVRON_COLOR = "#2B2B2B";

type AccountItem = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  onPress?: () => void;
};

export default function AccountSettings() {
  const router = useRouter();

  const accountItems: AccountItem[] = [
    {
      icon: "person",
      iconColor: "#0B8F8B",
      iconBg: "#DFF3F2",
      label: "Personal Information",
      onPress: () => router.push("/Account/PersonalInformation" as any),
    },
    {
      icon: "globe-outline",
      iconColor: "#0B8F8B",
      iconBg: "#DFF3F2",
      label: "Access and Control",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
        </Pressable>
        <Text style={styles.topTitle}>Account Settings</Text>
        <View style={styles.homeBtn}>
          <Pressable
            onPress={() => router.push("/Home/Home" as any)}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="home" size={22} color={TEAL} />
          </Pressable>
        </View>
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
        <Text style={styles.sectionLabel}>ACCOUNT</Text>

        {accountItems.map((item, idx) => (
          <View key={idx} style={styles.cardShadow}>
            <Pressable
              onPress={item.onPress ?? (() => Alert.alert(item.label))}
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
              ]}
            >
              <View style={styles.cardLeft}>
                <View
                  style={[styles.iconBubble, { backgroundColor: item.iconBg }]}
                >
                  <Ionicons name={item.icon} size={18} color={item.iconColor} />
                </View>
                <Text style={styles.cardLabel}>{item.label}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={CHEVRON_COLOR}
              />
            </Pressable>
          </View>
        ))}
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
    paddingHorizontal: 18,
    paddingBottom: 40,
  },

  sectionLabel: {
    marginTop: 28,
    marginBottom: 14,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 11,
    color: SECTION_MUTED,
    letterSpacing: 0.8,
  },

  cardShadow: {
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  card: {
    height: 58,
    backgroundColor: "#FAFCFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F2",
    paddingLeft: 16,
    paddingRight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEAL,
  },
});
