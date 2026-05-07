import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomNavBar from "../../components/BottomNavBar";
import { supabase } from "../../lib/supabase";

const FONT = "SF Pro Rounded";

const BG = "#FFFFFF";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const CARD_BORDER = "#E2E8E8";
const TEAL = "#0B8F8B";

type Category = "medical" | "financial" | "burial";
type RequestTableName =
  | "hospitalization_requests"
  | "treatment_requests"
  | "medical_requests"
  | "financial_requests"
  | "monetary_requests"
  | "burial_requests"
  | "cremation_requests"
  | "columbarium_requests";

const ROUTE_TIMELINE = "/Status/StatusDetails";

type NotificationRow = {
  id: string;
  audit_log_id: string;
  request_id: string;
  request_table: RequestTableName;
  action?: string | null;
  is_read: boolean;
  old_status?: string | null;
  new_status?: string | null;
  created_at: string;
};

type NotifItem = {
  id: string;
  requestId: string;
  requestTable: RequestTableName;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  category: Category;
  service: string;
  requestTitle: string;
  status: string | null;
};

function accentColor(cat: Category): string {
  if (cat === "medical") return "#12B4D8";
  if (cat === "financial") return "#F2B600";
  return "#9B59D0";
}

function categoryFromRequestTable(requestTable: RequestTableName): Category {
  if (
    requestTable === "hospitalization_requests" ||
    requestTable === "treatment_requests" ||
    requestTable === "medical_requests"
  ) {
    return "medical";
  }

  if (
    requestTable === "financial_requests" ||
    requestTable === "monetary_requests"
  ) {
    return "financial";
  }

  return "burial";
}

function serviceFromRequestTable(requestTable: RequestTableName): string {
  switch (requestTable) {
    case "hospitalization_requests":
      return "hospitalization";
    case "treatment_requests":
      return "treatment";
    case "medical_requests":
      return "medical";
    case "financial_requests":
      return "financial";
    case "monetary_requests":
      return "monetary";
    case "burial_requests":
      return "burial";
    case "cremation_requests":
      return "cremation";
    case "columbarium_requests":
      return "columbarium";
    default:
      return "medical";
  }
}

function titleFromRequestTable(requestTable: RequestTableName): string {
  switch (requestTable) {
    case "hospitalization_requests":
      return "Hospitalization Expense";
    case "treatment_requests":
      return "Treatment & Procedures";
    case "medical_requests":
      return "Medical Operations";
    case "financial_requests":
      return "Emergency Financial Relief";
    case "monetary_requests":
      return "Monetary Burial Aid";
    case "burial_requests":
      return "Burial Site Assistance";
    case "cremation_requests":
      return "Cremation Assistance";
    case "columbarium_requests":
      return "Columbarium Allocation";
    default:
      return "Medical Operations";
  }
}

function toMillis(ts: string | null | undefined): number {
  if (!ts) return Date.now();
  const d = new Date(ts);
  const t = d.getTime();
  return Number.isFinite(t) ? t : Date.now();
}

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

