import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  addStatusApplication,
  makeApplicationId,
  makeStatusId,
  prettyDate,
} from "../Applications";

const FONT_REGULAR = Platform.select({
  ios: "SF Pro Rounded",
  android: "System",
})!;

const BOOK_PNG = require("../../../assets/images/Book.png");
const PIN_PNG = require("../../../assets/images/Pin.png");

const TEAL = "#0B8F8B";
const TEXT = "#000000";
const BLUE = "#1D7EDC";
const CARD_BORDER = "#E7E7E7";
const GREEN = "#7CCB53";
const BG = "#FFFFFF";

const DEDUPE_KEY = "claret_saved_columbarium_success_v1";

export default function ColumbariumSubmissionSuccess() {
  const router = useRouter();

  const createdAt = useMemo(() => Date.now(), []);
  const appId = useMemo(() => makeApplicationId("BACN"), []);
  const localRecordId = useMemo(() => makeStatusId("BACN"), []);

  const savedOnce = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        if (savedOnce.current) return;

        const already = await AsyncStorage.getItem(DEDUPE_KEY);
        if (already === appId) return;

        savedOnce.current = true;

        await addStatusApplication({
          id: localRecordId,
          title: "Columbarium Allocation",
          description:
            "Urgent aid for securing essential columbarium niche space.",
          status: "Pending",
          category: "burial",
          createdAt,
          applicationId: appId,
          dateLabel: prettyDate(createdAt),
        });

        await AsyncStorage.setItem(DEDUPE_KEY, appId);
      } catch (e) {
        console.log("Save to Status failed:", e);
      }
    })();
  }, [appId, createdAt, localRecordId]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.screen}>
        <Image source={BOOK_PNG} style={styles.illus} />

        <Text style={styles.title}>Application Received!</Text>

        <Text style={styles.desc}>
          Thank you for submitting your requirements.{"\n"}
          We have received your request for{"\n"}
          Burial Assistance -{" "}
          <Text style={styles.linkish}>Columbarium Allocation</Text>.
        </Text>

        <Text style={styles.appId}>Application ID: {appId}</Text>

        <View style={styles.card}>
          <View style={styles.cardHeader} />
          <Image source={PIN_PNG} style={styles.pin} />

          <Text style={styles.cardTitle}>What's Next?</Text>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.bulletText}>
                Our officers will verify your uploaded requirements.
              </Text>
            </View>

            <View style={styles.bulletRow}>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.bulletText}>
                You will receive an SMS and Email alert as soon as your status
                changes.
              </Text>
            </View>

            <View style={styles.bulletRow}>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.bulletText}>
                You can monitor progress anytime in the{" "}
                <Text style={styles.statusLink}>"Status"</Text> tab.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bottom}>
          <Pressable
            onPress={() => router.replace("/Status/Status")}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.btnText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  screen: {
    flex: 1,
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 22,
  },

  illus: {
    width: 110,
    height: 110,
    resizeMode: "contain",
    marginBottom: 14,
  },

  title: {
    fontFamily: FONT_REGULAR,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 10,
    textAlign: "center",
  },

  desc: {
    fontFamily: FONT_REGULAR,
    fontSize: 13,
    lineHeight: 18,
    color: TEXT,
    textAlign: "center",
    marginBottom: 10,
  },

  linkish: {
    color: BLUE,
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
  },

  appId: {
    marginTop: 10,
    fontFamily: FONT_REGULAR,
    fontSize: 12,
    color: TEXT,
  },

  card: {
    width: "100%",
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },

  cardHeader: {
    height: 36,
    backgroundColor: GREEN,
  },

  pin: {
    position: "absolute",
    right: 16,
    top: 8,
    width: 48,
    height: 48,
    resizeMode: "contain",
  },

  cardTitle: {
    marginTop: 16,
    marginLeft: 16,
    fontFamily: FONT_REGULAR,
    fontSize: 13,
    fontWeight: "400",
    color: TEXT,
  },

  bullets: {
    paddingHorizontal: 16,
    marginTop: 12,
    paddingBottom: 20,
    gap: 12,
  },

  bulletRow: { flexDirection: "row", gap: 8 },

  dot: {
    width: 12,
    fontFamily: FONT_REGULAR,
    fontSize: 13,
    lineHeight: 15,
    color: TEXT,
    marginTop: 1,
  },

  bulletText: {
    flex: 1,
    fontFamily: FONT_REGULAR,
    fontSize: 11.5,
    lineHeight: 16,
    color: TEXT,
  },

  statusLink: {
    color: BLUE,
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
  },

  bottom: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 20,
  },

  btn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  btnText: {
    fontFamily: FONT_REGULAR,
    fontSize: 13,
    fontWeight: "400",
    color: "#fff",
  },
});
