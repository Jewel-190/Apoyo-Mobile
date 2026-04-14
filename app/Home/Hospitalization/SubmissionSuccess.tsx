import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

import {
  addStatusApplication,
  makeStatusId,
  prettyDate,
} from "../Applications";

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
const TEXT = "#000000";
const BLUE = "#1D7EDC";
const CARD_BORDER = "#E7E7E7";
const GREEN = "#7CCB53";
const BG = "#FFFFFF";

/**
 * ✅ Optional: avoid adding duplicate record if user returns to this screen
 * We store the last saved appId for this service in AsyncStorage.
 */
const DEDUPE_KEY = "claret_saved_hospitalization_success_v1";

export default function SubmissionSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    requestId?: string;
    requestCode?: string;
    serviceId?: string;
  }>();
  const requestId = (params?.requestId || "").toString().trim();
  const initialRequestCode = (params?.requestCode || "").toString().trim();
  const [requestCode, setRequestCode] = useState<string | null>(
    initialRequestCode || null
  );
  const [isRequestCodeLoading, setIsRequestCodeLoading] = useState(false);

  // track card creation time for local status cache ordering
  const createdAt = useMemo(() => Date.now(), []);
  const localRecordId = useMemo(
    () => requestId || makeStatusId("MAHB"),
    [requestId]
  );

  useEffect(() => {
    if (requestCode || !requestId) return;

    let active = true;

    (async () => {
      try {
        setIsRequestCodeLoading(true);
        const { data, error } = await supabase
          .from("hospitalization_requests")
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
        console.log("Fetch request code failed:", e);
      } finally {
        if (active) setIsRequestCodeLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [requestCode, requestId]);

  // ✅ make sure we only save once
  const savedOnce = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        if (savedOnce.current) return;

        const dedupeValue = requestCode || requestId || localRecordId;

        // if we already saved on a previous mount, skip
        const already = await AsyncStorage.getItem(DEDUPE_KEY);
        if (already === dedupeValue) return;

        savedOnce.current = true;

        await addStatusApplication({
          id: requestId || localRecordId,
          title: "Hospitalization Expense",
          description:
            "Urgent medical aid for expenses during hospital confinement.",
          status: "Pending",
          category: "medical",
          createdAt,
          applicationId: requestCode || undefined,
          dateLabel: prettyDate(createdAt),
        });

        await AsyncStorage.setItem(DEDUPE_KEY, dedupeValue);
      } catch (e) {
        // don't block UI
        console.log("Save to Status failed:", e);
      }
    })();
  }, [createdAt, localRecordId, requestCode, requestId]);

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
          <Text style={styles.linkish}>Hospitalization Expense</Text>.
        </Text>

        {requestCode ? (
          <Text style={styles.appId}>Request Code: {requestCode}</Text>
        ) : isRequestCodeLoading ? (
          <View style={styles.loadingCodeRow}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={styles.loadingCodeText}>Generating request code...</Text>
          </View>
        ) : null}

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

  loadingCodeRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  loadingCodeText: {
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
