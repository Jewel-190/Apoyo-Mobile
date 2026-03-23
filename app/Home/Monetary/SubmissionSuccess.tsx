import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
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

/* ========= ASSETS ========= */
const BOOK_PNG = require("../../../assets/images/Book.png");
const PIN_PNG = require("../../../assets/images/Pin.png");

/* ========= THEME ========= */
const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;

const BG = "#FFFFFF";
const TEXT = "#000000"; // ✅ black body text like screenshot
const LINK = "#2A74FF";

const TEAL = "#0B8F8B";
const GREEN = "#7CCB53";
const BORDER = "#E7EEEE";

function fallbackAppId(prefix: string) {
  const year = new Date().getFullYear();
  const n = (Date.now() % 900) + 100;
  return `${prefix}-${year}-${n}`;
}

export default function SubmissionSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    serviceTitle?: string;
    applicationId?: string;
  }>();

  const serviceTitle = (
    params?.serviceTitle || "Monetary Burial Aid"
  ).toString();

  const appId = useMemo(() => {
    const passed = (params?.applicationId || "").toString().trim();
    if (passed) return passed;
    return fallbackAppId("MBAR");
  }, [params?.applicationId]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={{ height: 18 }} />

      <View style={styles.illuWrap}>
        <Image source={BOOK_PNG} style={styles.bookImg} resizeMode="contain" />
      </View>

      <Text style={styles.title}>Application Received!</Text>

      <Text style={styles.body}>
        Thank you for submitting your requirements.{"\n"}
        We have received your request for{"\n"}
        Financial Assistance - <Text style={styles.link}>{serviceTitle}</Text>.
      </Text>

      <Text style={styles.appId}>Application ID: {appId}</Text>

      <View style={styles.cardShadow}>
        <View style={styles.card}>
          <View style={styles.cardTop} />

          <View style={styles.pinWrap}>
            <Image
              source={PIN_PNG}
              style={styles.pinImg}
              resizeMode="contain"
            />
          </View>

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
                <Text style={styles.link}>"Status"</Text> tab.
              </Text>
            </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG, paddingHorizontal: 18 },

  illuWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 140,
    marginTop: 8,
  },
  bookImg: { width: 110, height: 110 },

  // ✅ stronger weight like screenshot
  title: {
    textAlign: "center",
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 19,
    color: TEXT,
  },

  body: {
    textAlign: "center",
    marginTop: 10,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12.5,
    lineHeight: 18,
    color: TEXT,
  },
  link: { color: LINK },

  appId: {
    textAlign: "center",
    marginTop: 14,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12.5,
    color: TEXT,
  },

  cardShadow: {
    marginTop: 18,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    paddingBottom: 16,
  },
  cardTop: { height: 44, backgroundColor: GREEN },

  pinWrap: {
    position: "absolute",
    right: 14,
    top: 22,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  pinImg: { width: 42, height: 42 },

  cardTitle: {
    marginTop: 12,
    marginLeft: 14,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: TEXT,
  },

  bullets: { marginTop: 10, paddingHorizontal: 14, gap: 10 },
  bulletRow: { flexDirection: "row", gap: 10 },
  dot: { fontSize: 16, color: TEXT },

  bulletText: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 17,
    color: TEXT,
  },

  bottom: {
    marginTop: "auto",
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 18 : 14,
  },
  btn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
});
