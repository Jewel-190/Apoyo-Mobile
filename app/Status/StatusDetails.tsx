// app/Status/StatusDetails.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
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
  inferAttachmentName,
  RequestTableName,
} from "../../lib/requestAttachments";
import { supabase } from "../../lib/supabase";

const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;

/* ========= STORAGE ========= */
const STORAGE_KEY_STATUS_LIST = "apoyo_status_applications_v1";

/* ========= THEME ========= */
const BG = "#FFFFFF";
const TEXT_DARK = "#2B2B2B";
const TEXT_MUTED = "#7B7B7B";

/* badge */
const BADGE_PENDING = "#E8C6FF";
const BADGE_PROGRESS = "#B9E3FF";
const BADGE_ACTION = "#FFD59E";
const BADGE_APPROVED = "#C8F1C8";
const BADGE_DRAFT = "#D4D4D4";
const BADGE_TEXT_DEFAULT = "#2B2B2B";
const REQUEST_DOCS_BUCKET = "request-documents";

/* timeline */
const LINE = "#DADADA";
const NODE = "#CFCFCF";
const GREEN = "#7CCB53";

/* layout */
const DATE_COL_W = 76;
const DATE_GAP = 8;
const LINE_X = DATE_COL_W + DATE_GAP;

const NODE_SIZE = 18;
const NODE_X = LINE_X - NODE_SIZE / 2;

const EVENT_LEFT = LINE_X + 12;
const TIMELINE_Y_OFFSET = 18;

/* ========= TYPES ========= */
type Category = "medical" | "financial" | "burial";
type ServiceStatus =
  | "Pending"
  | "In Progress"
  | "Action Required"
  | "Resubmitted"
  | "Approved"
  | "Draft";

function normalizeStatus(raw?: string): ServiceStatus {
  if (!raw) return "Pending";
  const s = raw.toString().trim().toLowerCase();
  if (s === "submitted" || s === "pending") return "Pending";
  if (s === "resubmitted") return "Resubmitted";
  if (s === "in progress" || s === "in_progress" || s === "inprogress" || s === "processing") return "In Progress";
  if (s === "action required" || s === "action_required" || s === "action") return "Action Required";
  if (s === "approved" || s === "accepted") return "Approved";
  return "Pending";
}

type ApplicationItem = {
  id: string;
  title: string;
  description: string;
  status: ServiceStatus;
  category: Category;
  createdAt?: number;
  applicationId?: string;
  requestCode?: string;
  service?: string;
};

/* ========= DOC TYPES ========= */
type StoredDoc = {
  fileType: string;
  path: string;
  status?: string;
  created?: string;
  updated?: string;
  reasonForAction?: string;
  additionalReason?: string;
};

type RequestDetailsRow = {
  id: string;
  status: string | null;
  request_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  additional_info: string | null;
  coverage?: string | null;
};

const COVERAGE_TABLES = new Set<RequestTableName>([
  "burial_requests",
  "cremation_requests",
]);

type AuditStatusLogRow = {
  action: string;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  changed_by_role: string | null;
  changed_at: string;
};

type ReqDef = { key: string; label: string; optional?: boolean };

const FILE_TYPE_MAP: Record<RequestTableName, Record<string, string>> = {
  hospitalization_requests: {
    abstract: "abstract_file",
    bill: "bill_file",
    letter: "letter_file",
    voterId: "voter_id_file",
    birthCert: "birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  treatment_requests: {
    medCert: "med_cert_file",
    rx: "rx_file",
    lab: "lab_file",
    letter: "letter_file",
    voterId: "voter_id_file",
    birthCert: "birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  medical_requests: {
    medCert: "med_cert_file",
    prescription: "prescription_file",
    quotation: "quotation_file",
    letter: "letter_file",
    voterId: "voter_id_file",
    birthCert: "birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  financial_requests: {
    letter: "letter_file",
    voterId: "voter_id_file",
    validId: "valid_id_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  monetary_requests: {
    letter: "letter_file",
    voterId: "voters_id_or_cert_file",
    birthCert: "valid_id_or_birth_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "additional_attachment_file",
  },
  burial_requests: {
    deathCert: "death_cert_file",
    validId: "valid_id_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  cremation_requests: {
    deathCert: "death_cert_file",
    validId: "valid_id_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
  columbarium_requests: {
    deathCert: "death_cert_file",
    validId: "valid_id_file",
    cremationCert: "cremation_cert_file",
    barangay: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    attachment: "attachment_file",
  },
};

function fromDbFileType(
  requestTable: RequestTableName,
  dbFileType: string
): string {
  const map = FILE_TYPE_MAP[requestTable] || {};
  const pair = Object.entries(map).find(([, value]) => value === dbFileType);
  return pair?.[0] || dbFileType;
}

function normalizeRawStatus(raw?: string | null): string {
  const s = (raw || "").toString().trim().toLowerCase();
  if (!s) return "pending";
  if (s === "submitted") return "pending";
  if (s === "resubmitted") return "resubmitted";
  if (s === "in_progress" || s === "inprogress" || s === "processing")
    return "in progress";
  if (s === "action_required") return "action required";
  return s;
}

function normalizeAttachmentStatus(raw?: string | null): string {
  const s = (raw || "").toString().trim().toLowerCase();
  if (!s) return "in progress";
  if (s === "pending" || s === "submitted") return "in progress";
  if (s === "in_progress" || s === "inprogress" || s === "processing")
    return "in progress";
  if (s === "action_required") return "action required";
  return s;
}

function attachmentStatusIcon(statusRaw?: string | null): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
} | null {
  const s = normalizeAttachmentStatus(statusRaw);
  if (s === "approved") {
    return { name: "checkmark-circle", color: GREEN };
  }
  if (s === "action required") {
    return { name: "alert-circle", color: "#F0A13A" };
  }
  if (s === "resubmitted") {
    return { name: "refresh-circle", color: "#E3B500" };
  }
  return null;
}

