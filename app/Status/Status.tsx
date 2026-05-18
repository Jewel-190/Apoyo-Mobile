// app/Status/Status.tsx

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  categoryCardTrimGradientForItem,
  enrichStatusApplicationItem,
  resolveServiceMobileImageUrl,
} from "@/AppCore/ServiceCatalogDisplay";
import { getCatalogLookupRuntime } from "@/AppCore/CatalogLookupRuntime";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { supabase } from "@/AppCore/SupabaseClient";
import {
  fetchStatusApplicationsFromServer,
  readStatusApplicationsCache,
  writeStatusApplicationsCache,
} from "@/AppCore/StatusApplicationsRepository";
import { useLatestAsyncSequence, useSingleFlight } from "@/AppCore/UseInteractionGuard";
import { getService } from "@/AppCore/AssistanceServiceDefinitions";
import { defaultServiceFormPath } from "@/AppCore/RequestPipelineRoutes";
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ApplicationItem } from "@/AppCore/AssistanceStatusApplicationsCache";
import type { Category, ServiceStatus } from "@/AppCore/AppUiDomainTypes";
import { statusBadgeTheme } from "@/AppCore/RequestStatusPresentation";
import BottomNavBar, { NAV_TOTAL_HEIGHT } from "../../components/BottomNavBar";

const FONT = "SF Pro Rounded";

/* ========= THEME ========= */
const BG = "#FFFFFF";
const TEXT_DARK = "#2B2B2B";
const BORDER = "#E6E6E6";
const DANGER = "#E45454";
const CANCEL_BG = "#BDBDBD";

const ROUTE_TIMELINE = "/Status/StatusDetails";
type FilterKey =
  | "all"
  | "pending"
  | "progress"
  | "action"
  | "resubmitted"
  | "forApproval"
  | "scheduled"
  /** Final DB `approved`; no chip — only listed under All. */
  | "approvedFinal"
  | "draft";

function statusToFilter(status: ServiceStatus): Exclude<FilterKey, "all"> {
  switch (status) {
    case "Pending":
      return "pending";
    case "In Progress":
      return "progress";
    case "Action Required":
      return "action";
    case "Resubmitted":
      return "resubmitted";
    case "For Approval":
      return "forApproval";
    case "Scheduled":
      return "scheduled";
    case "Approved":
      return "approvedFinal";
    case "Draft":
      return "draft";
  }
}

function StatusCardSkeleton() {
  return (
    <View style={styles.cardWrap}>
      <View style={[styles.card, styles.skeletonCard]}>
        <View style={styles.skeletonBar} />
        <View style={styles.cardTapArea}>
          <View style={styles.cardTopRow}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonBadge} />
          </View>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonMeta} />
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.skeletonDelete} />
        </View>
      </View>
    </View>
  );
}

function ServiceCardIcon({
  item,
  catalogReady,
}: {
  item: ApplicationItem;
  catalogReady: boolean;
}) {
  const iconUrl = useMemo(
    () =>
      resolveServiceMobileImageUrl({
        service: item.service,
        title: item.title,
        categorySlug: item.categorySlug,
        category: item.category,
      }),
    [item.service, item.title, item.categorySlug, item.category, catalogReady]
  );

  if (iconUrl) {
    return (
      <ExpoImage
        source={{ uri: iconUrl }}
        style={styles.icon}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={iconUrl}
      />
    );
  }

  if (!catalogReady && !iconUrl) {
    return <ActivityIndicator size="small" color="#6E7E7E" style={styles.icon} />;
  }

  return <Ionicons name="layers-outline" size={28} color="#6E7E7E" />;
}

function cardRequestId(item: ApplicationItem) {
  const code = (item.requestCode || "").toString().trim();
  if (code) return code;

  const id = (item.id || "").toString();
  return id.startsWith("draft_") ? id.replace("draft_", "") : id;
}

const PAD_X = 16;
const GAP = 12;
const { width } = Dimensions.get("window");
const CARD_W = (width - PAD_X * 2 - GAP) / 2;
const BODY_PAD_BOTTOM = NAV_TOTAL_HEIGHT + 26;

