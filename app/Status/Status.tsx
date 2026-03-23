// app/Status/Status.tsx

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomNavBar, { NAV_TOTAL_HEIGHT, TabKey } from "../../components/BottomNavBar";

const FONT = "SF Pro Rounded";

/* ========= THEME ========= */
const BG = "#FFFFFF";
const TEXT_DARK = "#2B2B2B";
const BORDER = "#E6E6E6";
const DANGER = "#E45454";
const CANCEL_BG = "#BDBDBD";

/* ========= BADGE COLORS ========= */
const BADGE_PENDING = "#E8C6FF";
const BADGE_PROGRESS = "#B9E3FF";
const BADGE_ACTION = "#FFD59E";
const BADGE_APPROVED = "#C8F1C8";
const BADGE_DRAFT = "#D4D4D4";

/* ========= STORAGE + ROUTES ========= */
const STORAGE_KEY_VERIFIED_V2 = "apoyo_verified_v2";
const STORAGE_KEY_VERIFIED_V1 = "apoyo_verified_v1";
const CACHE_USER = "apoyo_user_cache";

const ROUTE_TIMELINE = "/Status/StatusDetails";
const STORAGE_KEY_STATUS_LIST = "apoyo_status_applications_v1";

/* ========= ICONS ========= */
const ICON_HOSPITAL = require("../../assets/images/Hospital.png");
const ICON_TREATMENT = require("../../assets/images/Treatment.png");
const ICON_MEDICAL = require("../../assets/images/Medical.png");
const ICON_FINANCIAL = require("../../assets/images/Financial.png");
const ICON_MONETARY = require("../../assets/images/Monetary.png");
const ICON_BURIAL = require("../../assets/images/Burial.png");
const ICON_CREMATION = require("../../assets/images/Cremation.png");
const ICON_COLOMBARIUM = require("../../assets/images/Colombarium.png");

type FilterKey = "all" | "pending" | "progress" | "action" | "approved" | "draft";
type Category = "medical" | "financial" | "burial";
type ServiceStatus = "Pending" | "In Progress" | "Action Required" | "Approved" | "Draft";

type ApplicationItem = {
  id: string;
  title: string;
  description: string;
  status: ServiceStatus;
  category: Category;
  service?: string;
  createdAt?: number;
};

// Normalize raw DB/cached status values to `ServiceStatus`
function normalizeStatus(raw?: string): ServiceStatus {
  if (!raw) return "Pending";
  const s = raw.toString().trim().toLowerCase();
  if (s === "submitted" || s === "pending") return "Pending";
  if (s === "in progress" || s === "in_progress" || s === "inprogress" || s === "processing") return "In Progress";
  if (s === "action required" || s === "action_required" || s === "action") return "Action Required";
  if (s === "approved" || s === "accepted") return "Approved";
  if (s === "draft") return "Draft";
  // fallback: if it already matches one of our labels
  if (s === "pending" ) return "Pending";
  return "Pending";
}

function badgeColor(status: ServiceStatus) {
  switch (status) {
    case "Pending":
      return BADGE_PENDING;
    case "In Progress":
      return BADGE_PROGRESS;
    case "Action Required":
      return BADGE_ACTION;
    case "Approved":
      return BADGE_APPROVED;
    case "Draft":
      return BADGE_DRAFT;
    default:
      return "#EEE";
  }
}

function statusToFilter(status: ServiceStatus): Exclude<FilterKey, "all"> {
  switch (status) {
    case "Pending":
      return "pending";
    case "In Progress":
      return "progress";
    case "Action Required":
      return "action";
    case "Approved":
      return "approved";
    case "Draft":
      return "draft";
  }
}

function topBarGradient(category?: Category): [string, string] {
  switch (category) {
    case "medical":
      return ["#12B4D8", "#2AC8EE"];
    case "financial":
      return ["#F6D34D", "#F2B600"];
    case "burial":
      return ["#FF2DF7", "#7B61FF"];
    default:
      return ["#12B4D8", "#2AC8EE"];
  }
}

