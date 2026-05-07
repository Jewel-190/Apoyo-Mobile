import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";

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

export default function SubmissionSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    requestId?: string;
    requestCode?: string;
    serviceTitle?: string;
    applicationId?: string;
  }>();
  const requestId = (params?.requestId || "").toString().trim();
  const initialRequestCode = (
    params?.requestCode ||
    params?.applicationId ||
    ""
  )
    .toString()
    .trim();
  const [requestCode, setRequestCode] = useState<string | null>(
    initialRequestCode || null
  );
  const [isRequestCodeLoading, setIsRequestCodeLoading] = useState(false);

  const serviceTitle = (
    params?.serviceTitle || "Monetary Burial Aid"
  ).toString();

  useEffect(() => {
    if (requestCode || !requestId) return;

    let active = true;

    (async () => {
      try {
        setIsRequestCodeLoading(true);
        const { data, error } = await supabase
          .from("monetary_requests")
          .select("request_code")
          .eq("id", requestId)
          .maybeSingle();

        if (error) throw error;

        const code =
          typeof data?.request_code === "string" ? data.request_code.trim() : "";

        if (active && code) {
          setRequestCode(code);
        }
      } catch (e) {
        console.log("Fetch monetary request code failed:", e);
      } finally {
        if (active) setIsRequestCodeLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [requestCode, requestId]);

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

      {requestCode ? (
        <Text style={styles.appId}>Request Code: {requestCode}</Text>
      ) : isRequestCodeLoading ? (
        <View style={styles.loadingCodeRow}>
          <ActivityIndicator size="small" color={TEAL} />
          <Text style={styles.loadingCodeText}>Loading request code...</Text>
        </View>
      ) : null}

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

  loadingCodeRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  loadingCodeText: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 12,
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
