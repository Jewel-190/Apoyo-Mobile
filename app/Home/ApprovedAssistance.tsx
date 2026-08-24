import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ROUTES } from "@/AppCore/AppRoutePaths";
import {
  formatCaseStudyDateTimeDisplay,
  formatDateLong,
} from "@/AppCore/CaseStudySchedule";
import { fromDbFileType } from "@/AppCore/AttachmentSlotDbMapping";
import { getCatalogLookupRuntime, resolveServiceId } from "@/AppCore/CatalogLookupRuntime";
import {
  fetchInterviewScheduling,
  formatOfficeHoursLabel,
  formatTime12h,
  INTERVIEW_SCHEDULING_DEFAULTS,
  isApplicationNumberStep,
  type InterviewSchedulingValue,
} from "@/AppCore/InterviewScheduling";
import { buildPreflightChoiceLines } from "@/AppCore/PreflightSelections";
import {
  normalizeServiceStatus,
  statusBadgeThemeFromRaw,
} from "@/AppCore/RequestStatusPresentation";
import {
  buildRequestTimelineSteps,
  toTimelineMillis,
  type RequestTimelineAuditRow,
} from "@/AppCore/RequestStatusTimeline";
import { requirementSlotsGroupedForService } from "@/AppCore/StatusCatalogBridge";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { supabase } from "@/AppCore/SupabaseClient";
import { markRequestNotificationsRead } from "@/AppCore/UserNotificationsQuery";
import { RequestStatusTimelinePanel } from "@/components/RequestStatusTimelinePanel";
import {
  SubmittedRequirementsPanel,
  type StatusUploadedDoc,
} from "@/components/SubmittedRequirementsPanel";

const FONT = "SF Pro Rounded";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const BORDER = "#E9EDED";
const TEAL = "#0B8F8B";

type MonitoringPhase = "forApproval" | "scheduled" | "approved" | "declined";

