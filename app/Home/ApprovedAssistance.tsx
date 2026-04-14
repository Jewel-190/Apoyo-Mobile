import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

const FONT = "SF Pro Rounded";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const BORDER = "#E9EDED";
const TEAL = "#0B8F8B";

const BOOK2_PNG = require("../../assets/images/Book2.png");

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

type RequestDetailsRow = {
  id: string;
  status: string | null;
  request_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  additional_info: string | null;
};

type AuditStatusLogRow = {
  new_status: string | null;
  old_status: string | null;
  changed_at: string;
};

function firstParam(v?: string | string[]) {
  if (Array.isArray(v)) return (v[0] || "").toString();
  return (v || "").toString();
}

function normalizeRawStatus(raw?: string | null): string {
  const s = (raw || "").toString().trim().toLowerCase();
  if (!s) return "pending";
  if (s === "submitted") return "pending";
  if (s === "in_progress" || s === "inprogress" || s === "processing")
    return "in progress";
  if (s === "action_required") return "action required";
  return s;
}

function statusLabel(raw?: string | null): string {
  const s = normalizeRawStatus(raw);
  if (s === "pending") return "Pending";
  if (s === "in progress") return "In Progress";
  if (s === "action required") return "Action Required";
  if (s === "resubmitted") return "Resubmitted";
  if (s === "approved") return "Approved";
  if (s === "draft") return "Draft";
  return "Pending";
}

function tableForService(
  service?: string,
  title?: string,
  category?: Category
): RequestTableName | null {
  const s = (service || "").toLowerCase();
  const t = (title || "").toLowerCase();

  if (s === "hospitalization" || s === "hospital")
    return "hospitalization_requests";
  if (s === "treatment") return "treatment_requests";
  if (s === "medical") return "medical_requests";
  if (s === "financial") return "financial_requests";
  if (s === "monetary") return "monetary_requests";
  if (s === "burial-site" || s === "burial") return "burial_requests";
  if (s === "cremation") return "cremation_requests";
  if (s === "columbarium" || s === "colombarium")
    return "columbarium_requests";

  if (t.includes("hospitalization")) return "hospitalization_requests";
  if (t.includes("treatment")) return "treatment_requests";
  if (t.includes("monetary")) return "monetary_requests";
  if (t.includes("financial")) return "financial_requests";
  if (t.includes("cremation")) return "cremation_requests";
  if (t.includes("columbarium") || t.includes("colombarium"))
    return "columbarium_requests";
  if (t.includes("burial")) return "burial_requests";

  if (category === "medical") return "medical_requests";
  if (category === "financial") return "financial_requests";
  if (category === "burial") return "burial_requests";

  return null;
}

