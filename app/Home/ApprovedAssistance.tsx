import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  formatCaseStudyDateTimeDisplay,
  formatDateLong,
} from "../../lib/caseStudySchedule";
import { supabase } from "../../lib/supabase";

const FONT = "SF Pro Rounded";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const BORDER = "#E9EDED";
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

type MonitoringPhase = "forApproval" | "scheduled" | "approved";

type RequestDetailsRow = {
  id: string;
  status: string | null;
  request_code: string | null;
  user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  additional_info: string | null;
  case_study_date?: string | null;
  coverage?: string | null;
  financial_request_type?: string | null;
};

type ProfileRow = {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  birth_date: string | null;
  sex: string | null;
};

type AuditStatusLogRow = {
  new_status: string | null;
  old_status: string | null;
  changed_at: string;
};

const COVERAGE_TABLES = new Set<RequestTableName>([
  "burial_requests",
  "cremation_requests",
]);

function firstParam(v?: string | string[]) {
  if (Array.isArray(v)) return (v[0] || "").toString();
  return (v || "").toString();
}

function normalizeRawStatus(raw?: string | null): string {
  const s = (raw || "").toString().trim().toLowerCase().replace(/_/g, " ");
  if (!s) return "pending";
  if (s === "submitted") return "pending";
  if (s === "inprogress" || s === "processing") return "in progress";
  if (s === "action required") return "action required";
  return s;
}

function statusLabel(raw?: string | null): string {
  const s = normalizeRawStatus(raw);
  if (s === "pending") return "Pending";
  if (s === "in progress") return "In Progress";
  if (s === "action required") return "Action Required";
  if (s === "resubmitted") return "Resubmitted";
  if (s === "for approval") return "For Approval";
  if (s === "scheduled") return "Scheduled";
  if (s === "approved") return "Approved";
  if (s === "accepted") return "Approved";
  if (s === "draft") return "Draft";
  return "Pending";
}

