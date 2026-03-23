import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const FONT = "SF Pro Rounded";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const BORDER = "#E9EDED";

const BOOK2_PNG = require("../../assets/images/Book2.png");

export default function ApprovedAssistance() {
  const router = useRouter();

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
        <Text style={styles.topTitle}>Back to Home</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <Image source={BOOK2_PNG} style={styles.bookImg} resizeMode="contain" />

        <Text style={styles.title}>Thank you for your interest!</Text>
        <Text style={styles.subtitle}>
          It looks like you don't have any approved{"\n"}applications yet.
        </Text>

        <Text style={styles.body}>
          You can check the 'Status' tab to see your{"\n"}current progress or
          click the button below to{"\n"}start a new application.
        </Text>

        <Pressable
          onPress={() => router.replace("/Home/Home")}
          style={({ pressed }) => [pressed && { opacity: 0.9 }]}
        >
          <LinearGradient
            colors={["#7BE05B", "#63C44A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.startBtn}
          >
            <Text style={styles.startBtnText}>Start Application</Text>
          </LinearGradient>
        </Pressable>
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
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
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

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 40,
  },

  bookImg: {
    width: 160,
    height: 160,
    marginBottom: 24,
  },

  title: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 20,
    color: TEXT_DARK,
    textAlign: "center",
    marginBottom: 10,
  },

  subtitle: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },

  body: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 30,
  },

  startBtn: {
    height: 48,
    paddingHorizontal: 40,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  startBtnText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
});
