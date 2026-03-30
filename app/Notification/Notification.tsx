import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomNavBar from "../../components/BottomNavBar";

const FONT = "SF Pro Rounded";

const BG = "#FFFFFF";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";

const CARD_BORDER = "#E2E8E8";

type Category = "medical" | "financial" | "burial";
type ServiceStatus = "Pending" | "In Progress" | "Action Required" | "Approved";

/* ── Category accent colors (matching home service cards) ── */
function accentColor(cat: Category): string {
  if (cat === "medical") return "#12B4D8"; // blue
  if (cat === "financial") return "#F2B600"; // yellow/gold
  return "#9B59D0"; // purple
}

const STORAGE_KEY_NOTIFS = "apoyo_notifications_v1";
const STORAGE_KEY_STATUS_LIST = "apoyo_status_applications_v1";

const ROUTE_TIMELINE = "/Status/StatusDetails";

type NotifItem = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  category: Category;
  relatedAppId?: string;
};

type ApplicationItem = {
  id: string;
  title: string;
  description: string;
  status: ServiceStatus;
  category: Category;
  createdAt?: number;
};

function shortDate(ts: number) {
  const d = new Date(ts);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function safeParseArray(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function normalizeNotifs(list: any[]): NotifItem[] {
  return list
    .map((x: any) => ({
      id: String(x?.id ?? `n_${Date.now()}`),
      title: String(x?.title ?? ""),
      body: String(x?.body ?? ""),
      createdAt: typeof x?.createdAt === "number" ? x.createdAt : Date.now(),
      read: !!x?.read,
      category: (x?.category as Category) ?? "medical",
      relatedAppId: x?.relatedAppId ? String(x.relatedAppId) : undefined,
    }))
    .filter((x) => x.title.trim().length > 0)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function normalizeApps(list: any[]): ApplicationItem[] {
  return list
    .map((x: any) => ({
      id: String(x?.id ?? ""),
      title: String(x?.title ?? ""),
      description: String(x?.description ?? ""),
      status: (x?.status as ServiceStatus) ?? "Pending",
      category: (x?.category as Category) ?? "medical",
      createdAt: typeof x?.createdAt === "number" ? x.createdAt : Date.now(),
    }))
    .filter((x) => x.id && x.title.trim().length > 0)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function categoryLabel(cat: Category): string {
  if (cat === "medical") return "Medical Assistance Application";
  if (cat === "financial") return "Financial Assistance Application";
  return "Burial Assistance Application";
}

async function syncNotifsFromStatus(): Promise<NotifItem[]> {
  const [rawNotifs, rawApps] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_NOTIFS),
    AsyncStorage.getItem(STORAGE_KEY_STATUS_LIST),
  ]);

  const existing = normalizeNotifs(safeParseArray(rawNotifs));
  const apps = normalizeApps(safeParseArray(rawApps));

  const byRelated = new Set<string>();
  for (const n of existing) {
    if (n.relatedAppId) byRelated.add(String(n.relatedAppId));
  }

  const generated: NotifItem[] = [];
  for (const a of apps) {
    const rel = String(a.id);
    if (byRelated.has(rel)) continue;

    generated.push({
      id: `app_${rel}`,
      title: categoryLabel(a.category),
      body: `All requirements for your ${a.title} request have been successfully uploaded. We're starting the review process now!`,
      createdAt: a.createdAt ?? Date.now(),
      read: false,
      category: a.category ?? "medical",
      relatedAppId: rel,
    });
  }

  const hasWelcome = [...existing, ...generated].some(
    (n) => n.id === "welcome_notif"
  );
  if (!hasWelcome) {
    generated.push({
      id: "welcome_notif",
      title: "Welcome",
      body: "Congratulations! You have successfully registered with the Apoyo.",
      createdAt: Date.now() - 86400000,
      read: true,
      category: "medical",
    });
  }

  const merged = [...generated, ...existing].sort(
    (a, b) => b.createdAt - a.createdAt
  );

  try {
    await AsyncStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(merged));
  } catch {}

  return merged;
}

export default function Notification() {
  const router = useRouter();
  const [items, setItems] = useState<NotifItem[]>([]);

  const hasResults = useMemo(() => items.length > 0, [items]);

  const persist = async (next: NotifItem[]) => {
    setItems(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(next));
    } catch {}
  };

  const load = async () => {
    try {
      const merged = await syncNotifsFromStatus();
      setItems(merged);
    } catch {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_NOTIFS);
        setItems(normalizeNotifs(safeParseArray(raw)));
      } catch {
        setItems([]);
      }
    }
  };

  const markAsRead = async (id: string) => {
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0 || items[idx].read) return;
    const next = [...items];
    next[idx] = { ...next[idx], read: true };
    await persist(next);
  };

  const openNotif = async (n: NotifItem) => {
    await markAsRead(n.id);

    if (n.relatedAppId) {
      router.push({
        pathname: ROUTE_TIMELINE,
        params: { id: n.relatedAppId },
      } as any);
      return;
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Big Header */}
      <View style={styles.headerWrap}>
        <Text style={styles.headerTitle}>Notification</Text>
      </View>

      {/* Teal gradient divider */}
      <LinearGradient
        colors={["#0B8F8B", "#6FB8B5", "#D4F3F2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientDivider}
      />

      {/* History label */}
      <View style={styles.historyRow}>
        <Text style={styles.historyLabel}>History</Text>
      </View>

      {/* Cards */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        {!hasResults ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="notifications-off-outline"
              size={28}
              color="#B0B0B0"
            />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>
              After you submit an application, notifications will appear here.
            </Text>
          </View>
        ) : (
          <>
            {items.map((n) => {
              const color = accentColor(n.category);

              return (
                <Pressable
                  key={n.id}
                  onPress={() => openNotif(n)}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && { opacity: 0.95, transform: [{ scale: 0.995 }] },
                  ]}
                >
                  {/* Left accent bar with category color */}
                  <View
                    style={[styles.leftAccent, { backgroundColor: color }]}
                  />

                  <View style={styles.cardContent}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {n.title}
                      </Text>
                      <Text style={styles.cardDate}>
                        {shortDate(n.createdAt)}
                      </Text>
                    </View>

                    <Text style={styles.cardBody}>{n.body}</Text>
                  </View>
                </Pressable>
              );
            })}

            <Text style={styles.endText}>End of Results</Text>
          </>
        )}
      </ScrollView>

      <BottomNavBar activeTab="notification" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  headerWrap: {
    paddingTop: 10,
    paddingBottom: 14,
    alignItems: "center",
    backgroundColor: BG,
  },
  headerTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 22,
    color: TEXT_DARK,
  },

  gradientDivider: {
    height: 3,
    width: "100%",
  },

  historyRow: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: BG,
  },
  historyLabel: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },

  body: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 140 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  leftAccent: {
    width: 5,
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  cardDate: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: MUTED,
    marginTop: 1,
  },
  cardBody: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 17,
    color: "#3A3A3A",
  },

  endText: {
    marginTop: 10,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: MUTED,
  },

  emptyWrap: { paddingTop: 40, alignItems: "center" },
  emptyTitle: {
    marginTop: 10,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  emptySub: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 17,
  },
});