function statusLabel(raw?: string | null): ServiceStatus {
  return normalizeStatus(raw || "");
}

function statusDescription(raw?: string | null): string {
  const s = normalizeRawStatus(raw);
  if (s === "pending") {
    return "The document has landed in the admin's inbox but hasn't been opened yet.";
  }
  if (s === "in progress") {
    return "An admin is doing an authenticity check, please wait.";
  }
  if (s === "action required") {
    return "Your application is currently on hold. We require a resubmission of your files";
  }
  if (s === "resubmitted") {
    return "Your files are being rechecked by the admin, please wait.";
  }
  if (s === "approved") {
    return "Your application has been approved.";
  }
  if (s === "draft") {
    return "Your request is still in draft.";
  }
  if (s === "deleted") {
    return "This request has been deleted.";
  }
  return "Status updated.";
}

function badgeThemeForStatus(status: ServiceStatus): {
  bg: string;
  text: string;
} {
  switch (status) {
    case "Pending":
      return { bg: BADGE_PENDING, text: "#4A2E5B" };
    case "In Progress":
      return { bg: BADGE_PROGRESS, text: BADGE_TEXT_DEFAULT };
    case "Action Required":
      return { bg: BADGE_ACTION, text: BADGE_TEXT_DEFAULT };
    case "Resubmitted":
      return { bg: BADGE_PROGRESS, text: BADGE_TEXT_DEFAULT };
    case "Approved":
      return { bg: BADGE_APPROVED, text: BADGE_TEXT_DEFAULT };
    case "Draft":
      return { bg: BADGE_DRAFT, text: BADGE_TEXT_DEFAULT };
    default:
      return { bg: BADGE_PENDING, text: "#4A2E5B" };
  }
}