function monitoringPhaseFromRaw(raw?: string | null): MonitoringPhase {
  const s = normalizeRawStatus(raw);
  if (s === "approved" || s === "accepted") return "approved";
  if (s === "scheduled") return "scheduled";
  return "forApproval";
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

function selectColumnsForTable(table: RequestTableName): string {
  const base =
    "id,status,request_code,user_id,created_at,updated_at,submitted_at,additional_info,case_study_date";
  const withCoverage = COVERAGE_TABLES.has(table)
    ? `${base},coverage`
    : base;
  return table === "financial_requests"
    ? `${withCoverage},financial_request_type`
    : withCoverage;
}

function formatDateTime(raw?: string | null) {
  if (!raw) return "—";
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return "—";
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

function buildDisplayName(p: ProfileRow | null): string {
  if (!p) return "—";
  const parts = [
    p.first_name,
    p.middle_name,
    p.last_name,
    p.suffix,
  ].filter((x) => String(x || "").trim());
  return parts.length ? parts.join(" ") : "—";
}

function statusBadgeColors(displayLabel: string): { bg: string; fg: string } {
  const key = displayLabel.trim().toLowerCase();
  if (key === "for approval") return { bg: "#C8EDE9", fg: "#0D5C58" };
  if (key === "scheduled") return { bg: "#D8E6FA", fg: "#2F4F7A" };
  if (key === "approved") return { bg: "#C8F1C8", fg: "#1F5D1F" };
  return { bg: "#E8E8E8", fg: TEXT_DARK };
}

function InterviewStepsCard({ applicationId }: { applicationId: string }) {
  const code = (applicationId || "").trim() || "—";
  return (
    <View style={styles.stepsCard}>
      <View style={styles.stepsHeader}>
        <Ionicons name="list-outline" size={22} color={TEAL} />
        <View style={{ flex: 1 }}>
          <Text style={styles.stepsTitle}>Interview steps</Text>
          <Text style={styles.stepsSubtitle}>What to do on your visit</Text>
        </View>
      </View>
      <View style={styles.stepRow}>
        <Ionicons name="checkmark-circle" size={18} color={TEAL} />
        <Text style={styles.stepText}>
          <Text style={styles.stepBold}>Step 1: </Text>
          Visit the Socio-Economic and Multi-Purpose Building Barangay Burol Main,
          City of Dasmariñas, Cavite.
        </Text>
      </View>
      <View style={styles.stepRow}>
        <Ionicons name="checkmark-circle" size={18} color="#06C1EC" />
        <Text style={styles.stepText}>
          <Text style={styles.stepBold}>Step 2: </Text>
          Present your Application Number:{" "}
          <Text style={styles.stepMono}>{code}</Text>
        </Text>
      </View>
      <View style={styles.stepRow}>
        <Ionicons name="checkmark-circle" size={18} color={TEAL} />
        <Text style={styles.stepText}>
          <Text style={styles.stepBold}>Step 3: </Text>
          Bring one (1) original valid ID for verification.
        </Text>
      </View>
      <Text style={styles.officeHours}>
        Office hours: Monday – Friday, 8:00 AM to 5:00 PM.
      </Text>
    </View>
  );
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
  const requestTitle = firstParam(params?.title).trim() || "Assistance request";
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

  useEffect(() => {
    if (!requestId) return;

    let active = true;

    (async () => {
      try {
        await supabase.functions.invoke("notifications", {
          body: {
            action: "mark-read",
            requestId,
          },
        });
      } catch (e) {
        if (active) {
          console.log("Approved assistance notification read sync failed:", e);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [requestId]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestRow, setRequestRow] = useState<RequestDetailsRow | null>(null);
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [forApprovalAt, setForApprovalAt] = useState<string | null>(null);
  const [finalApprovedAt, setFinalApprovedAt] = useState<string | null>(null);
  const [attachmentStats, setAttachmentStats] = useState({
    total: 0,
    approved: 0,
    inProgress: 0,
    actionRequired: 0,
    resubmitted: 0,
  });

  const loadRequestDetails = useCallback(async (opts?: { refresh?: boolean }) => {
    const refresh = opts?.refresh === true;

    if (!requestId || !requestTable) {
      setIsLoading(false);
      setIsRefreshing(false);
      setLoadError("No request context was provided.");
      return;
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    try {
      const cols = selectColumnsForTable(requestTable);
      const { data, error } = await supabase
        .from(requestTable)
        .select(cols)
        .eq("id", requestId)
        .maybeSingle();

      if (error) throw error;
      const row = (data as RequestDetailsRow | null) || null;
      setRequestRow(row);

      if (row?.user_id) {
        const { data: prof, error: profErr } = await supabase
          .from("users")
          .select(
            "first_name,middle_name,last_name,suffix,contact_number,email,address,birth_date,sex"
          )
          .eq("id", row.user_id)
          .maybeSingle();
        if (!profErr && prof) {
          setProfileRow(prof as ProfileRow);
        } else {
          setProfileRow(null);
        }
      } else {
        setProfileRow(null);
      }

      const { data: auditData } = await supabase
        .from("audit_logs")
        .select("new_status,old_status,changed_at")
        .eq("request_table", requestTable)
        .eq("request_id", requestId)
        .order("changed_at", { ascending: false })
        .limit(40);

      const auditRows = (auditData || []) as AuditStatusLogRow[];

      const faEvent = auditRows.find(
        (r) => normalizeRawStatus(r.new_status) === "for approval"
      );
      setForApprovalAt(faEvent?.changed_at || null);

      const apprEvent = auditRows.find(
        (r) => normalizeRawStatus(r.new_status) === "approved"
      );
      setFinalApprovedAt(apprEvent?.changed_at || null);

      const { data: attachmentData } = await supabase
        .from("request_attachments")
        .select("status")
        .eq("request_table", requestTable)
        .eq("request_uid", requestId);

      const rowsAtt = (attachmentData || []) as { status: string | null }[];
      const stats = {
        total: rowsAtt.length,
        approved: 0,
        inProgress: 0,
        actionRequired: 0,
        resubmitted: 0,
      };

      for (const ar of rowsAtt) {
        const s = normalizeRawStatus(ar.status);
        if (s === "approved") stats.approved += 1;
        else if (s === "action required") stats.actionRequired += 1;
        else if (s === "resubmitted") stats.resubmitted += 1;
        else stats.inProgress += 1;
      }

      setAttachmentStats(stats);
    } catch (e) {
      console.log("Approved assistance details fetch failed:", e);
      setLoadError("Could not load request details.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [requestId, requestTable]);

  const onRefresh = useCallback(() => {
    void loadRequestDetails({ refresh: true });
  }, [loadRequestDetails]);

  useFocusEffect(
    useCallback(() => {
      loadRequestDetails();
      return () => {};
    }, [loadRequestDetails])
  );

  const displayStatus = statusLabel(requestRow?.status || firstParam(params?.status));
  const phase: MonitoringPhase = monitoringPhaseFromRaw(
    requestRow?.status || firstParam(params?.status)
  );

  const displayRequestCode =
    (requestRow?.request_code || "").toString().trim() ||
    firstParam(params?.requestCode).trim() ||
    requestId ||
    "Pending assignment";

  const submittedAt = requestRow?.submitted_at || requestRow?.created_at;
  const scheduledIso = (requestRow?.case_study_date || "").toString().trim();
  const scheduledDisplay = formatCaseStudyDateTimeDisplay(
    scheduledIso || null
  );

  const coverageText = (requestRow?.coverage || "").toString().trim();
  const financialType = (requestRow?.financial_request_type || "")
    .toString()
    .trim();

  const topTitle =
    phase === "approved"
      ? "Approved"
      : phase === "scheduled"
        ? "Interview"
        : "Request monitoring";

  const heroIcon =
    phase === "approved"
      ? ("trophy" as const)
      : phase === "scheduled"
        ? ("calendar" as const)
        : ("hourglass-outline" as const);

  const heroColor =
    phase === "approved"
      ? "#63C44A"
      : phase === "scheduled"
        ? "#2F6FED"
        : TEAL;

  const headline =
    phase === "approved"
      ? "Congratulations!"
      : phase === "scheduled"
        ? "Your case study is scheduled"
        : "Almost there";

  const subhead =
    phase === "approved"
      ? "Your assistance request has been fully approved."
      : phase === "scheduled"
        ? "Review the date and time below and follow the steps when you arrive."
        : "Your documents are verified. Please wait while staff completes final review.";

  const badgeColors = statusBadgeColors(displayStatus);

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
        <Text style={styles.topTitle}>{topTitle}</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.loadingText}>Loading your request…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={TEAL}
              colors={[TEAL]}
              progressBackgroundColor="#FFFFFF"
            />
          }
        >
          <View style={[styles.heroIconWrap, { borderColor: `${heroColor}33` }]}>
            <Ionicons name={heroIcon} size={44} color={heroColor} />
          </View>

          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.subtitle}>{subhead}</Text>
          <Text style={styles.serviceTitle}>{requestTitle}</Text>

          {loadError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          ) : null}

          {/* Phase callout */}
          {phase === "forApproval" ? (
            <View style={[styles.callout, styles.calloutTeal]}>
              <Ionicons name="information-circle-outline" size={22} color="#0D5C58" />
              <Text style={styles.calloutText}>
                Please wait—you do not need to upload anything else right now. You will
                receive another update when your request moves forward or when an
                interview is scheduled.
              </Text>
            </View>
          ) : null}

          {phase === "scheduled" ? (
            <View style={[styles.callout, styles.calloutSky]}>
              <Ionicons name="calendar-outline" size={22} color="#2F4F7A" />
              <Text style={styles.calloutText}>
                Attend your case study interview on time. If you cannot make it, contact
                the office as soon as possible using the details on file.
              </Text>
            </View>
          ) : null}

          {phase === "approved" ? (
            <View style={[styles.callout, styles.calloutGreen]}>
              <Ionicons name="ribbon-outline" size={22} color="#1F5D1F" />
              <Text style={styles.calloutText}>
                Thank you for completing the process. Keep your application number for
                any follow-up with the city assistance office.
              </Text>
            </View>
          ) : null}

          {phase === "scheduled" ? (
            <View style={styles.scheduleHighlight}>
              <Text style={styles.scheduleLabel}>Interview date and time</Text>
              <Text style={styles.scheduleValue}>
                {scheduledIso ? scheduledDisplay : "—"}
              </Text>
              {!scheduledIso ? (
                <Text style={styles.scheduleHint}>
                  If this is blank, pull to refresh after the office confirms your slot.
                </Text>
              ) : null}
            </View>
          ) : null}

          {phase === "scheduled" ? (
            <InterviewStepsCard applicationId={displayRequestCode} />
          ) : null}

          {/* Request summary */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Request summary</Text>
            <View style={styles.statusBadgeWrap}>
              <Text
                style={[
                  styles.statusBadge,
                  { backgroundColor: badgeColors.bg, color: badgeColors.fg },
                ]}
              >
                {displayStatus}
              </Text>
            </View>

            <InfoRow label="Application no." value={displayRequestCode} />
            <InfoRow label="Type of assistance" value={requestTitle} />
            <InfoRow label="Date applied" value={formatDateLong(submittedAt)} />
            <InfoRow label="Submitted" value={formatDateTime(submittedAt)} />

            {phase !== "approved" ? (
              <InfoRow
                label="Milestone (for approval)"
                value={formatDateTime(forApprovalAt)}
              />
            ) : null}

            {phase === "approved" ? (
              <InfoRow
                label="Approved on"
                value={formatDateTime(finalApprovedAt || requestRow?.updated_at)}
              />
            ) : null}

            <InfoRow label="Last updated" value={formatDateTime(requestRow?.updated_at)} />
          </View>

          {/* Applicant summary */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Your profile on file</Text>
            <InfoRow label="Full name" value={buildDisplayName(profileRow)} />
            <InfoRow
              label="Birthday"
              value={formatDateLong(profileRow?.birth_date ?? null)}
            />
            <InfoRow
              label="Sex"
              value={
                profileRow?.sex
                  ? String(profileRow.sex).replace(/_/g, " ")
                  : "—"
              }
            />
            <InfoRow label="Address" value={profileRow?.address?.trim() || "—"} />
            <InfoRow
              label="Contact no."
              value={profileRow?.contact_number?.trim() || "—"}
            />
            <InfoRow label="Email" value={profileRow?.email?.trim() || "—"} />
          </View>

          {financialType ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Financial details</Text>
              <Text style={styles.additionalInfoText}>{financialType}</Text>
            </View>
          ) : null}

          {coverageText ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Coverage</Text>
              <Text style={styles.additionalInfoText}>{coverageText}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Documents on file</Text>
            <InfoRow label="Total files" value={String(attachmentStats.total)} />
            <InfoRow label="Cleared" value={String(attachmentStats.approved)} />
            <InfoRow label="In review" value={String(attachmentStats.inProgress)} />
            <InfoRow
              label="Action required"
              value={String(attachmentStats.actionRequired)}
            />
            <InfoRow label="Resubmitted" value={String(attachmentStats.resubmitted)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Additional information</Text>
            <Text style={styles.additionalInfoText}>
              {(requestRow?.additional_info || "").toString().trim() ||
                "None provided."}
            </Text>
          </View>
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
    alignItems: "stretch",
    gap: 12,
  },

  heroIconWrap: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  title: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 20,
    color: TEXT_DARK,
    textAlign: "center",
  },

  subtitle: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  serviceTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEAL,
    textAlign: "center",
    marginBottom: 4,
  },

  errorCard: {
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

  callout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  calloutTeal: {
    backgroundColor: "#F0FBF9",
    borderColor: "#B8E8DF",
  },
  calloutSky: {
    backgroundColor: "#F3F7FD",
    borderColor: "#C5D9F5",
  },
  calloutGreen: {
    backgroundColor: "#F4FFF4",
    borderColor: "#C8E9C8",
  },
  calloutText: {
    flex: 1,
    fontFamily: FONT,
    fontSize: 12.5,
    lineHeight: 18,
    color: TEXT_DARK,
  },

  scheduleHighlight: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#C5D9F5",
    backgroundColor: "#F8FAFF",
  },
  scheduleLabel: {
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "700",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  scheduleValue: {
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  scheduleHint: {
    marginTop: 8,
    fontFamily: FONT,
    fontSize: 11,
    color: MUTED,
    lineHeight: 15,
  },

  stepsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D4EEEC",
    backgroundColor: "#FAFEFE",
    padding: 14,
    gap: 12,
  },
  stepsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E7EEEE",
  },
  stepsTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
    color: TEXT_DARK,
  },
  stepsSubtitle: {
    fontFamily: FONT,
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepText: {
    flex: 1,
    fontFamily: FONT,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#444",
  },
  stepBold: {
    fontWeight: "700",
    color: TEXT_DARK,
  },
  stepMono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) ?? "monospace",
    fontWeight: "700",
    color: TEAL,
  },
  officeHours: {
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    backgroundColor: "#FFFFFFAA",
    padding: 10,
    borderRadius: 10,
    overflow: "hidden",
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 9,
  },
  sectionTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12.5,
    color: TEXT_DARK,
    marginBottom: 2,
  },
  statusBadgeWrap: {
    alignItems: "flex-end",
  },
  statusBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10.5,
    overflow: "hidden",
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
});