export default function Status() {
  const { bundle } = useAssistanceCatalog();
  const catalogReady = !!bundle?.runtime;
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApplicationItem | null>(null);

  const { inFlight: navigationBusy, run: runNavigation } = useSingleFlight();
  const loadSequence = useLatestAsyncSequence();

  const cardsReady = catalogReady && !isSyncing && !isLoading;

  const interactionsLocked =
    !cardsReady ||
    navigationBusy ||
    !!openingId ||
    !!deletingId ||
    isRefreshing;

  const loadApps = async ({ refresh = false }: { refresh?: boolean } = {}) => {
    const seq = loadSequence.begin();
    try {
      if (refresh) {
        if (loadSequence.isCurrent(seq)) setIsRefreshing(true);
      } else {
        const cached = await readStatusApplicationsCache();
        if (!loadSequence.isCurrent(seq)) return;
        if (cached.length > 0) {
          setApps(cached.map(enrichStatusApplicationItem));
          setIsLoading(false);
          if (!getCatalogLookupRuntime()) setIsSyncing(true);
        } else {
          setIsLoading(true);
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!loadSequence.isCurrent(seq)) return;

      const uid = sessionData?.session?.user?.id ?? null;
      if (!uid) {
        if (loadSequence.isCurrent(seq)) {
          setApps([]);
          setIsSyncing(false);
        }
        return;
      }

      const sorted = await fetchStatusApplicationsFromServer(uid);
      if (!loadSequence.isCurrent(seq)) return;

      const enriched = sorted.map(enrichStatusApplicationItem);
      setApps(enriched);
      await writeStatusApplicationsCache(enriched);
    } catch (err) {
      console.log("loadApps error:", err);
    } finally {
      if (loadSequence.isCurrent(seq)) {
        setIsLoading(false);
        setIsRefreshing(false);
        if (getCatalogLookupRuntime()) setIsSyncing(false);
      }
    }
  };

  useEffect(() => {
    if (!catalogReady) return;
    setApps((prev) => prev.map(enrichStatusApplicationItem));
    setIsSyncing(false);
  }, [catalogReady]);

  const onRefresh = useCallback(() => {
    loadApps({ refresh: true });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadApps();
    }, [])
  );

  /** Status cards never show CMS description — strip cached fields from older builds. */
  const cardApps = useMemo(
    () =>
      apps.map((a) => ({
        ...a,
        description: a.status === "Draft" ? "Continue your application" : "",
        descriptionHtml: undefined,
        descriptionFontFamily: undefined,
      })),
    [apps]
  );

  const filtered = useMemo(() => {
    if (activeFilter === "all") return cardApps;
    return cardApps.filter((a) => statusToFilter(a.status) === activeFilter);
  }, [activeFilter, cardApps]);

  const deleteRequestFromStatus = async (item: ApplicationItem) => {
    const realId = item.id.startsWith("draft_")
      ? item.id.replace("draft_", "")
      : item.id;

    try {
      setDeletingId(item.id);

      const { error } = await supabase
        .from("assistance_requests")
        .delete()
        .eq("id", realId);
      if (error) throw error;

      setApps((prev) => {
        const next = prev.filter((x) => x.id !== item.id);
        void writeStatusApplicationsCache(next);
        return next;
      });
    } catch (err: any) {
      Alert.alert("Delete Error", err?.message || "Failed to delete request");
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDeleteRequest = (item: ApplicationItem) => {
    setDeleteTarget(item);
    setDeleteConfirmOpen(true);
  };

  const cancelDeleteRequest = () => {
    if (deletingId) return;
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deletingId) return;
    await deleteRequestFromStatus(deleteTarget);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const openApplication = (item: ApplicationItem) => {
    if (interactionsLocked) return;

    void runNavigation(async () => {
      setOpeningId(item.id);
      try {
      if (item.status === "Draft") {
        const realId = item.id?.toString().startsWith("draft_")
          ? item.id.toString().replace("draft_", "")
          : item.id;

        const svc = getService(item.service);
        const pathname = svc?.requestRoute ?? defaultServiceFormPath();

        router.push({
          pathname,
          params: {
            requestId: String(realId),
            ...(svc?.id ? { serviceId: svc.id } : {}),
          },
        } as any);
        return;
      }

      if (
        item.status === "For Approval" ||
        item.status === "Scheduled" ||
        item.status === "Approved"
      ) {
        router.push({
          pathname: "/Home/ApprovedAssistance",
          params: {
            id: item.id,
            title: item.title,
            status: item.status,
            category: item.category,
            createdAt: String(item.createdAt ?? ""),
            requestCode: item.requestCode,
            service: item.service,
          },
        } as any);
        return;
      }

      router.push({
        pathname: ROUTE_TIMELINE,
        params: {
          id: item.id,
          title: item.title,
          status: item.status,
          category: item.category,
          createdAt: String(item.createdAt ?? ""),
          requestCode: item.requestCode,
          service: item.service,
        },
      } as any);
      } finally {
        setOpeningId(null);
      }
    });
  };

  const skeletonCount = useMemo(() => {
    const n = Math.max(apps.length, 4);
    return Math.min(n, 8);
  }, [apps.length]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Status</Text>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          <Chip
            active={activeFilter === "all"}
            label="All Application"
            icon="person-circle-outline"
            onPress={() => setActiveFilter("all")}
          />
          <Chip
            active={activeFilter === "pending"}
            label="Pending"
            icon="refresh"
            onPress={() => setActiveFilter("pending")}
          />
          <Chip
            active={activeFilter === "progress"}
            label="In Progress"
            icon="time-outline"
            onPress={() => setActiveFilter("progress")}
          />
          <Chip
            active={activeFilter === "action"}
            label="Action Required"
            icon="alert-circle-outline"
            onPress={() => setActiveFilter("action")}
          />
          <Chip
            active={activeFilter === "resubmitted"}
            label="Resubmitted"
            icon="refresh-circle-outline"
            onPress={() => setActiveFilter("resubmitted")}
          />
          <Chip
            active={activeFilter === "forApproval"}
            label="For approval"
            icon="checkmark-circle-outline"
            onPress={() => setActiveFilter("forApproval")}
          />
          <Chip
            active={activeFilter === "scheduled"}
            label="Scheduled"
            icon="calendar-outline"
            onPress={() => setActiveFilter("scheduled")}
          />
          <Chip
            active={activeFilter === "draft"}
            label="Draft"
            icon="document-outline"
            onPress={() => setActiveFilter("draft")}
          />
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#0B8F8B"
            colors={["#0B8F8B"]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        {isLoading && apps.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0B8F8B" />
            <Text style={styles.loadingText}>Loading your applications...</Text>
          </View>
        ) : !cardsReady && apps.length > 0 ? (
          <View style={styles.grid}>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <StatusCardSkeleton key={`status-skel-${i}`} />
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="document-text-outline" size={26} color="#B0B0B0" />
            <Text style={styles.emptyTitle}>No applications yet</Text>
            <Text style={styles.emptyDesc}>
              After you submit a request in a service form, it will appear here.
            </Text>
          </View>
        ) : (
          <View
            style={[styles.grid, interactionsLocked && styles.gridLocked]}
            pointerEvents={interactionsLocked ? "none" : "auto"}
          >
            {filtered.map((a) => {
              const isOpening = openingId === a.id;
              return (
              <View key={a.id} style={styles.cardWrap}>
                <View style={styles.card}>
                  <LinearGradient
                    colors={categoryCardTrimGradientForItem(a)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.cardTopBar}
                  />

                  <Pressable
                    onPress={() => openApplication(a)}
                    disabled={interactionsLocked}
                    style={({ pressed }) => [
                      styles.cardTapArea,
                      pressed && !interactionsLocked && { opacity: 0.96, transform: [{ scale: 0.99 }] },
                      interactionsLocked && styles.cardTapDisabled,
                    ]}
                  >
                    <View style={styles.cardTopRow}>
                      <ServiceCardIcon item={a} catalogReady={catalogReady} />
                      {(() => {
                        const theme = statusBadgeTheme(a.status);
                        return (
                          <View
                            style={[
                              styles.badge,
                              { backgroundColor: theme.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                { color: theme.text },
                              ]}
                            >
                              {a.status}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {a.title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {a.status !== "Draft"
                        ? "Request ID: " + cardRequestId(a)
                        : "Continue your application"}
                    </Text>

                    {isOpening ? (
                      <View style={styles.cardOpeningOverlay}>
                        <ActivityIndicator size="small" color="#0B8F8B" />
                      </View>
                    ) : null}
                  </Pressable>

                  <View style={styles.cardFooter}>
                    <Pressable
                      onPress={() => confirmDeleteRequest(a)}
                      disabled={interactionsLocked}
                      style={({ pressed }) => [
                        styles.cardDeleteBtn,
                        pressed && { opacity: 0.85 },
                        deletingId === a.id && { opacity: 0.6 },
                      ]}
                    >
                      <Ionicons
                        name={deletingId === a.id ? "hourglass-outline" : "trash-outline"}
                        size={15}
                        color="#FFFFFF"
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
            })}
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={deleteConfirmOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={cancelDeleteRequest}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Ionicons name="trash-outline" size={52} color={DANGER} style={styles.modalTrashIcon} />

            <Text style={styles.modalTitle}>Delete this request?</Text>

            <Text style={styles.modalSub}>
              "{deleteTarget?.title || "Request"}"{"\n"}
              This action cannot be undone.
            </Text>

            <View style={styles.modalBtns}>
              <Pressable
                onPress={cancelDeleteRequest}
                disabled={!!deletingId}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && { opacity: 0.9 },
                  !!deletingId && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmDelete}
                disabled={!!deletingId}
                style={({ pressed }) => [
                  styles.removeBtn,
                  pressed && { opacity: 0.9 },
                  !!deletingId && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.removeText}>
                  {deletingId ? "Deleting..." : "Delete"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNavBar activeTab="status" maskColor="transparent" />
    </SafeAreaView>
  );
}

function Chip({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.chipShadow}>
      <View style={styles.chipBase}>
        {active ? (
          <LinearGradient
            colors={["#0B8F8B", "#73C46B"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Ionicons
          name={icon}
          size={16}
          color={active ? "#FFFFFF" : "#7F7F7F"}
        />
        <Text style={[styles.chipText, active && { color: "#FFFFFF" }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
  headerTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
    fontSize: 14,
  },

  chipsWrap: {
    backgroundColor: BG,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    zIndex: 10,
  },
  filtersRow: { paddingHorizontal: PAD_X, marginVertical: 5, gap: 10, alignItems: "center" },

  chipShadow: {
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  chipBase: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
  },
  chipText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12,
    color: "#222",
  },

  body: {
    flexGrow: 1,
    paddingHorizontal: PAD_X,
    paddingTop: 10,
    paddingBottom: BODY_PAD_BOTTOM,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridLocked: {
    opacity: 0.88,
  },
  cardWrap: { width: CARD_W, marginBottom: 12 },
  skeletonCard: {
    borderColor: "#ECECEC",
    backgroundColor: "#FAFBFB",
  },
  skeletonBar: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    height: 4,
    backgroundColor: "#D8E8E8",
  },
  skeletonIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#E8EEEE",
  },
  skeletonBadge: {
    width: 72,
    height: 22,
    borderRadius: 10,
    backgroundColor: "#E8EEEE",
  },
  skeletonTitle: {
    height: 14,
    width: "88%",
    borderRadius: 6,
    backgroundColor: "#E8EEEE",
    marginBottom: 8,
  },
  skeletonMeta: {
    height: 10,
    width: "62%",
    borderRadius: 5,
    backgroundColor: "#F0F2F2",
  },
  skeletonDelete: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E8EEEE",
  },
  cardOpeningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9E9E9",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
    overflow: "hidden",
    minHeight: 128,
  },
  cardTapArea: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    position: "relative",
  },
  cardTapDisabled: { opacity: 0.72 },
  cardTopBar: { position: "absolute", left: 0, top: 0, right: 0, height: 4 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 10,
  },
  icon: { width: 38, height: 38, resizeMode: "contain" },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10,
  },

  cardTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    color: TEXT_DARK,
    marginBottom: 6,
  },
  cardMeta: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 9.5,
    color: "#6A6A6A",
    marginBottom: 6,
  },
  cardFooter: {
    marginTop: 8,
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F3F3",
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  cardDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: DANGER,
    justifyContent: "center",
    alignItems: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalTrashIcon: {
    marginBottom: 10,
  },
  modalTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    color: TEXT_DARK,
    textAlign: "center",
    lineHeight: 18,
  },
  modalSub: {
    marginTop: 8,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    color: "#6E7E7E",
    textAlign: "center",
    lineHeight: 17,
  },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: CANCEL_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12.5,
    color: "#FFFFFF",
  },
  removeBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12.5,
    color: "#FFFFFF",
  },

  loadingWrap: {
    width: "100%",
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: "#5F5F5F",
  },

  emptyWrap: {
    width: "100%",
    paddingTop: 26,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  emptyDesc: {
    marginTop: 6,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 11.5,
    lineHeight: 16,
    color: "#666",
  },
});