type RequestDetailsRow = {
  id: string;
  status: string | null;
  request_code: string | null;
  user_id: string | null;
  service_id?: string | null;
  service_name?: string | null;
  category_slug?: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  additional_info: string | null;
  financial_request_type?: string | null;
  payload?: unknown;
  case_study_date?: string | null;
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

type AuditStatusLogRow = RequestTimelineAuditRow;

const ASSISTANCE_REQUEST_ROW_SELECT =
  "id,status,request_code,user_id,service_id,service_name,assistance_name,category_slug,created_at,updated_at,submitted_at,additional_info,financial_request_type,payload,case_study_date";

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

function monitoringPhaseFromRaw(raw?: string | null): MonitoringPhase {
  const label = normalizeServiceStatus(raw);
  if (label === "Approved") return "approved";
  if (label === "Declined") return "declined";
  if (label === "Scheduled") return "scheduled";
  return "forApproval";
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


function ApplicationNumberHighlight({
  applicationId,
  hint = "Bring this number when you visit City Hall.",
}: {
  applicationId: string;
  hint?: string;
}) {
  const code = (applicationId || "").trim() || "—";
  return (
    <View style={styles.applicationNumberCard}>
      <View style={styles.applicationNumberHeader}>
        <Ionicons name="document-text-outline" size={20} color={TEAL} />
        <Text style={styles.applicationNumberLabel}>Application number</Text>
      </View>
      <Text style={styles.applicationNumberValue} selectable>
        {code}
      </Text>
      <Text style={styles.applicationNumberHint}>{hint}</Text>
    </View>
  );
}

function InterviewStepsCard({
  briefing,
  applicationId,
}: {
  briefing: InterviewSchedulingValue;
  applicationId: string;
}) {
  return (
    <View style={styles.stepsCard}>
      <View style={styles.stepsHeader}>
        <Ionicons name="list-outline" size={22} color={TEAL} />
        <View style={{ flex: 1 }}>
          <Text style={styles.stepsTitle}>{briefing.title}</Text>
          {briefing.subtitle ? (
            <Text style={styles.stepsSubtitle}>{briefing.subtitle}</Text>
          ) : null}
        </View>
      </View>
      {briefing.steps.map((step, index) => (
        <View key={step.id} style={styles.stepRow}>
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={index % 2 === 0 ? TEAL : "#06C1EC"}
          />
          <Text style={styles.stepText}>
            <Text style={styles.stepBold}>{`Step ${index + 1}: `}</Text>
            {step.body}
            {isApplicationNumberStep(step) ? (
              <Text style={styles.stepApplicationNumber}> {applicationId || "—"}</Text>
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DeclinedNextStepsCard({
  onCreateAnotherRequest,
  onContactCswdo,
}: {
  onCreateAnotherRequest: () => void;
  onContactCswdo: () => void;
}) {
  return (
    <View style={styles.stepsCard}>
      <View style={styles.stepsHeader}>
        <Ionicons name="compass-outline" size={22} color={TEAL} />
        <View style={{ flex: 1 }}>
          <Text style={styles.stepsTitle}>What you can do next</Text>
          <Text style={styles.stepsSubtitle}>
            Choose the option that works best for you.
          </Text>
        </View>
      </View>
      <View style={styles.stepRow}>
        <Ionicons name="add-circle" size={18} color={TEAL} />
        <Text style={styles.stepText}>
          <Text style={styles.stepBold}>Option 1: </Text>
          Submit a new assistance request from Home if you still need help.
        </Text>
      </View>
      <View style={styles.stepRow}>
        <Ionicons name="business" size={18} color="#06C1EC" />
        <Text style={styles.stepText}>
          <Text style={styles.stepBold}>Option 2: </Text>
          Visit or contact the CSWDO office and bring your application number.
        </Text>
      </View>
      <Pressable
        onPress={onCreateAnotherRequest}
        style={({ pressed }) => [
          styles.declinedPrimaryBtn,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.declinedPrimaryBtnText}>Create another request</Text>
      </Pressable>
      <Pressable
        onPress={onContactCswdo}
        style={({ pressed }) => [
          styles.declinedSecondaryBtn,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.declinedSecondaryBtnText}>Contact CSWDO</Text>
      </Pressable>
    </View>
  );
}

export default function ApprovedAssistance() {
  const { bundle } = useAssistanceCatalog();
  const catalogReady = !!bundle?.runtime;
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
  const requestService = firstParam(params?.service).trim();

  useEffect(() => {
    if (!requestId) return;

    let active = true;

    (async () => {
      try {
        await markRequestNotificationsRead(requestId);
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
  const requestTitle =
    String(requestRow?.service_name || "").trim() ||
    firstParam(params?.title).trim() ||
    "Assistance request";
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [forApprovalAt, setForApprovalAt] = useState<string | null>(null);
  const [finalApprovedAt, setFinalApprovedAt] = useState<string | null>(null);
  const [declinedAt, setDeclinedAt] = useState<string | null>(null);
  const [auditHistory, setAuditHistory] = useState<AuditStatusLogRow[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<StatusUploadedDoc[]>([]);
  const [briefing, setBriefing] = useState<InterviewSchedulingValue>(
    INTERVIEW_SCHEDULING_DEFAULTS
  );
  const lastDetailsFetchAtRef = useRef(0);
  const APPROVED_FOCUS_TTL_MS = 30 * 1000;

  const loadRequestDetails = useCallback(async (opts?: { refresh?: boolean }) => {
    const refresh = opts?.refresh === true;

    if (!requestId) {
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
      const [{ data, error }, cmsBriefing] = await Promise.all([
        supabase
          .from("assistance_requests")
          .select(ASSISTANCE_REQUEST_ROW_SELECT)
          .eq("id", requestId)
          .maybeSingle(),
        fetchInterviewScheduling({ force: refresh }).catch(() =>
          INTERVIEW_SCHEDULING_DEFAULTS
        ),
      ]);

      setBriefing(cmsBriefing);

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
        .select("action,old_status,new_status,changed_by,changed_at")
        .eq("request_id", requestId)
        .order("changed_at", { ascending: true });

      const auditRows = ((auditData || []) as AuditStatusLogRow[]).filter(
        (r) => !!r.changed_at
      );
      setAuditHistory(auditRows);

      const faEvent = [...auditRows].reverse().find(
        (r) => normalizeRawStatus(r.new_status) === "for approval"
      );
      setForApprovalAt(faEvent?.changed_at || null);

      const apprEvent = [...auditRows].reverse().find(
        (r) => normalizeRawStatus(r.new_status) === "approved"
      );
      setFinalApprovedAt(apprEvent?.changed_at || null);

      const declinedEvent = [...auditRows].reverse().find((r) => {
        const status = normalizeRawStatus(r.new_status);
        return status === "declined" || status === "denied" || status === "rejected";
      });
      setDeclinedAt(declinedEvent?.changed_at || null);

      const catalogServiceIdForSlots =
        (row?.service_id || "").trim() ||
        resolveServiceId(requestService) ||
        "";
      const slotMap: Record<string, string> = catalogServiceIdForSlots
        ? getCatalogLookupRuntime()?.byServiceId[catalogServiceIdForSlots]
            ?.attachmentSlotMap ?? {}
        : {};

      const { data: attachmentData } = await supabase
        .from("request_attachments")
        .select(
          "file_type,path,status,created,updated,reason_for_action,additional_reason"
        )
        .eq("assistance_request_id", requestId)
        .order("created", { ascending: true });

      const rowsAtt = (attachmentData || []) as Array<{
        file_type: string;
        path: string;
        status: string;
        created: string;
        updated: string;
        reason_for_action: string | null;
        additional_reason: string | null;
      }>;

      setUploadedDocs(
        rowsAtt
          .filter((r) => typeof r.path === "string" && r.path.trim().length > 0)
          .map((r) => ({
            fileType: fromDbFileType(slotMap, r.file_type),
            path: r.path,
            status: r.status,
            created: r.created,
            updated: r.updated,
            reasonForAction: r.reason_for_action || undefined,
            additionalReason: r.additional_reason || undefined,
          }))
      );
    } catch (e) {
      console.log("Approved assistance details fetch failed:", e);
      setLoadError("Could not load request details.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [requestId, requestService]);

  const onRefresh = useCallback(() => {
    lastDetailsFetchAtRef.current = 0;
    void loadRequestDetails({ refresh: true });
  }, [loadRequestDetails]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastDetailsFetchAtRef.current < APPROVED_FOCUS_TTL_MS) {
        setIsLoading(false);
        return () => {};
      }
      lastDetailsFetchAtRef.current = now;
      loadRequestDetails();
      return () => {};
    }, [loadRequestDetails])
  );

  const displayStatus = normalizeServiceStatus(
    requestRow?.status || firstParam(params?.status)
  );
  const phase: MonitoringPhase = monitoringPhaseFromRaw(
    requestRow?.status || firstParam(params?.status)
  );

  const displayRequestCode =
    (requestRow?.request_code || "").toString().trim() ||
    firstParam(params?.requestCode).trim() ||
    requestId ||
    "Pending assignment";

  const submittedAt = requestRow?.submitted_at || requestRow?.created_at;

  const preflightChoicesText = useMemo(() => {
    const sid = resolveServiceId(requestService);
    if (!sid) return "";
    const lines = buildPreflightChoiceLines(sid, {
      payload: requestRow?.payload,
      financialRequestType: requestRow?.financial_request_type ?? null,
    });
    return lines.map((l) => `${l.label}: ${l.value}`).join("\n");
  }, [requestRow?.financial_request_type, requestRow?.payload, requestService]);

  const catalogServiceId = useMemo(() => {
    const fromRow = (requestRow?.service_id || "").trim();
    if (fromRow && getCatalogLookupRuntime()?.byServiceId[fromRow]) {
      return fromRow;
    }
    return resolveServiceId(requestService) || fromRow;
  }, [requestRow?.service_id, requestService, catalogReady]);

  const requirementGroups = useMemo(
    () => requirementSlotsGroupedForService(catalogServiceId),
    [catalogServiceId, catalogReady]
  );

  const timelineSteps = useMemo(
    () =>
      buildRequestTimelineSteps({
        auditHistory,
        fallbackStatus: requestRow?.status || firstParam(params?.status),
        fallbackTimestamp:
          toTimelineMillis(requestRow?.updated_at) ||
          toTimelineMillis(requestRow?.submitted_at) ||
          toTimelineMillis(requestRow?.created_at),
      }),
    [
      auditHistory,
      requestRow?.status,
      requestRow?.updated_at,
      requestRow?.submitted_at,
      requestRow?.created_at,
      params?.status,
    ]
  );

  const additionalInfoText =
    (requestRow?.additional_info || "").toString().trim() ||
    "No additional information submitted.";

  const topTitle =
    phase === "approved"
      ? "Approved"
      : phase === "declined"
        ? "Declined"
        : phase === "scheduled"
          ? "Interview"
          : "Request monitoring";

  const heroIcon =
    phase === "approved"
      ? ("trophy" as const)
      : phase === "declined"
        ? ("close-circle" as const)
        : phase === "scheduled"
          ? ("calendar" as const)
          : ("hourglass-outline" as const);

  const heroColor =
    phase === "approved"
      ? "#63C44A"
      : phase === "declined"
        ? "#C45A5A"
        : phase === "scheduled"
          ? "#2F6FED"
          : TEAL;

  const headline =
    phase === "approved"
      ? "Congratulations!"
      : phase === "declined"
        ? "Request declined"
        : phase === "scheduled"
          ? "Your case study interview is scheduled"
          : "Almost there";

  const officeHoursDays =
    briefing.officeHours.days || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.days;
  const officeHoursStart =
    formatTime12h(briefing.officeHours.start) ||
    formatTime12h(INTERVIEW_SCHEDULING_DEFAULTS.officeHours.start);
  const officeHoursEnd =
    formatTime12h(briefing.officeHours.end) ||
    formatTime12h(INTERVIEW_SCHEDULING_DEFAULTS.officeHours.end);
  const officeHoursTime = `${officeHoursStart} to ${officeHoursEnd}`;
  const scheduledIso = requestRow?.case_study_date || null;
  const scheduledDisplay = formatCaseStudyDateTimeDisplay(scheduledIso);

  const subhead =
    phase === "approved"
      ? "Your assistance request has been fully approved."
      : phase === "declined"
        ? "This assistance request was not approved for disbursement."
        : phase === "scheduled"
          ? formatOfficeHoursLabel(briefing)
          : "Your documents are verified. Please wait while staff completes final review.";

  const badgeColors = statusBadgeThemeFromRaw(displayStatus);

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
                Please come during the office hours shown below. If you are unable to
                visit, contact the assistance office as soon as possible.
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

          {phase === "declined" ? (
            <View style={[styles.callout, styles.calloutRed]}>
              <Ionicons name="information-circle-outline" size={22} color="#7A2E2E" />
              <Text style={styles.calloutText}>
                You may submit another request in the app, or visit the CSWDO office
                for further assistance. Please keep your application number when you
                follow up.
              </Text>
            </View>
          ) : null}

          {phase === "scheduled" ? (
            <View style={styles.scheduleHighlight}>
              <Text style={styles.scheduleLabel}>
                {scheduledIso ? "Interview date and time" : "When to visit"}
              </Text>
              <Text style={styles.scheduleValue}>
                {scheduledIso
                  ? scheduledDisplay
                  : "Please visit City Hall during the office hours below to complete your case study interview."}
              </Text>
              <View style={styles.officeHoursEmphasis}>
                <View style={styles.officeHoursIconWrap}>
                  <Ionicons name="time-outline" size={22} color={TEAL} />
                </View>
                <View style={styles.officeHoursTextCol}>
                  <Text style={styles.officeHoursEmphasisLabel}>Office hours</Text>
                  <Text style={styles.officeHoursDays}>{officeHoursDays}</Text>
                  <Text style={styles.officeHoursTime}>{officeHoursTime}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {phase === "scheduled" ? (
            <ApplicationNumberHighlight applicationId={displayRequestCode} />
          ) : null}

          {phase === "approved" || phase === "declined" ? (
            <ApplicationNumberHighlight
              applicationId={displayRequestCode}
              hint="Bring this number when you visit the CSWDO office."
            />
          ) : null}

          {phase === "scheduled" ? (
            <InterviewStepsCard
              briefing={briefing}
              applicationId={displayRequestCode}
            />
          ) : null}

          {phase === "declined" ? (
            <DeclinedNextStepsCard
              onCreateAnotherRequest={() => router.replace(ROUTES.home)}
              onContactCswdo={() => router.push(ROUTES.contactUs)}
            />
          ) : null}

          <RequestStatusTimelinePanel steps={timelineSteps} />

          {/* Request summary */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Request summary</Text>
            <View style={styles.statusBadgeWrap}>
              <Text
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: badgeColors.bg,
                    color: badgeColors.text,
                  },
                ]}
              >
                {displayStatus}
              </Text>
            </View>

            <InfoRow label="Application no." value={displayRequestCode} />
            <InfoRow label="Type of assistance" value={requestTitle} />
            <InfoRow label="Date applied" value={formatDateLong(submittedAt)} />
            <InfoRow label="Submitted" value={formatDateTime(submittedAt)} />

            {phase === "forApproval" || phase === "scheduled" ? (
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

            {phase === "declined" ? (
              <InfoRow
                label="Declined on"
                value={formatDateTime(declinedAt || requestRow?.updated_at)}
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

          {preflightChoicesText ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Application choices</Text>
              <Text style={styles.additionalInfoText}>{preflightChoicesText}</Text>
            </View>
          ) : null}

          <SubmittedRequirementsPanel
            catalogReady={catalogReady}
            required={requirementGroups.required}
            optionalRequirements={requirementGroups.optionalRequirements}
            additionalAttachment={requirementGroups.additionalAttachment}
            docs={uploadedDocs}
            additionalInfoText={additionalInfoText}
          />
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
    fontSize: 14,
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
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    lineHeight: 20,
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
    fontSize: 14,
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
  calloutRed: {
    backgroundColor: "#FDF4F4",
    borderColor: "#F8D0D0",
  },
  calloutText: {
    flex: 1,
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 14,
    fontWeight: "700",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  scheduleValue: {
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_DARK,
    lineHeight: 21,
  },
  officeHoursEmphasis: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#9AD4D2",
    backgroundColor: "#FFFFFF",
  },
  officeHoursIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#E8F6F5",
    alignItems: "center",
    justifyContent: "center",
  },
  officeHoursTextCol: {
    flex: 1,
    gap: 2,
  },
  officeHoursEmphasisLabel: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  officeHoursDays: {
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "800",
    color: TEXT_DARK,
    lineHeight: 22,
  },
  officeHoursTime: {
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "800",
    color: TEAL,
    lineHeight: 24,
  },

  applicationNumberCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: TEAL,
    backgroundColor: "#F2FBFA",
    gap: 8,
  },
  applicationNumberHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  applicationNumberLabel: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  applicationNumberValue: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) ?? "monospace",
    fontSize: 22,
    fontWeight: "800",
    color: TEXT_DARK,
    letterSpacing: 0.5,
    textAlign: "center",
    paddingVertical: 6,
  },
  applicationNumberHint: {
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
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
    fontSize: 16,
    color: TEXT_DARK,
  },
  stepsSubtitle: {
    fontFamily: FONT,
    fontSize: 14,
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
    fontSize: 14,
    lineHeight: 20,
    color: "#444",
  },
  stepBold: {
    fontWeight: "700",
    color: TEXT_DARK,
  },
  stepApplicationNumber: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) ?? "monospace",
    fontWeight: "800",
    color: TEAL,
  },
  declinedPrimaryBtn: {
    marginTop: 4,
    height: 46,
    borderRadius: 23,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  declinedPrimaryBtnText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
  declinedSecondaryBtn: {
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: TEAL,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  declinedSecondaryBtnText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEAL,
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
    color: MUTED,
  },
  infoValue: {
    maxWidth: "58%",
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEXT_DARK,
    textAlign: "right",
  },
  additionalInfoText: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
  },
});