function statusLabel(raw: string | null | undefined): string {
  const value = (raw || "").toString().trim();
  if (!value) return "Pending";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Opens request monitoring (documents cleared → approval pipeline). */
function opensApprovedAssistanceMonitoring(
  raw: string | null | undefined
): boolean {
  const value = (raw || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  return (
    value === "for approval" ||
    value === "scheduled" ||
    value === "approved" ||
    value === "accepted"
  );
}

function buildNotificationCopy(
  requestTitle: string,
  action: string | null | undefined,
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined
): { title: string; body: string } {
  const actionUpper = (action || "UPDATE").toString().toUpperCase();

  if (actionUpper === "INSERT") {
    return {
      title: `${requestTitle} Request Submitted`,
      body: `${requestTitle} request is now ${statusLabel(newStatus)}.`,
    };
  }

  if (actionUpper === "DELETE") {
    return {
      title: `${requestTitle} Request Deleted`,
      body: `${requestTitle} request has been deleted.`,
    };
  }

  return {
    title: `${requestTitle} Request Updated`,
    body: `Status changed from ${statusLabel(oldStatus)} to ${statusLabel(newStatus)}.`,
  };
}

function normalizeNotifications(rows: unknown[]): NotifItem[] {
  if (!Array.isArray(rows)) return [];

  const mapped = rows
    .map((row) => {
      const r = row as NotificationRow;
      const requestId = (r?.request_id || "").toString().trim();
      const requestTable = (r?.request_table || "").toString().trim() as
        | RequestTableName
        | "";

      if (!requestId || !requestTable) return null;

      const category = categoryFromRequestTable(requestTable as RequestTableName);
      const requestTitle = titleFromRequestTable(requestTable as RequestTableName);
      const copy = buildNotificationCopy(
        requestTitle,
        r?.action,
        r?.old_status,
        r?.new_status
      );

      return {
        id: String(r?.id || `notif_${requestId}`),
        requestId,
        requestTable: requestTable as RequestTableName,
        title: copy.title,
        body: copy.body,
        createdAt: toMillis(r?.created_at),
        read: !!r?.is_read,
        category,
        service: serviceFromRequestTable(requestTable as RequestTableName),
        requestTitle,
        status: r?.new_status ?? r?.old_status ?? null,
      } satisfies NotifItem;
    })
    .filter((x): x is NotifItem => x !== null)
    .sort((a, b) => b.createdAt - a.createdAt);

  const latestByRequest = new Map<string, NotifItem>();
  for (const notif of mapped) {
    if (!latestByRequest.has(notif.requestId)) {
      latestByRequest.set(notif.requestId, notif);
    }
  }

  return Array.from(latestByRequest.values()).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

async function fetchNotifications(): Promise<NotifItem[]> {
  const { data, error } = await supabase.functions.invoke("notifications", {
    body: { action: "list", limit: 80 },
  });

  if (error) {
    throw error;
  }

  return normalizeNotifications(data?.notifications || []);
}

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const hasResults = useMemo(() => items.length > 0, [items]);

  const load = async () => {
    setIsLoading(true);
    try {
      const remote = await fetchNotifications();
      setItems(remote);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openNotif = async (n: NotifItem) => {
    if (opensApprovedAssistanceMonitoring(n.status)) {
      router.push({
        pathname: "/Home/ApprovedAssistance",
        params: {
          id: n.requestId,
          title: n.requestTitle,
          status: statusLabel(n.status),
          category: n.category,
          createdAt: String(n.createdAt || ""),
          service: n.service,
        },
      } as any);
      return;
    }

    router.push({
      pathname: ROUTE_TIMELINE,
      params: {
        id: n.requestId,
        title: n.requestTitle,
        status: n.status || "Pending",
        category: n.category,
        service: n.service,
      },
    } as any);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.headerWrap}>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      <LinearGradient
        colors={["#0B8F8B", "#6FB8B5", "#D4F3F2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientDivider}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : !hasResults ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="notifications-off-outline"
              size={28}
              color="#B0B0B0"
            />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>
              Status updates from your requests will appear here.
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
                  <View style={[styles.leftAccent, { backgroundColor: color }]} />

                  <View style={styles.cardContent}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {n.title}
                      </Text>

                      <View style={styles.rightMeta}>
                        {!n.read ? (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>!</Text>
                          </View>
                        ) : null}
                        <Text style={styles.cardDate}>{shortDate(n.createdAt)}</Text>
                      </View>
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

      <BottomNavBar activeTab="notification" maskColor="transparent" />
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

  loadingWrap: {
    paddingTop: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 12,
    color: MUTED,
  },

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
  rightMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unreadBadge: {
    width: 16,
    height: 16,
    borderRadius: 99,
    backgroundColor: "#E13B3B",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 11,
    lineHeight: 12,
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
