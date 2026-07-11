import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomNavBar from "../../components/BottomNavBar";
import type { Category } from "@/AppCore/AppUiDomainTypes";
import { resolveServiceId } from "@/AppCore/CatalogLookupRuntime";
import { getService } from "@/AppCore/AssistanceServiceDefinitions";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { useNotifications } from "@/AppCore/NotificationsContext";
import { type NotificationItem as NotificationApiRow } from "@/AppCore/UserNotificationsQuery";
import { statusDisplayLabel } from "@/AppCore/RequestStatusPresentation";

const FONT = "SF Pro Rounded";

const BG = "#FFFFFF";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const CARD_BORDER = "#E2E8E8";
const TEAL = "#0B8F8B";

const ROUTE_TIMELINE = "/Status/StatusDetails";

type NotifItem = {
  id: string;
  requestId: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  category: Category;
  accentHex: string;
  service: string;
  requestTitle: string;
  status: string | null;
};

function defaultAccentHex(): string {
  return "#12B4D8";
}

function titleFromServiceKey(serviceKey: string): string {
  const clean = serviceKey.replace(/[-_]/g, " ").trim();
  if (!clean) return "Assistance Request";
  return clean.replace(/\b\w/g, (m) => m.toUpperCase());
}

function resolveServiceMeta(serviceKey: string | null | undefined): {
  serviceKey: string | null;
  category: Category;
  requestTitle: string;
} {
  const raw = (serviceKey || "").toString().trim();
  const sid = resolveServiceId(raw);
  const svc = sid ? getService(sid) : null;

  if (svc) {
    return {
      serviceKey: svc.id,
      category: svc.category,
      requestTitle: svc.label || titleFromServiceKey(svc.routeToken),
    };
  }

  if (sid) {
    return {
      serviceKey: sid,
      category: "medical",
      requestTitle: titleFromServiceKey(sid),
    };
  }

  return {
    serviceKey: null,
    category: "medical",
    requestTitle: "Assistance Request",
  };
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
      body: `${requestTitle} request is now ${statusDisplayLabel(newStatus)}.`,
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
    body: `Status changed from ${statusDisplayLabel(oldStatus)} to ${statusDisplayLabel(newStatus)}.`,
  };
}

function normalizeNotifications(
  rows: NotificationApiRow[],
  serviceKeyByRequestId: Record<string, string>,
  accentHexByServiceKey: Record<string, string>
): NotifItem[] {
  if (!Array.isArray(rows)) return [];

  const mapped = rows
    .map((row) => {
      const r = row as NotificationApiRow;
      const requestId = (r?.request_id || "").toString().trim();
      if (!requestId) return null;

      const serviceKey = serviceKeyByRequestId[requestId];
      const meta = resolveServiceMeta(serviceKey);
      const accentHex = meta.serviceKey
        ? accentHexByServiceKey[meta.serviceKey] ?? defaultAccentHex()
        : defaultAccentHex();
      const copy = buildNotificationCopy(
        meta.requestTitle,
        r?.action,
        r?.old_status,
        r?.new_status
      );

      return {
        id: String(r?.id || `notif_${requestId}`),
        requestId,
        title: copy.title,
        body: copy.body,
        createdAt: toMillis(r?.created_at),
        read: !!r?.is_read,
        category: meta.category,
        accentHex,
        service: meta.serviceKey ?? "",
        requestTitle: meta.requestTitle,
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

export default function Notifications() {
  const router = useRouter();
  const { bundle } = useAssistanceCatalog();
  const {
    items: rawRows,
    serviceKeyByRequestId,
    loading: isLoading,
    refresh,
    markRead,
  } = useNotifications();

  const [refreshing, setRefreshing] = React.useState(false);

  const accentHexByServiceKey = useMemo(() => {
    const map: Record<string, string> = {};
    const rt = bundle?.runtime;
    for (const svc of bundle?.services ?? []) {
      const hex =
        rt?.categoryThemeBySlug[svc.categorySlug]?.homeCardStripeGradient?.[0] ??
        defaultAccentHex();
      map[svc.id] = hex;
    }
    return map;
  }, [bundle]);

  const items = useMemo(
    () =>
      normalizeNotifications(rawRows, serviceKeyByRequestId, accentHexByServiceKey),
    [rawRows, serviceKeyByRequestId, accentHexByServiceKey]
  );

  const hasResults = useMemo(() => items.length > 0, [items]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openNotif = async (n: NotifItem) => {
    if (n.requestId) {
      void markRead(n.requestId);
    }
    if (opensApprovedAssistanceMonitoring(n.status)) {
      router.push({
        pathname: "/Home/ApprovedAssistance",
        params: {
          id: n.requestId,
          title: n.requestTitle,
          status: statusDisplayLabel(n.status),
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

  // Realtime keeps the list live; a light refresh on focus reconciles any
  // events missed while the socket was asleep (e.g. app resumed from background).
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={TEAL}
            colors={[TEAL]}
          />
        }
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
              const color = n.accentHex;

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