function iconForTitle(title: string) {
  const t = (title || "").toLowerCase();

  if (t.includes("hospitalization")) return ICON_HOSPITAL;
  if (t.includes("treatment")) return ICON_TREATMENT;
  if (t.includes("medical")) return ICON_MEDICAL;
  if (t.includes("operations")) return ICON_MEDICAL;
  if (t.includes("monetary")) return ICON_MONETARY;
  if (t.includes("emergency financial")) return ICON_FINANCIAL;
  if (t.includes("financial")) return ICON_FINANCIAL;
  if (t.includes("cremation")) return ICON_CREMATION;
  if (t.includes("colombarium") || t.includes("columbarium"))
    return ICON_COLOMBARIUM;
  if (t.includes("burial")) return ICON_BURIAL;

  return ICON_HOSPITAL;
}

const PAD_X = 16;
const GAP = 12;
const { width } = Dimensions.get("window");
const CARD_W = (width - PAD_X * 2 - GAP) / 2;
const BODY_PAD_BOTTOM = NAV_TOTAL_HEIGHT + 26;

export default function Status() {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApplicationItem | null>(null);

  const loadVerified = async () => {
    try {
      // Keep UI responsive by using cached profile first.
      const cached = await AsyncStorage.getItem(CACHE_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed?.verified === "boolean") {
          setVerified(parsed.verified);
        }
      }

      // Then refresh from source of truth in DB.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data } = await supabase
          .from("users")
          .select("verified")
          .eq("id", user.id)
          .single();

        if (typeof data?.verified === "boolean") {
          setVerified(data.verified === true);

          try {
            const current = await AsyncStorage.getItem(CACHE_USER);
            const next = current ? JSON.parse(current) : {};
            next.verified = data.verified === true;
            await AsyncStorage.setItem(CACHE_USER, JSON.stringify(next));
          } catch {}
          return;
        }
      }
    } catch {}

    // Legacy fallback for older installs that still rely on v1/v2 flags.
    const v2 = await AsyncStorage.getItem(STORAGE_KEY_VERIFIED_V2);
    const v1 = await AsyncStorage.getItem(STORAGE_KEY_VERIFIED_V1);
    setVerified(v2 === "1" || v1 === "1");
  };

  // Fetch drafts and recent submitted hospitalization_requests and treatment_requests for this user
  const fetchDraftsFromSupabase = async (): Promise<ApplicationItem[]> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return [];
      // hospitalization requests
      const [{ data: hospData, error: hospError } = {} as any] = [
        await supabase
          .from("hospitalization_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      // treatment requests
      const [{ data: treatData, error: treatError } = {} as any] = [
        await supabase
          .from("treatment_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      // medical requests
      const [{ data: medData, error: medError } = {} as any] = [
        await supabase
          .from("medical_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      // financial requests
      const [{ data: finData, error: finError } = {} as any] = [
        await supabase
          .from("financial_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      // monetary requests
      const [{ data: monData, error: monError } = {} as any] = [
        await supabase
          .from("monetary_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      // burial site requests
      const [{ data: burData, error: burError } = {} as any] = [
        await supabase
          .from("burial_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      // cremation requests
      const [{ data: creData, error: creError } = {} as any] = [
        await supabase
          .from("cremation_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      // columbarium requests
      const [{ data: colData, error: colError } = {} as any] = [
        await supabase
          .from("columbarium_requests")
          .select("id, status, created_at, updated_at")
          .eq("user_id", userData.user.id)
          .in("status", ["draft", "submitted"]),
      ];

      const items: ApplicationItem[] = [];

      if (hospData && !hospError) {
        for (const row of hospData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Hospitalization Draft" : "Hospitalization Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "medical" as Category,
            service: "hospitalization",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      if (treatData && !treatError) {
        for (const row of treatData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Treatment Draft" : "Treatment Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "medical" as Category,
            service: "treatment",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      if (medData && !medError) {
        for (const row of medData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Medical Draft" : "Medical Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "medical" as Category,
            service: "medical",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      if (finData && !finError) {
        for (const row of finData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Financial Draft" : "Financial Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "financial" as Category,
            service: "financial",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      if (monData && !monError) {
        for (const row of monData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Monetary Burial Aid Draft" : "Monetary Burial Aid Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "financial" as Category,
            service: "monetary",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      if (burData && !burError) {
        for (const row of burData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Burial Site Assistance Draft" : "Burial Site Assistance Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "burial" as Category,
            service: "burial-site",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      if (creData && !creError) {
        for (const row of creData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Cremation Assistance Draft" : "Cremation Assistance Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "burial" as Category,
            service: "cremation",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      if (colData && !colError) {
        for (const row of colData) {
          const rawStatus = (row.status || "").toString();
          const isDraft = rawStatus.trim().toLowerCase() === "draft";
          const status = isDraft ? "Draft" : normalizeStatus(rawStatus);
          const id = isDraft ? `draft_${row.id}` : row.id?.toString();

          items.push({
            id,
            title: isDraft ? "Columbarium Allocation Draft" : "Columbarium Allocation Request",
            description: isDraft ? "Continue your application" : "View application status",
            status: status as ServiceStatus,
            category: "burial" as Category,
            service: "colombarium",
            createdAt: new Date(row.updated_at || row.created_at).getTime(),
          });
        }
      }

      return items;
    } catch {
      return [];
    }
  };

  const loadApps = async ({ refresh = false }: { refresh?: boolean } = {}) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // Try to load cached apps first for instant UI
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_STATUS_LIST);
        if (raw) {
          const cached = JSON.parse(raw) as any[];
          const normalized = cached.map((x) => ({
            ...x,
            status: normalizeStatus(x?.status as string),
          })) as ApplicationItem[];
          setApps(normalized.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
        }
      } catch {}

      // Fetch fresh data directly from DB every time.
      const drafts = await fetchDraftsFromSupabase();
      // ensure statuses normalized (drafts are already Draft)
      const normalizedDrafts = drafts.map((d) => ({ ...d, status: normalizeStatus(d.status as string) }));
      const sorted = normalizedDrafts.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setApps(sorted);
      try {
        await AsyncStorage.setItem(STORAGE_KEY_STATUS_LIST, JSON.stringify(sorted));
      } catch {}
    } catch (err) {
      console.log("loadApps error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadApps({ refresh: true });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVerified();
      loadApps();
    }, [])
  );

  const handleBeforeNavigate = (tabKey: TabKey, route: string): boolean => {
    if (!verified) {
      alert("Please verify your account to access this feature.");
      return false;
    }
    return true;
  };

  const filtered = useMemo(() => {
    if (activeFilter === "all") return apps;
    return apps.filter((a) => statusToFilter(a.status) === activeFilter);
  }, [activeFilter, apps]);

  const deleteRequestFromStatus = async (item: ApplicationItem) => {
    const tableByService: Record<string, string> = {
      hospitalization: "hospitalization_requests",
      treatment: "treatment_requests",
      medical: "medical_requests",
      financial: "financial_requests",
      monetary: "monetary_requests",
      "burial-site": "burial_requests",
      cremation: "cremation_requests",
      colombarium: "columbarium_requests",
      columbarium: "columbarium_requests",
    };

    const table = tableByService[item.service || "hospitalization"];
    if (!table) {
      Alert.alert("Delete Error", "Unsupported request type.");
      return;
    }

    const realId = item.id.startsWith("draft_")
      ? item.id.replace("draft_", "")
      : item.id;

    try {
      setDeletingId(item.id);
      const { error } = await supabase.from(table).delete().eq("id", realId);
      if (error) throw error;

      setApps((prev) => {
        const next = prev.filter((x) => x.id !== item.id);
        AsyncStorage.setItem(STORAGE_KEY_STATUS_LIST, JSON.stringify(next)).catch(() => {});
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
    if (!deleteTarget) return;
    await deleteRequestFromStatus(deleteTarget);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

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
            active={activeFilter === "approved"}
            label="Approved"
            icon="checkmark-circle-outline"
            onPress={() => setActiveFilter("approved")}
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
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0B8F8B" />
            <Text style={styles.loadingText}>Loading your applications...</Text>
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
          <View style={styles.grid}>
            {filtered.map((a) => (
              <View key={a.id} style={styles.cardWrap}>
                <View style={styles.card}>
                  <LinearGradient
                    colors={topBarGradient(a.category)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.cardTopBar}
                  />

                  <Pressable
                    onPress={() => {
                      if (!verified) {
                        alert(
                          "Please verify your account to access this feature."
                        );
                        return;
                      }

                      // If it's a draft, navigate to the appropriate form to continue editing
                      if (a.status === "Draft") {
                        // a.id is prefixed with 'draft_' so strip it to get the real request id
                        const realId = a.id?.toString().startsWith("draft_")
                          ? a.id.toString().replace("draft_", "")
                          : a.id;

                        // route based on service type
                        if (a.service === "medical") {
                          router.push({
                            pathname: "/Home/Medical/MedicalReq",
                            params: { requestId: realId },
                          } as any);
                          return;
                        }

                        if (a.service === "treatment") {
                          router.push({
                            pathname: "/Home/Treatment/TreatmentReq",
                            params: { requestId: realId },
                          } as any);
                          return;
                        }

                        if (a.service === "financial") {
                          router.push({
                            pathname: "/Home/Financial/FinancialReq",
                            params: { requestId: realId },
                          } as any);
                          return;
                        }

                        if (a.service === "monetary") {
                          router.push({
                            pathname: "/Home/Monetary/MonetaryReq",
                            params: { requestId: realId },
                          } as any);
                          return;
                        }

                        if (a.service === "burial-site") {
                          router.push({
                            pathname: "/Home/Burial/BurialReq",
                            params: { requestId: realId, serviceId: "burial-site" },
                          } as any);
                          return;
                        }

                        if (a.service === "cremation") {
                          router.push({
                            pathname: "/Home/Cremation/CremationReq",
                            params: { requestId: realId, serviceId: "cremation" },
                          } as any);
                          return;
                        }

                        if (a.service === "colombarium") {
                          router.push({
                            pathname: "/Home/Columbarium/ColumbariumReq",
                            params: { requestId: realId, serviceId: "colombarium" },
                          } as any);
                          return;
                        }

                        // default to hospitalization
                        router.push({
                          pathname: "/Home/Hospitalization/HospitalizationReq",
                          params: { requestId: realId },
                        } as any);
                        return;
                      }

                      // For submitted applications, go to status details
                      router.push({
                        pathname: ROUTE_TIMELINE,
                        params: {
                          id: a.id,
                          title: a.title,
                          status: a.status,
                          category: a.category,
                          createdAt: String(a.createdAt ?? ""),
                        },
                      } as any);
                    }}
                    style={({ pressed }) => [
                      styles.cardTapArea,
                      pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
                    ]}
                  >
                    <View style={styles.cardTopRow}>
                      <Image source={iconForTitle(a.title)} style={styles.icon} />
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: badgeColor(a.status) },
                        ]}
                      >
                        <Text style={styles.badgeText}>{a.status}</Text>
                      </View>
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {a.title}
                    </Text>
                    <Text style={styles.cardDesc} numberOfLines={3}>
                      {a.description}
                    </Text>
                  </Pressable>

                  <View style={styles.cardFooter}>
                    <Pressable
                      onPress={() => confirmDeleteRequest(a)}
                      disabled={deletingId === a.id}
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
            ))}
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

      <BottomNavBar activeTab="status" maskColor="transparent" onBeforeNavigate={handleBeforeNavigate} />
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
  cardWrap: { width: CARD_W, marginBottom: 12 },

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
    minHeight: 164,
  },
  cardTapArea: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
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
    fontSize: 9,
    color: "#333",
  },

  cardTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    color: TEXT_DARK,
    marginBottom: 6,
  },
  cardDesc: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.8,
    lineHeight: 14.5,
    color: "#3A3A3A",
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