function formatDateTime(raw?: string | null) {
  if (!raw) return "-";
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return "-";
  const d = new Date(t);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} • ${time}`;
}

export default function ApprovedAssistance() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    title?: string | string[];
    status?: string | string[];
    category?: string | string[];
    requestCode?: string | string[];
    service?: string | string[];
  }>();

  const requestId = useMemo(() => {
    const rawId = firstParam(params?.id).trim();
    if (!rawId) return "";
    return rawId.startsWith("draft_") ? rawId.replace("draft_", "") : rawId;
  }, [params?.id]);
  const requestTitle = firstParam(params?.title).trim() || "Approved Request";
  const requestService = firstParam(params?.service).trim();
  const categoryRaw = firstParam(params?.category).toLowerCase();
  const category =
    categoryRaw === "medical" || categoryRaw === "financial" || categoryRaw === "burial"
      ? (categoryRaw as Category)
      : undefined;

  const requestTable = useMemo(
    () => tableForService(requestService, requestTitle, category),
    [requestService, requestTitle, category]
  );

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestRow, setRequestRow] = useState<RequestDetailsRow | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [attachmentStats, setAttachmentStats] = useState({
    total: 0,
    approved: 0,
    inProgress: 0,
    actionRequired: 0,
    resubmitted: 0,
  });

  const loadRequestDetails = useCallback(async () => {
    if (!requestId || !requestTable) {
      setIsLoading(false);
      setLoadError("No approved request context was provided.");
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from(requestTable)
        .select(
          "id,status,request_code,created_at,updated_at,submitted_at,additional_info"
        )
        .eq("id", requestId)
        .maybeSingle();

      if (error) throw error;
      setRequestRow((data as RequestDetailsRow | null) || null);

      const { data: auditData } = await supabase
        .from("audit_logs")
        .select("new_status,old_status,changed_at")
        .eq("request_table", requestTable)
        .eq("request_id", requestId)
        .order("changed_at", { ascending: false })
        .limit(25);

      const approvedEvent = ((auditData || []) as AuditStatusLogRow[]).find(
        (row) => normalizeRawStatus(row.new_status || row.old_status) === "approved"
      );
      setApprovedAt(approvedEvent?.changed_at || null);

      const { data: attachmentData } = await supabase
        .from("request_attachments")
        .select("status")
        .eq("request_table", requestTable)
        .eq("request_uid", requestId);

      const rows = (attachmentData || []) as Array<{ status: string | null }>;
      const stats = {
        total: rows.length,
        approved: 0,
        inProgress: 0,
        actionRequired: 0,
        resubmitted: 0,
      };

      for (const row of rows) {
        const s = normalizeRawStatus(row.status);
        if (s === "approved") stats.approved += 1;
        else if (s === "action required") stats.actionRequired += 1;
        else if (s === "resubmitted") stats.resubmitted += 1;
        else stats.inProgress += 1;
      }

      setAttachmentStats(stats);
    } catch (e) {
      console.log("Approved assistance details fetch failed:", e);
      setLoadError("Could not load approved request details.");
    } finally {
      setIsLoading(false);
    }
  }, [requestId, requestTable]);

  useFocusEffect(
    useCallback(() => {
      loadRequestDetails();
      return () => {};
    }, [loadRequestDetails])
  );

  const displayStatus = statusLabel(requestRow?.status || firstParam(params?.status));
  const displayRequestCode =
    (requestRow?.request_code || "").toString().trim() ||
    firstParam(params?.requestCode).trim() ||
    requestId ||
    "Pending assignment";
  const submittedAt = requestRow?.submitted_at || requestRow?.created_at;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
        </Pressable>
        <Text style={styles.topTitle}>Approved Request</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.loadingText}>Loading approved request...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Image source={BOOK2_PNG} style={styles.bookImg} resizeMode="contain" />

          <Text style={styles.title}>Request Approved</Text>
          <Text style={styles.subtitle}>{requestTitle}</Text>

          {loadError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.statusBadgeWrap}>
              <Text style={styles.statusBadge}>{displayStatus}</Text>
            </View>

            <InfoRow label="Request Code" value={displayRequestCode} />
            <InfoRow label="Service" value={requestTitle} />
            <InfoRow
              label="Submitted"
              value={formatDateTime(submittedAt)}
            />
            <InfoRow
              label="Approved"
              value={formatDateTime(approvedAt || requestRow?.updated_at)}
            />
            <InfoRow
              label="Last Updated"
              value={formatDateTime(requestRow?.updated_at)}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Attachment Summary</Text>
            <InfoRow label="Total Files" value={String(attachmentStats.total)} />
            <InfoRow label="Approved" value={String(attachmentStats.approved)} />
            <InfoRow
              label="In Progress"
              value={String(attachmentStats.inProgress)}
            />
            <InfoRow
              label="Action Required"
              value={String(attachmentStats.actionRequired)}
            />
            <InfoRow
              label="Resubmitted"
              value={String(attachmentStats.resubmitted)}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Additional Information</Text>
            <Text style={styles.additionalInfoText}>
              {(requestRow?.additional_info || "").toString().trim() ||
                "No additional information provided."}
            </Text>
          </View>

          <Pressable
            onPress={() => router.replace("/Home/Home")}
            style={({ pressed }) => [pressed && { opacity: 0.9 }]}
          >
            <LinearGradient
              colors={["#7BE05B", "#63C44A"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startBtn}
            >
              <Text style={styles.startBtnText}>Back to Home</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },

  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 16,
    color: TEXT_DARK,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 12,
    color: MUTED,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    alignItems: "center",
    gap: 12,
  },

  bookImg: {
    width: 96,
    height: 96,
    marginBottom: 2,
  },

  title: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 19,
    color: TEXT_DARK,
    textAlign: "center",
  },

  subtitle: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13.5,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
  },

  errorCard: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD3D3",
    backgroundColor: "#FFF2F2",
    padding: 12,
  },
  errorText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: "#AE3A3A",
    textAlign: "center",
  },

  card: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 9,
  },
  statusBadgeWrap: {
    alignItems: "flex-end",
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: "#C8F1C8",
    color: "#1F5D1F",
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10.5,
    overflow: "hidden",
  },
  sectionTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12.5,
    color: TEXT_DARK,
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLabel: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 11,
    color: MUTED,
  },
  infoValue: {
    maxWidth: "58%",
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 11,
    color: TEXT_DARK,
    textAlign: "right",
  },
  additionalInfoText: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 11.5,
    color: MUTED,
    lineHeight: 16,
  },

  startBtn: {
    height: 48,
    width: 220,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  startBtnText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
});