function isImagePath(path?: string) {
  const p = (path || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/.test(p);
}

function toMillis(v?: string | null): number | undefined {
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : undefined;
}

function formatDate(d?: number) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatTime(d?: number) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
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

function assistanceTitle(category?: Category) {
  switch (category) {
    case "financial":
      return "Financial Assistance";
    case "burial":
      return "Burial Assistance";
    case "medical":
    default:
      return "Medical Assistance";
  }
}

function typeLabel(category?: Category) {
  switch (category) {
    case "financial":
      return "Type Of Financial Assistance:";
    case "burial":
      return "Type Of Burial Assistance:";
    case "medical":
    default:
      return "Type Of Medical Assistance:";
  }
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

/* ========= helpers for docs ========= */
function pickFileName(d: StoredDoc) {
  return inferAttachmentName(d.path, d.fileType);
}

function pickFileSize(d: StoredDoc): number | undefined {
  return undefined;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function requirementsFor(table?: RequestTableName | null): ReqDef[] {
  if (!table) return [];

  const byTable: Record<RequestTableName, ReqDef[]> = {
    hospitalization_requests: [
      { key: "abstract", label: "Medical Abstract" },
      { key: "bill", label: "Partial Hospital Bill" },
      { key: "letter", label: "Letter of Request" },
      { key: "voterId", label: "Voter's ID / Certificate" },
      { key: "birthCert", label: "Valid ID / Birth Certificate" },
      { key: "barangay", label: "Barangay Endorsement" },
      { key: "indigency", label: "Certificate of Indigency" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
    treatment_requests: [
      { key: "medCert", label: "Medical Certificate" },
      { key: "rx", label: "Doctor's Prescription" },
      { key: "lab", label: "Laboratory Request" },
      { key: "letter", label: "Letter of Request" },
      { key: "voterId", label: "Voter's ID / Certificate" },
      { key: "birthCert", label: "Valid ID / Birth Certificate" },
      { key: "barangay", label: "Barangay Endorsement" },
      { key: "indigency", label: "Certificate of Indigency" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
    medical_requests: [
      { key: "medCert", label: "Medical Certificate" },
      { key: "prescription", label: "Doctor's Prescription" },
      { key: "quotation", label: "Quotation of Expenses" },
      { key: "letter", label: "Letter of Request" },
      { key: "voterId", label: "Voter's ID / Certificate" },
      { key: "birthCert", label: "Valid ID / Birth Certificate" },
      { key: "barangay", label: "Barangay Endorsement" },
      { key: "indigency", label: "Certificate of Indigency" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
    financial_requests: [
      { key: "letter", label: "Letter of Request" },
      { key: "voterId", label: "Voter's ID / Certificate" },
      { key: "validId", label: "Valid ID" },
      { key: "barangay", label: "Barangay Endorsement" },
      { key: "indigency", label: "Certificate of Indigency" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
    monetary_requests: [
      { key: "letter", label: "Letter of Request" },
      { key: "voterId", label: "Voter's ID / Certificate" },
      { key: "birthCert", label: "Valid ID / Birth Certificate" },
      { key: "barangay", label: "Barangay Endorsement" },
      { key: "indigency", label: "Certificate of Indigency" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
    burial_requests: [
      { key: "deathCert", label: "Death Certificate" },
      { key: "validId", label: "Valid ID of Deceased" },
      { key: "barangay", label: "Barangay Endorsement of the Deceased" },
      { key: "indigency", label: "Indigency Certificate of the Deceased" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
    cremation_requests: [
      { key: "deathCert", label: "Death Certificate" },
      { key: "validId", label: "Valid ID of Deceased" },
      { key: "barangay", label: "Barangay Endorsement of the Deceased" },
      { key: "indigency", label: "Indigency Certificate of the Deceased" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
    columbarium_requests: [
      { key: "deathCert", label: "Death Certificate" },
      { key: "validId", label: "Valid ID of Deceased" },
      { key: "cremationCert", label: "Certificate of Cremation" },
      { key: "barangay", label: "Barangay Endorsement of the Deceased" },
      { key: "indigency", label: "Indigency Certificate of the Deceased" },
      { key: "attachment", label: "Attachments (optional)", optional: true },
    ],
  };

  return byTable[table] || [];
}

export default function StatusDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    title?: string;
    status?: string;
    category?: string;
    createdAt?: string;
    applicationId?: string;
    requestCode?: string;
    service?: string;
  }>();

  const [app, setApp] = useState<ApplicationItem | null>(null);

  const [uploadedDocs, setUploadedDocs] = useState<StoredDoc[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditStatusLogRow[]>([]);
  const [isDbSyncing, setIsDbSyncing] = useState(false);
  const [requestRow, setRequestRow] = useState<RequestDetailsRow | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_STATUS_LIST);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            const found = list.find(
              (x: any) => String(x?.id) === String(params?.id)
            );
            if (found) {
              setApp({
                id: String(found?.id),
                title: String(found?.title ?? ""),
                description: String(found?.description ?? ""),
                status: normalizeStatus(found?.status as string) ?? "Pending",
                category: (found?.category as Category) ?? "medical",
                createdAt:
                  typeof found?.createdAt === "number"
                    ? found.createdAt
                    : Date.now(),
                applicationId:
                  typeof found?.applicationId === "string"
                    ? found.applicationId
                    : undefined,
                requestCode:
                  typeof found?.requestCode === "string"
                    ? found.requestCode
                    : typeof found?.applicationId === "string"
                    ? found.applicationId
                    : undefined,
                service:
                  typeof found?.service === "string"
                    ? found.service
                    : undefined,
              });
              return;
            }
          }
        }
      } catch {}

      const fallbackCategory =
        (params?.category as Category) ?? ("medical" as Category);
      const fallbackCreatedAt = Number(params?.createdAt) || Date.now();
      const fallbackStatus =
        normalizeStatus((params?.status as string) ?? "") ?? "Pending";
      const fallbackTitle = String(params?.title ?? "—");

      setApp({
        id: String(params?.id ?? `app_${Date.now()}`),
        title: fallbackTitle,
        description: "",
        status: fallbackStatus,
        category: fallbackCategory,
        createdAt: fallbackCreatedAt,
        applicationId:
          (params?.applicationId || "").toString().trim() || undefined,
        requestCode:
          (params?.requestCode || params?.applicationId || "")
            .toString()
            .trim() || undefined,
        service: (params?.service || "").toString().trim() || undefined,
      });
    })();
  }, [
    params?.id,
    params?.category,
    params?.createdAt,
    params?.status,
    params?.title,
    params?.applicationId,
    params?.requestCode,
    params?.service,
  ]);

  const latestAuditStatus = useMemo(() => {
    if (!auditHistory.length) return null;
    const latest = auditHistory[auditHistory.length - 1];
    return latest?.new_status || latest?.old_status || null;
  }, [auditHistory]);

  const badgeText = useMemo(
    () => normalizeStatus(latestAuditStatus || requestRow?.status || app?.status),
    [latestAuditStatus, requestRow?.status, app?.status]
  );
  const createdAt = app?.createdAt ?? Date.now();
  const badgeTheme = useMemo(
    () => badgeThemeForStatus(badgeText as ServiceStatus),
    [badgeText]
  );

  const infoHeaderTitle = useMemo(
    () => `${assistanceTitle(app?.category)} Information`,
    [app?.category]
  );

  const typeOfAssistance = useMemo(() => {
    const t = (app?.title || "").toLowerCase();
    if (t.includes("treatment")) return "Treatment & Procedures";
    if (t.includes("operations")) return "Medical Operations";
    return app?.title || "—";
  }, [app?.title]);

  const requestTable = useMemo(
    () => tableForService(app?.service, app?.title, app?.category),
    [app?.service, app?.title, app?.category]
  );
  const realRequestId = useMemo(() => {
    const id = (app?.id || "").toString();
    return id.startsWith("draft_") ? id.replace("draft_", "") : id;
  }, [app?.id]);

  const requestCode = useMemo(() => {
    if (requestRow?.request_code) return requestRow.request_code;
    if (app?.requestCode) return app.requestCode;
    if (app?.applicationId) return app.applicationId;
    const passed = (params?.requestCode || params?.applicationId || "")
      .toString()
      .trim();
    return passed;
  }, [
    requestRow?.request_code,
    app?.requestCode,
    app?.applicationId,
    params?.requestCode,
    params?.applicationId,
  ]);

  const displayRequestCode = requestCode || "Pending assignment";
  const additionalInfoText =
    (requestRow?.additional_info || "").toString().trim() ||
    "No additional information submitted.";
  const coverageText = (requestRow?.coverage || "").toString().trim();

  const normalizedStatus = useMemo(
    () => normalizeRawStatus(latestAuditStatus || requestRow?.status || app?.status),
    [latestAuditStatus, requestRow?.status, app?.status]
  );
  const isActionRequired = normalizedStatus === "action required";

  const timelineSteps = useMemo(() => {
    if (auditHistory.length > 0) {
      const filtered = auditHistory.filter(
        (log) => (log.action || "").toUpperCase() !== "INSERT"
      );

      const reduced = filtered.reduce<
        Array<{
          key: string;
          title: ServiceStatus;
          description: string;
          timestamp?: number;
          statusRaw: string;
        }>
      >((acc, log, index) => {
        const statusRaw = normalizeRawStatus(log.new_status || log.old_status);
        if (!statusRaw) return acc;

        const next = {
          key: `${log.changed_at}-${index}`,
          title: statusLabel(statusRaw),
          description: statusDescription(statusRaw),
          timestamp: toMillis(log.changed_at),
          statusRaw,
        };

        if (!acc.length) {
          acc.push(next);
          return acc;
        }

        const last = acc[acc.length - 1];
        if (last.statusRaw === statusRaw) {
          acc[acc.length - 1] = next;
          return acc;
        }

        acc.push(next);
        return acc;
      }, []);

      if (reduced.length > 0) {
        return [...reduced].reverse();
      }
    }

    const fallbackTimestamp =
      toMillis(requestRow?.updated_at) ||
      toMillis(requestRow?.submitted_at) ||
      toMillis(requestRow?.created_at) ||
      app?.createdAt;

    return [
      {
        key: "fallback-current",
        title: statusLabel(requestRow?.status || app?.status),
        description: statusDescription(requestRow?.status || app?.status),
        timestamp: fallbackTimestamp,
        statusRaw: normalizeRawStatus(requestRow?.status || app?.status),
      },
    ];
  }, [
    auditHistory,
    requestRow?.status,
    requestRow?.updated_at,
    requestRow?.submitted_at,
    requestRow?.created_at,
    app?.status,
    app?.createdAt,
  ]);

  const currentStepIndex = useMemo(() => {
    return 0;
  }, [timelineSteps.length]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTick((x) => x + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsInitialLoading(true);
      setRefreshTick((x) => x + 1);
      return () => {};
    }, [])
  );

  useEffect(() => {
    if (!app?.id || !requestTable) return;

    const realId = app.id.startsWith("draft_")
      ? app.id.replace("draft_", "")
      : app.id;

    let active = true;

    (async () => {
      try {
        setIsDbSyncing(true);
        const baseSelectColumns =
          "id,status,request_code,created_at,updated_at,submitted_at,additional_info";
        const requestSelectColumns = COVERAGE_TABLES.has(requestTable)
          ? `${baseSelectColumns},coverage`
          : baseSelectColumns;

        const { data, error } = await supabase
          .from(requestTable)
          .select(requestSelectColumns)
          .eq("id", realId)
          .maybeSingle();

        if (error) throw error;

        if (active) {
          const row = (data as RequestDetailsRow | null) || null;
          setRequestRow(row);

          if (row) {
            setApp((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                status: normalizeStatus(row.status || prev.status),
                requestCode:
                  typeof row.request_code === "string" && row.request_code.trim()
                    ? row.request_code.trim()
                    : prev.requestCode,
                createdAt:
                  toMillis(row.created_at) ||
                  toMillis(row.submitted_at) ||
                  prev.createdAt,
              };
            });
          }
        }

        const { data: auditData, error: auditError } = await supabase
          .from("audit_logs")
          .select("action,old_status,new_status,changed_by,changed_by_role,changed_at")
          .eq("request_table", requestTable)
          .eq("request_id", realId)
          .order("changed_at", { ascending: true });

        if (auditError) {
          console.log("Status details audit log sync failed:", auditError);
          if (active) setAuditHistory([]);
        } else if (active) {
          const rows = (auditData || []) as AuditStatusLogRow[];
          setAuditHistory(rows.filter((r) => !!r.changed_at));
        }

        const { data: attachmentsData, error: attachmentsError } = await supabase
          .from("request_attachments")
          .select(
            "file_type,path,status,created,updated,reason_for_action,additional_reason"
          )
          .eq("request_table", requestTable)
          .eq("request_uid", realId)
          .order("created", { ascending: true });

        if (attachmentsError) throw attachmentsError;

        if (active) {
          const rows = (attachmentsData || []) as Array<{
            file_type: string;
            path: string;
            status: string;
            created: string;
            updated: string;
            reason_for_action: string | null;
            additional_reason: string | null;
          }>;

          setUploadedDocs(
            rows
              .filter((r) => typeof r.path === "string" && r.path.trim().length > 0)
              .map((r) => ({
                fileType: fromDbFileType(requestTable, r.file_type),
                path: r.path,
                status: r.status,
                created: r.created,
                updated: r.updated,
                reasonForAction: r.reason_for_action || undefined,
                additionalReason: r.additional_reason || undefined,
              }))
          );
        }
      } catch (e) {
        console.log("Status details DB sync failed:", e);
      } finally {
        if (active) setIsDbSyncing(false);
        if (active) setIsRefreshing(false);
        if (active) setIsInitialLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [app?.id, requestTable, refreshTick]);

  useEffect(() => {
    if (app?.id && !requestTable) {
      setIsInitialLoading(false);
    }
  }, [app?.id, requestTable]);

  const headerStroke = useMemo<[string, string]>(
    () => topBarGradient(app?.category),
    [app?.category]
  );

  const reqDefs = useMemo(() => {
    return requirementsFor(requestTable);
  }, [requestTable]);

  const requiredReqDefs = useMemo(
    () => reqDefs.filter((r) => !r.optional),
    [reqDefs]
  );
  const optionalReqDef = useMemo(
    () => reqDefs.find((r) => r.optional),
    [reqDefs]
  );

  const docByReqKey = useMemo(() => {
    const map = new Map<string, StoredDoc>();

    for (const d of uploadedDocs) {
      const k = (d.fileType || "").toString();
      if (k && !map.has(k)) map.set(k, d);
    }

    return map;
  }, [uploadedDocs]);

  useEffect(() => {
    let active = true;

    (async () => {
      const imageDocs = uploadedDocs.filter((d) => isImagePath(d.path));
      if (!imageDocs.length) {
        if (active) setThumbnailUrls({});
        return;
      }

      const next: Record<string, string> = {};
      await Promise.all(
        imageDocs.map(async (doc) => {
          const { data, error } = await supabase.storage
            .from(REQUEST_DOCS_BUCKET)
            .createSignedUrl(doc.path, 3600);

          if (!error && data?.signedUrl) {
            next[doc.path] = data.signedUrl;
          }
        })
      );

      if (active) {
        setThumbnailUrls(next);
      }
    })();

    return () => {
      active = false;
    };
  }, [uploadedDocs]);

  const openDoc = async (doc: StoredDoc) => {
    const path = (doc?.path || "").toString().trim();
    if (!path) {
      Alert.alert("Cannot open", "No file path saved for this upload.");
      return;
    }

    try {
      setLoadingPreview(true);
      const { data, error } = await supabase.storage
        .from(REQUEST_DOCS_BUCKET)
        .createSignedUrl(path, 60);

      if (error) throw error;
      const signedUrl = (data?.signedUrl || "").toString();
      if (!signedUrl) {
        Alert.alert("Cannot open", "Could not generate a file link.");
        return;
      }

      if (isImagePath(path)) {
        setPreviewUri(signedUrl);
        setPreviewName(pickFileName(doc));
        setPreviewOpen(true);
        return;
      }

      const can = await Linking.canOpenURL(signedUrl);
      if (!can) {
        Alert.alert("Cannot open", "Your device cannot open this file.");
        return;
      }

      await Linking.openURL(signedUrl);
    } catch {
      Alert.alert("Cannot open", "Failed to open the file.");
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={TEXT_DARK} />
        </Pressable>

        <Text style={styles.topTitle}>Status</Text>
        <View style={{ width: 44 }} />
      </View>

      {isInitialLoading ? (
        <View style={styles.initialLoadingWrap}>
          <ActivityIndicator size="large" color="#0B8F8B" />
          <View style={styles.initialSkeletonCard} />
          <View style={styles.initialSkeletonLine} />
          <View style={styles.initialSkeletonPanel} />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
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
        <View style={styles.infoShadow}>
          <View style={styles.infoCard}>
            <LinearGradient
              colors={headerStroke}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.infoTopStroke}
            />

            <Text style={styles.infoHeader}>{infoHeaderTitle}</Text>

            <View style={[styles.badge, { backgroundColor: badgeTheme.bg }]}> 
              <Text style={[styles.badgeText, { color: badgeTheme.text }]}>{badgeText}</Text>
            </View>

            <View style={styles.requestCodeBlock}>
              <Text style={styles.requestCodeLabel}>Request Code</Text>
              <Text style={styles.requestCodeValue}>{displayRequestCode}</Text>
              {isDbSyncing ? (
                <View style={styles.codeSyncRow}>
                  <ActivityIndicator size="small" color="#0B8F8B" />
                  <Text style={styles.codeSyncText}>Syncing latest details...</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.infoRows}>
              <InfoRow
                label={typeLabel(app?.category)}
                value={typeOfAssistance}
              />
              {coverageText ? (
                <InfoRow label="Coverage:" value={coverageText} />
              ) : null}
              <InfoRow
                label="Date of Application:"
                value={`${formatDate(createdAt)} • ${formatTime(createdAt)}`}
              />
            </View>

          </View>
        </View>

        <View style={styles.timelineWrap}>
          <View style={styles.progressPanel}>
            {timelineSteps.map((step, index) => (
              <View key={step.key} style={styles.progressRow}>
                <View style={styles.progressTrackCol}>
                  {(() => {
                    const isCurrent = index === currentStepIndex;
                    const isCompleted = index > currentStepIndex;
                    const showAlert = isCurrent;

                    return (
                      <View
                        style={[
                          styles.progressDot,
                          isCompleted && styles.progressDotActive,
                          showAlert && styles.progressDotCurrent,
                        ]}
                      >
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        ) : showAlert ? (
                          <Ionicons name="alert" size={11} color="#FFFFFF" />
                        ) : null}
                      </View>
                    );
                  })()}
                  {index < timelineSteps.length - 1 ? (
                    <View
                      style={[
                        styles.progressLine,
                        index >= currentStepIndex && styles.progressLineActive,
                      ]}
                    />
                  ) : null}
                </View>

                <View style={styles.progressCard}>
                  <Text style={styles.progressTitle}>{step.title}</Text>
                  <Text style={styles.progressDesc}>{step.description}</Text>
                  <Text style={styles.progressTime}>
                    {step.timestamp
                      ? `${formatDate(step.timestamp)} • ${formatTime(step.timestamp)}`
                      : "Waiting for update"}
                  </Text>

                  {isActionRequired &&
                  index === currentStepIndex &&
                  step.statusRaw === "action required" &&
                  requestTable &&
                  realRequestId ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/Status/ActionRequiredDetails",
                          params: {
                            id: realRequestId,
                            requestTable,
                            title: app?.title || "",
                            service: app?.service || "",
                            requestCode: requestCode || "",
                          },
                        } as any)
                      }
                      style={({ pressed }) => [
                        styles.timelineActionLinkWrap,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={styles.timelineActionLink}>View Details</Text>
                      <Ionicons name="chevron-forward" size={14} color="#D07C00" />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.docsWrap}>
            <View style={styles.docsHeader}>
              <Text style={styles.docsHeaderText}>Submitted Requirements</Text>
            </View>

            <View style={styles.docsBody}>
              {requiredReqDefs.map((r) => {
                const doc = docByReqKey.get(r.key);
                const fileName = doc ? pickFileName(doc) : "";
                const sizeTxt = doc ? formatBytes(pickFileSize(doc)) : "";
                const isPdf = (fileName || "").toLowerCase().endsWith(".pdf");
                const isImage = !!doc && isImagePath(doc.path);
                const thumbnailUri = doc ? thumbnailUrls[doc.path] : undefined;
                const statusIcon = doc ? attachmentStatusIcon(doc.status) : null;

                return (
                  <View key={r.key} style={styles.reqBlock}>
                    <View style={styles.reqTitleRow}>
                      {!doc ? (
                        <Ionicons
                          name="ellipse-outline"
                          size={16}
                          color={TEXT_MUTED}
                          style={{ marginTop: 1 }}
                        />
                      ) : statusIcon ? (
                        <Ionicons
                          name={statusIcon.name}
                          size={18}
                          color={statusIcon.color}
                          style={{ marginTop: 1 }}
                        />
                      ) : (
                        <View style={styles.reqNoStatusIcon} />
                      )}
                      <Text style={styles.reqTitle}>{r.label}</Text>
                    </View>

                    <Pressable
                      disabled={!doc}
                      onPress={() => (doc ? openDoc(doc) : null)}
                      style={({ pressed }) => [
                        styles.fileCardMini,
                        !doc && styles.fileCardMiniDisabled,
                        pressed && doc ? { opacity: 0.9 } : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.fileIconBoxMini,
                          !doc && styles.fileIconBoxMiniDisabled,
                        ]}
                      >
                        {isImage && thumbnailUri ? (
                          <Image
                            source={{ uri: thumbnailUri }}
                            style={styles.fileThumbnail}
                            resizeMode="cover"
                          />
                        ) : (
                          <Ionicons
                            name={
                              doc
                                ? isPdf
                                  ? "document-text"
                                  : "image"
                                : "document-outline"
                            }
                            size={16}
                            color={
                              doc
                                ? isPdf
                                  ? "#D94B4B"
                                  : "#0B8F8B"
                                : "#BDBDBD"
                            }
                          />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.fileNameMini} numberOfLines={1}>
                          {doc ? fileName : "No file submitted yet"}
                        </Text>
                        <Text style={styles.fileSizeMini} numberOfLines={1}>
                          {doc ? sizeTxt || " " : " "}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                );
              })}

              <View style={styles.reqBlock}>
                <View style={styles.reqTitleRow}>
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={TEXT_MUTED}
                    style={{ marginTop: 1 }}
                  />
                  <Text style={styles.reqTitle}>Additional Information</Text>
                </View>
                <View style={styles.additionalInfoCard}>
                  <Text style={styles.additionalInfoText}>{additionalInfoText}</Text>
                </View>
              </View>

              {optionalReqDef ? (
                (() => {
                  const doc = docByReqKey.get(optionalReqDef.key);
                  const fileName = doc ? pickFileName(doc) : "";
                  const isPdf = (fileName || "").toLowerCase().endsWith(".pdf");
                  const isImage = !!doc && isImagePath(doc.path);
                  const thumbnailUri = doc ? thumbnailUrls[doc.path] : undefined;
                  const statusIcon = doc ? attachmentStatusIcon(doc.status) : null;

                  return (
                    <View key={optionalReqDef.key} style={styles.reqBlock}>
                      <View style={styles.reqTitleRow}>
                        {!doc ? (
                          <Ionicons
                            name="ellipse-outline"
                            size={16}
                            color={TEXT_MUTED}
                            style={{ marginTop: 1 }}
                          />
                        ) : statusIcon ? (
                          <Ionicons
                            name={statusIcon.name}
                            size={18}
                            color={statusIcon.color}
                            style={{ marginTop: 1 }}
                          />
                        ) : (
                          <View style={styles.reqNoStatusIcon} />
                        )}
                        <Text style={styles.reqTitle}>{optionalReqDef.label}</Text>
                      </View>

                      <Pressable
                        disabled={!doc}
                        onPress={() => (doc ? openDoc(doc) : null)}
                        style={({ pressed }) => [
                          styles.fileCardMini,
                          !doc && styles.fileCardMiniDisabled,
                          pressed && doc ? { opacity: 0.9 } : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.fileIconBoxMini,
                            !doc && styles.fileIconBoxMiniDisabled,
                          ]}
                        >
                          {isImage && thumbnailUri ? (
                            <Image
                              source={{ uri: thumbnailUri }}
                              style={styles.fileThumbnail}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons
                              name={
                                doc
                                  ? isPdf
                                    ? "document-text"
                                    : "image"
                                  : "document-outline"
                              }
                              size={16}
                              color={
                                doc
                                  ? isPdf
                                    ? "#D94B4B"
                                    : "#0B8F8B"
                                  : "#BDBDBD"
                              }
                            />
                          )}
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.fileNameMini} numberOfLines={1}>
                            {doc ? fileName : "No optional attachment submitted"}
                          </Text>
                          <Text style={styles.fileSizeMini} numberOfLines={1}>
                            {doc ? " " : " "}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  );
                })()
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
      )}

      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <Pressable
          style={styles.previewOverlay}
          onPress={() => setPreviewOpen(false)}
        >
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{previewName}</Text>
            <Pressable
              onPress={() => setPreviewOpen(false)}
              style={({ pressed }) => [styles.previewCloseBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </Pressable>
          </View>

          <Pressable style={styles.previewContent} onPress={() => {}}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {loadingPreview ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : null}
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
  safe: { flex: 1, backgroundColor: BG },

  initialLoadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 14,
  },
  initialSkeletonCard: {
    width: "100%",
    height: 120,
    borderRadius: 14,
    backgroundColor: "#EEF3F3",
  },
  initialSkeletonLine: {
    width: "100%",
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F2F6F6",
  },
  initialSkeletonPanel: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: "#EEF3F3",
  },

  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EDED",
    backgroundColor: BG,
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

  body: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18 },

  infoShadow: {
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E7EEEE",
    paddingBottom: 12,
  },
  infoTopStroke: { height: 4, width: "100%" },

  infoHeader: {
    marginTop: 10,
    marginLeft: 12,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12,
    color: TEXT_DARK,
  },

  badge: {
    position: "absolute",
    right: 12,
    top: 10,
    backgroundColor: BADGE_PENDING,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10,
    color: "#4A2E5B",
  },

  requestCodeBlock: {
    marginTop: 12,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: "#D9ECEB",
    borderRadius: 10,
    backgroundColor: "#F6FEFE",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  requestCodeLabel: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  requestCodeValue: {
    marginTop: 4,
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 15,
    color: TEXT_DARK,
  },
  codeSyncRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  codeSyncText: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 10,
    color: TEXT_MUTED,
  },

  infoRows: { marginTop: 10, paddingHorizontal: 12, gap: 6 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  infoLabel: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.5,
    color: TEXT_DARK,
  },
  infoValue: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.5,
    color: TEXT_DARK,
  },

  timelineWrap: { marginTop: 10 },

  progressPanel: {
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EEEE",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: "row",
    gap: 10,
  },
  progressTrackCol: {
    width: 24,
    alignItems: "center",
  },
  progressDot: {
    width: 18,
    height: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    backgroundColor: "#F7F7F7",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotActive: {
    borderColor: GREEN,
    backgroundColor: GREEN,
  },
  progressDotCurrent: {
    borderColor: "#F0A13A",
    backgroundColor: "#F0A13A",
  },
  progressLine: {
    width: 2,
    flex: 1,
    minHeight: 30,
    backgroundColor: "#DADADA",
    marginTop: 4,
    marginBottom: 4,
  },
  progressLineActive: {
    backgroundColor: "#92D66A",
  },
  progressCard: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#EEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  progressTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 11,
    color: TEXT_DARK,
  },
  progressDesc: {
    marginTop: 4,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10,
    lineHeight: 14,
    color: TEXT_MUTED,
  },
  progressTime: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 9.5,
    color: TEXT_DARK,
  },
  timelineActionLinkWrap: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "#FFD59E",
    backgroundColor: "#FFF4E4",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  timelineActionLink: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10,
    color: "#D07C00",
  },

  line: {
    position: "absolute",
    left: LINE_X,
    top: 0,
    width: 2,
    backgroundColor: LINE,
  },
  node: {
    position: "absolute",
    left: NODE_X,
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE,
    backgroundColor: NODE,
  },

  greenNodeWrap: {
    position: "absolute",
    left: NODE_X - 2,
    width: 22,
    height: 22,
    borderRadius: 22,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  greenNode: {
    position: "absolute",
    left: NODE_X,
    width: 18,
    height: 18,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  timeLeft: {
    position: "absolute",
    left: 0,
    width: DATE_COL_W,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  timeDate: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 9.5,
    color: TEXT_MUTED,
    textAlign: "right",
  },
  timeClock: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 9.5,
    color: TEXT_MUTED,
    textAlign: "right",
  },

  eventCard: {
    position: "absolute",
    left: EVENT_LEFT,
    right: 10,
    borderRadius: 10,
    backgroundColor: "#EEF2F2",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  eventTitle: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.5,
    color: TEXT_DARK,
    marginBottom: 6,
  },
  eventDesc: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 9.5,
    lineHeight: 13,
    color: TEXT_MUTED,
  },

  submitBtn: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#DCEEEE",
    borderWidth: 1,
    borderColor: "#DCEEEE",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  submitBtnText: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.5,
    color: TEXT_DARK,
  },

  /* ✅ minimized panel */
  docsWrap: {
    marginTop: 10,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6E6E6",
    backgroundColor: "#FFFFFF",
  },
  docsHeader: {
    backgroundColor: "#88D34B",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  docsHeaderText: {
    fontFamily: FONT,
    fontWeight: "900",
    fontSize: 16,
    lineHeight: 18,
    color: "#FFFFFF",
  },
  docsBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },

  reqBlock: { marginBottom: 12 },
  reqTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  reqNoStatusIcon: {
    width: 18,
    height: 18,
  },
  reqTitle: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 12.5,
    color: TEXT_DARK,
  },

  /* ✅ smaller file card like your “good” screenshot */
  fileCardMini: {
    marginLeft: 26,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: 210,
  },
  fileCardMiniDisabled: {
    opacity: 0.7,
  },
  fileIconBoxMini: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#0B8F8B",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  fileIconBoxMiniDisabled: {
    borderColor: "#D5D5D5",
    backgroundColor: "#FAFAFA",
  },
  fileThumbnail: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#E8F4F4",
  },
  fileNameMini: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 12,
    color: TEXT_DARK,
  },
  fileSizeMini: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 11,
    color: TEXT_MUTED,
  },
  additionalInfoCard: {
    marginLeft: 26,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    backgroundColor: "#F9FAFA",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  additionalInfoText: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 11.5,
    lineHeight: 16,
    color: TEXT_DARK,
  },

  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  previewTitle: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 16,
    color: "#FFFFFF",
    marginRight: 16,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
