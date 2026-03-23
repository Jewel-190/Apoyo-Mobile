import { useRouter } from "expo-router";
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

/* ===== FONT RULE ===== */
const FONT_REGULAR = Platform.select({
  ios: "SF Pro Rounded",
  android: "System",
})!;
const FONT_MEDIUM = Platform.select({
  ios: "SF Pro Rounded",
  android: "System",
})!;

/* assets */
const BOOK_PNG = require("../../../assets/images/Book.png");
const PIN_PNG = require("../../../assets/images/Pin.png");

/* colors */
const TEAL = "#0B8F8B";
const TEXT = "#000000"; // Updated to black
const MUTED = "#7B7B7B";
const BLUE = "#1D7EDC";
const CARD_BORDER = "#E7E7E7";
const GREEN = "#7CCB53";
const BG = "#FFFFFF";

export default function SubmissionSuccess() {
  const router = useRouter();
  const appId = useMemo(() => "MAHB-2026-001", []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.screen}>
        {/* image */}
        <Image source={BOOK_PNG} style={styles.illus} />

        {/* title */}
        <Text style={styles.title}>Application Received!</Text>

        {/* paragraph */}
        <Text style={styles.desc}>
          Thank you for submitting your requirements.{"\n"}
          We have received your request for{"\n"}
          Medical Assistance -{" "}
          <Text style={styles.linkish}>Treatment & Procedures</Text>.
        </Text>

        <Text style={styles.appId}>Application ID: {appId}</Text>

        {/* card */}
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

        {/* button */}
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

  /* regular */
  title: {
    fontFamily: FONT_REGULAR, // Updated to Regular
    fontSize: 18, // Increased font size
    fontWeight: "700", // Regular weight
    color: TEXT, // Updated to black
    marginBottom: 10, // Added more space below the title
    textAlign: "center",
  },

  /* regular */
  desc: {
    fontFamily: FONT_REGULAR,
    fontSize: 13, // Increased font size
    lineHeight: 18, // Adjusted line height
    color: TEXT, // Updated to black
    textAlign: "center",
    marginBottom: 10, // Added more space below the description
  },

  linkish: {
    color: BLUE,
    fontFamily: FONT_REGULAR, // Updated to Regular
    fontWeight: "400", // Regular weight
  },

  appId: {
    marginTop: 10, // Increased spacing
    fontFamily: FONT_REGULAR,
    fontSize: 12, // Increased font size
    color: TEXT, // Updated to black
  },

  card: {
    width: "100%",
    marginTop: 20, // Increased spacing
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
    top: 8, // Adjusted position to align with the green header
    width: 48, // Adjusted size
    height: 48, // Adjusted size
    resizeMode: "contain",
  },

  /* regular */
  cardTitle: {
    marginTop: 16, // Increased spacing
    marginLeft: 16,
    fontFamily: FONT_REGULAR, // Updated to Regular
    fontSize: 13, // Increased font size
    fontWeight: "400", // Regular weight
    color: TEXT, // Updated to black
  },

  bullets: {
    paddingHorizontal: 16,
    marginTop: 12, // Increased spacing
    paddingBottom: 20, // Increased spacing
    gap: 12, // Increased gap between bullet points
  },

  bulletRow: { flexDirection: "row", gap: 8 },

  dot: {
    width: 12,
    fontFamily: FONT_REGULAR,
    fontSize: 13,
    lineHeight: 15,
    color: TEXT, // Updated to black
    marginTop: 1,
  },

  /* regular */
  bulletText: {
    flex: 1,
    fontFamily: FONT_REGULAR,
    fontSize: 11.5, // Increased font size
    lineHeight: 16, // Adjusted line height
    color: TEXT, // Updated to black
  },

  statusLink: {
    color: BLUE,
    fontFamily: FONT_REGULAR, // Updated to Regular
    fontWeight: "400", // Regular weight
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
    fontFamily: FONT_REGULAR, // Updated to Regular
    fontSize: 13,
    fontWeight: "400", // Regular weight
    color: "#fff",
  },
});
