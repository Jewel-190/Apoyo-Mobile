// app/Medical/SubmissionSuccess.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
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
const TEXT = "#000000";
const MUTED = "#7B7B7B";
const BLUE = "#1D7EDC";
const CARD_BORDER = "#E7E7E7";
const GREEN = "#7CCB53";
const BG = "#FFFFFF";

/* ========= STORAGE (shared) =========
  ✅ Notifications page uses this key already:
*/
const STORAGE_KEY_NOTIFS = "apoyo_notifications_v1";

/*
  ✅ Status key may differ in your project depending on your Status.tsx.
  To avoid “missing sync”, we write to MULTIPLE common keys.
  Later, we’ll make Status.tsx read the correct one consistently.
*/
const STATUS_KEYS = [
  "apoyo_status_items_v1",
  "apoyo_status_v1",
  "apoyo_applications_v1",
];

type Category = "medical" | "financial" | "burial";

type StatusItem = {
  id: string; // applicationId
  serviceId: string;
  serviceTitle: string;
  category: Category;
  createdAt: number;
  status: "Received" | "Pending" | "Approved" | "Rejected";
};

type NotifItem = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  category: Category;
  relatedAppId?: string;
};

function categoryFromServiceId(serviceId: string): Category {
  const s = (serviceId || "").toLowerCase();

  // medical
  if (s === "hospital" || s === "hospitalization" || s === "treatment" || s === "operations")
    return "medical";

  // financial
  if (s === "emergency-finance" || s === "burial-money") return "financial";

  // burial
  if (s === "burial-site" || s === "cremation" || s === "colombarium") return "burial";

  // default
  return "medical";
}

function defaultTitleFromServiceId(serviceId: string) {
  const s = (serviceId || "").toLowerCase();
  if (s === "hospital" || s === "hospitalization") return "Hospitalization Expense";
  if (s === "treatment") return "Treatment & Procedures";
  if (s === "operations") return "Medical Operations";
  if (s === "emergency-finance") return "Emergency Financial Relief";
  if (s === "burial-money") return "Monetary Burial Aid";
  if (s === "burial-site") return "Burial Site Assistance";
  if (s === "cremation") return "Cremation Assistance";
  if (s === "colombarium") return "Colombarium Allocation";
  return "Medical Operations";
}

function generateAppId(now: number) {
  // ex: APP-20260216-4821
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `APP-${y}${m}${day}-${rand}`;
}

async function safeReadArray<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function safeWriteArray<T>(key: string, arr: T[]) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(arr));
  } catch {}
}

export default function SubmissionSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    applicationId?: string;
    serviceTitle?: string;
    serviceId?: string;
  }>();

  const now = useMemo(() => Date.now(), []);
  const serviceId = useMemo(
    () => (params?.serviceId ? String(params.serviceId) : "operations"),
    [params?.serviceId]
  );

  const serviceTitle = useMemo(() => {
    if (params?.serviceTitle) return String(params.serviceTitle);
    return defaultTitleFromServiceId(serviceId);
  }, [params?.serviceTitle, serviceId]);

  const appId = useMemo(() => {
    if (params?.applicationId) return String(params.applicationId);
    return generateAppId(now);
  }, [params?.applicationId, now]);

  const category = useMemo(() => categoryFromServiceId(serviceId), [serviceId]);

  // ✅ AUTO-SYNC to Status + Notification once (when this screen opens)
  useEffect(() => {
    (async () => {
      const statusItem: StatusItem = {
        id: appId,
        serviceId,
        serviceTitle,
        category,
        createdAt: now,
        status: "Received",
      };

      // Write to status keys (so whichever your Status.tsx reads, it will appear)
      for (const key of STATUS_KEYS) {
        const list = await safeReadArray<StatusItem>(key);

        // avoid duplicates
        const exists = list.some((x) => String((x as any)?.id) === String(appId));
        const next = exists ? list : [statusItem, ...list];

        // newest first
        next.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
        await safeWriteArray(key, next);
      }

      // Notification entry
      const notif: NotifItem = {
        id: `n_${appId}_${now}`,
        title: "Application Received!",
        body: `We have received your request for ${serviceTitle}.`,
        createdAt: now,
        read: false,
        category,
        relatedAppId: appId,
      };

      const notifs = await safeReadArray<NotifItem>(STORAGE_KEY_NOTIFS);
      const nextNotifs = [notif, ...notifs].slice(0, 100); // keep it light
      nextNotifs.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
      await safeWriteArray(STORAGE_KEY_NOTIFS, nextNotifs);
    })();
  }, [appId, serviceId, serviceTitle, category, now]);

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
          Medical Assistance - <Text style={styles.linkish}>{serviceTitle}</Text>.
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
            onPress={() => router.replace("/Status/Status" as any)}
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
