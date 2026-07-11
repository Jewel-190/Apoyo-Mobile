// app/Status/StatusDetails.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
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
import { inferAttachmentName } from "@/AppCore/AssistanceRequestAttachments";
import type { ApplicationItem } from "@/AppCore/AssistanceStatusApplicationsCache";
import { statusApplicationRealId } from "@/AppCore/AssistanceStatusApplicationsCache";
import { readStatusApplicationsCache } from "@/AppCore/StatusApplicationsRepository";
import { fromDbFileType } from "@/AppCore/AttachmentSlotDbMapping";
import {
  categoryAssistanceTitle,
  resolveApplicationCategorySlug,
  statusCardHeaderGradientForSlug,
  typeOfAssistanceLabel,
} from "@/AppCore/CategoryCatalogUi";
import {
  getCatalogLookupRuntime,
  resolveServiceId,
} from "@/AppCore/CatalogLookupRuntime";
import { fileIconName } from "@/AppCore/FileKindIcons";
import { getRequestDocumentSignedUrlCached } from "@/AppCore/RequestDocumentUpload";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { buildPreflightChoiceLines } from "@/AppCore/PreflightSelections";
import {
  requirementSlotsGroupedForService,
  resolveCatalogServiceIdForStatusHints,
  type StatusScreenRequirementDef,
} from "@/AppCore/StatusCatalogBridge";
import { enrichStatusApplicationItem } from "@/AppCore/ServiceCatalogDisplay";
import type { Category, ServiceStatus } from "@/AppCore/AppUiDomainTypes";
import {
  attachmentStatusIcon,
  dbStatusForLabel,
  resolveStatusDetailsHeaderStatus,
  normalizeServiceStatus,
  statusBadgeTheme,
  STATUS_TIMELINE_PROGRESS_ACCENT,
  statusTimelineActionLinkTheme,
  statusTimelineDotTheme,
} from "@/AppCore/RequestStatusPresentation";
import { ASSISTANCE_REQUESTS_TABLE } from "@/AppCore/AssistanceRequestSql";
import { supabase } from "@/AppCore/SupabaseClient";
import { markRequestNotificationsRead } from "@/AppCore/UserNotificationsQuery";
import { COLORS, FONT_FAMILY_ROUNDED } from "@/AppCore/Theme";

const FONT = FONT_FAMILY_ROUNDED;

/* ========= THEME ========= */
const BG = COLORS.white;
const TEXT_DARK = COLORS.textDark;
const TEXT_MUTED = COLORS.textMuted;
const TEAL = COLORS.teal;

/* timeline */
const LINE = "#DADADA";
const NODE = "#CFCFCF";

/* layout */
const DATE_COL_W = 76;
const DATE_GAP = 8;
const LINE_X = DATE_COL_W + DATE_GAP;

const NODE_SIZE = 18;
const NODE_X = LINE_X - NODE_SIZE / 2;

const EVENT_LEFT = LINE_X + 12;
const TIMELINE_Y_OFFSET = 18;

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
  service_id: string | null;
  status: string | null;
  request_code: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  additional_info: string | null;
  financial_request_type?: string | null;
  payload?: unknown;
};

type AuditStatusLogRow = {
  action: string;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  changed_at: string;
};

function normalizeRawStatus(raw?: string | null): string {
  const s = (raw || "").toString().trim().toLowerCase().replace(/_/g, " ");
  if (!s) return "pending";
  if (s === "submitted") return "pending";
  if (s === "resubmitted") return "resubmitted";
  if (s === "inprogress" || s === "processing") return "in progress";
  if (s === "action required") return "action required";
  return s;
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
  if (s === "for approval") {
    return "Your request is queued for final approval.";
  }
  if (s === "scheduled") {
    return "Your assistance has been scheduled. Watch for updates from the office.";
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

function findCachedApplication(
  list: ApplicationItem[],
  requestKey: string
): ApplicationItem | null {
  const key = statusApplicationRealId(requestKey);
  if (!key) return null;
  return list.find((x) => statusApplicationRealId(x) === key) ?? null;
}

export default function StatusDetails() {
  const { bundle } = useAssistanceCatalog();
  const catalogReady = !!bundle?.runtime;
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

  const hydrateAppFromStatusCache = useCallback(async (requestKey: string) => {
    const key = statusApplicationRealId(requestKey);
    if (!key) return;

    try {
      const cached = await readStatusApplicationsCache();
      const found = findCachedApplication(cached, key);
      if (!found) return;

      const cachedDbStatus = dbStatusForLabel(found.status);

      setApp((prev) =>
        enrichStatusApplicationItem({
          ...(prev ?? found),
          ...found,
          id: prev?.id ?? found.id,
        })
      );
      setRequestRow((prev) =>
        prev ? { ...prev, status: cachedDbStatus } : prev
      );
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const paramKey = String(params?.id ?? "");
      const found = findCachedApplication(
        await readStatusApplicationsCache(),
        paramKey
      );
      if (found) {
        setApp(enrichStatusApplicationItem(found));
        return;
      }

      const fallbackCategory =
        (params?.category as Category) ?? ("uncategorized" as Category);
      const fallbackCreatedAt = Number(params?.createdAt) || Date.now();
      const fallbackStatus =
        normalizeServiceStatus((params?.status as string) ?? "");
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

  const timelineActionLink = statusTimelineActionLinkTheme();

  const badgeText = useMemo(
    () =>
      resolveStatusDetailsHeaderStatus({
        requestStatus: requestRow?.status,
        attachments: uploadedDocs,
        routedStatus: app?.status,
      }),
    [app?.status, requestRow?.status, uploadedDocs]
  );
  const createdAt = app?.createdAt ?? Date.now();
  const badgeTheme = useMemo(
    () => statusBadgeTheme(badgeText as ServiceStatus),
    [badgeText]
  );

  const categorySlug = useMemo(
    () => (app ? resolveApplicationCategorySlug(app) : ""),
    [app]
  );

  const infoHeaderTitle = useMemo(
    () => `${categoryAssistanceTitle(categorySlug)} Information`,
    [categorySlug]
  );

  const typeOfAssistance = useMemo(() => {
    const rt = getCatalogLookupRuntime();
    const sid = resolveServiceId(app?.service ?? "");
    if (sid && rt?.byServiceId[sid]?.displayName) {
      return rt.byServiceId[sid].displayName;
    }
    return app?.title || "—";
  }, [app?.service, app?.title]);

  const catalogServiceId = useMemo(() => {
    const fromRow = (requestRow?.service_id || "").trim();
    if (fromRow && getCatalogLookupRuntime()?.byServiceId[fromRow]) {
      return fromRow;
    }
    const fromApp = resolveServiceId(app?.service ?? "");
    if (fromApp) return fromApp;
    return resolveCatalogServiceIdForStatusHints({
      service: app?.service,
      title: app?.title,
      category: app?.categorySlug ?? app?.category,
    });
  }, [
    app?.service,
    app?.title,
    app?.category,
    app?.categorySlug,
    requestRow?.service_id,
    catalogReady,
  ]);

  useEffect(() => {
    if (!catalogReady) return;
    setApp((prev) => (prev ? enrichStatusApplicationItem(prev) : prev));
  }, [catalogReady, bundle?.services?.length]);
  const realRequestId = useMemo(() => {
    const id = (app?.id || "").toString();
    return id.startsWith("draft_") ? id.replace("draft_", "") : id;
  }, [app?.id]);

  useEffect(() => {
    if (!realRequestId) return;

    let active = true;

    (async () => {
      try {
        await markRequestNotificationsRead(realRequestId);
      } catch (e) {
        if (active) {
          console.log("Status details notification read sync failed:", e);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [realRequestId]);

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
  const preflightChoiceLines = useMemo(() => {
    if (!catalogServiceId) return [];
    return buildPreflightChoiceLines(catalogServiceId, {
      payload: requestRow?.payload,
      financialRequestType: requestRow?.financial_request_type ?? null,
    });
  }, [
    catalogServiceId,
    requestRow?.financial_request_type,
    requestRow?.payload,
  ]);
  const normalizedStatus = useMemo(
    () => normalizeRawStatus(badgeText),
    [badgeText]
  );
  const isActionRequired = badgeText === "Action Required";

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
          title: normalizeServiceStatus(statusRaw),
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
        title: normalizeServiceStatus(requestRow?.status || app?.status),
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
      const requestKey = String(params?.id ?? "");
      void hydrateAppFromStatusCache(requestKey);
      setRefreshTick((x) => x + 1);
      return () => {};
    }, [hydrateAppFromStatusCache, params?.id])
  );

  useEffect(() => {
    if (!app?.id) return;

    const realId = app.id.startsWith("draft_")
      ? app.id.replace("draft_", "")
      : app.id;

    let active = true;

    (async () => {
      try {
        setIsDbSyncing(true);
        const requestSelectColumns =
          "id,service_id,status,request_code,created_at,updated_at,submitted_at,additional_info,financial_request_type,payload";

        const { data, error } = await supabase
          .from("assistance_requests")
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
              const next: ApplicationItem = {
                ...prev,
                status: normalizeServiceStatus(row.status || prev.status),
                service:
                  typeof row.service_id === "string" && row.service_id.trim()
                    ? row.service_id.trim()
                    : prev.service,
                requestCode:
                  typeof row.request_code === "string" && row.request_code.trim()
                    ? row.request_code.trim()
                    : prev.requestCode,
                createdAt:
                  toMillis(row.created_at) ||
                  toMillis(row.submitted_at) ||
                  prev.createdAt,
              };
              return enrichStatusApplicationItem(next);
            });
          }
        }

        const { data: auditData, error: auditError } = await supabase
          .from("audit_logs")
          .select("action,old_status,new_status,changed_by,changed_at")
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
          .eq("assistance_request_id", realId)
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

          const slotMap: Record<string, string> = catalogServiceId
            ? getCatalogLookupRuntime()?.byServiceId[catalogServiceId]
                ?.attachmentSlotMap ?? {}
            : {};

          setUploadedDocs(
            rows
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
  }, [app?.id, catalogServiceId, refreshTick]);

  const headerStroke = useMemo<[string, string]>(
    () => statusCardHeaderGradientForSlug(categorySlug),
    [categorySlug]
  );

  const requirementGroups = useMemo(
    () => requirementSlotsGroupedForService(catalogServiceId),
    [catalogServiceId, catalogReady]
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
          const signedUrl = await getRequestDocumentSignedUrlCached(
            doc.path,
            3600
          );
          if (signedUrl) {
            next[doc.path] = signedUrl;
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
      const signedUrl = await getRequestDocumentSignedUrlCached(path, 60);
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
          <ActivityIndicator size="large" color={TEAL} />
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
            tintColor={TEAL}
            colors={[TEAL]}
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
                  <ActivityIndicator size="small" color={TEAL} />
                  <Text style={styles.codeSyncText}>Syncing latest details...</Text>
                </View>
              ) : null}
            </View>

            {preflightChoiceLines.length > 0 ? (
              <View style={styles.choiceCardWrap}>
                <View style={styles.choiceCard}>
                  <Text style={styles.choiceCardTitle}>Your selections</Text>
                  {preflightChoiceLines.map((line, idx) => (
                    <View
                      key={`choice-${idx}-${line.label}`}
                      style={[
                        styles.choiceRow,
                        idx > 0 ? styles.choiceRowBorder : null,
                      ]}
                    >
                      <Text style={styles.choiceLabel}>{line.label}</Text>
                      <Text style={styles.choiceValue}>{line.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.infoRows}>
              <InfoRow
                label={typeOfAssistanceLabel(categorySlug)}
                value={typeOfAssistance}
              />
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
                    const stepTheme = statusTimelineDotTheme(
                      step.title as ServiceStatus
                    );

                    return (
                      <View
                        style={[
                          styles.progressDot,
                          isCompleted && styles.progressDotActive,
                          isCurrent && {
                            borderColor: stepTheme.bg,
                            borderWidth: 6,
                            backgroundColor: "#FFFFFF",
                          },
                        ]}
                      >
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        ) : isCurrent &&
                          step.statusRaw === "action required" ? (
                          <Ionicons
                            name="alert"
                            size={11}
                            color={stepTheme.bg}
                          />
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
                  catalogServiceId &&
                  realRequestId ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/Status/ActionRequiredDetails",
                          params: {
                            id: realRequestId,
                            requestTable: ASSISTANCE_REQUESTS_TABLE,
                            title: app?.title || "",
                            service: catalogServiceId || app?.service || "",
                            requestCode: requestCode || "",
                          },
                        } as any)
                      }
                      style={({ pressed }) => [
                        styles.timelineActionLinkWrap,
                        {
                          borderColor: timelineActionLink.border,
                          backgroundColor: timelineActionLink.background,
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timelineActionLink,
                          { color: timelineActionLink.text },
                        ]}
                      >
                        View Details
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={timelineActionLink.icon}
                      />
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
              {!catalogReady && !requirementGroups.required.length ? (
                <Text style={styles.docsCatalogHint}>
                  Loading requirement labels from catalog…
                </Text>
              ) : null}
              {requirementGroups.required.map((r) => (
                <RequirementDocRow
                  key={r.key}
                  def={r}
                  doc={docByReqKey.get(r.key)}
                  thumbnailUrls={thumbnailUrls}
                  emptyLabel="No file submitted yet"
                  onOpenDoc={openDoc}
                />
              ))}

              {requirementGroups.optionalRequirements.map((r) => (
                <RequirementDocRow
                  key={r.key}
                  def={r}
                  doc={docByReqKey.get(r.key)}
                  thumbnailUrls={thumbnailUrls}
                  emptyLabel="No optional file submitted"
                  onOpenDoc={openDoc}
                />
              ))}

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
                {requirementGroups.additionalAttachment ? (
                  <View style={styles.additionalAttachmentWrap}>
                    <RequirementDocRow
                      def={requirementGroups.additionalAttachment}
                      doc={docByReqKey.get(requirementGroups.additionalAttachment.key)}
                      thumbnailUrls={thumbnailUrls}
                      emptyLabel="No additional attachment submitted"
                      onOpenDoc={openDoc}
                      compactTitle
                    />
                  </View>
                ) : null}
              </View>
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

function RequirementDocRow(props: {
  def: StatusScreenRequirementDef;
  doc?: StoredDoc;
  thumbnailUrls: Record<string, string>;
  emptyLabel: string;
  onOpenDoc: (doc: StoredDoc) => void;
  compactTitle?: boolean;
}) {
  const { def, doc, thumbnailUrls, emptyLabel, onOpenDoc, compactTitle } = props;
  const fileName = doc ? pickFileName(doc) : "";
  const sizeTxt = doc ? formatBytes(pickFileSize(doc)) : "";
  const isImage = !!doc && isImagePath(doc.path);
  const thumbnailUri = doc ? thumbnailUrls[doc.path] : undefined;
  const statusIcon = doc ? attachmentStatusIcon(doc.status) : null;
  const iconName = doc ? fileIconName(undefined, fileName) : "document-outline";

  return (
    <View style={compactTitle ? styles.reqBlockNested : styles.reqBlock}>
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
        <Text style={styles.reqTitle}>{def.label}</Text>
      </View>

      <Pressable
        disabled={!doc}
        onPress={() => (doc ? onOpenDoc(doc) : null)}
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
              name={iconName}
              size={16}
              color={doc ? TEAL : "#BDBDBD"}
            />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.fileNameMini} numberOfLines={1}>
            {doc ? fileName : emptyLabel}
          </Text>
          <Text style={styles.fileSizeMini} numberOfLines={1}>
            {doc ? sizeTxt || " " : " "}
          </Text>
        </View>
      </Pressable>
    </View>
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10,
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

  choiceCardWrap: {
    marginTop: 10,
    marginHorizontal: 12,
  },
  choiceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#D8ECEC",
  },
  choiceCardTitle: {
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    color: TEAL,
    marginBottom: 8,
  },
  choiceRow: {
    paddingVertical: 6,
  },
  choiceRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E6ECEC",
  },
  choiceLabel: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "400",
    color: "#9AA6A6",
    lineHeight: 17,
  },
  choiceValue: {
    marginTop: 4,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    color: TEAL,
    lineHeight: 20,
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
    borderColor: STATUS_TIMELINE_PROGRESS_ACCENT.completedDot,
    backgroundColor: STATUS_TIMELINE_PROGRESS_ACCENT.completedDot,
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
    backgroundColor: STATUS_TIMELINE_PROGRESS_ACCENT.completedLine,
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
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  timelineActionLink: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 10,
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
    backgroundColor: STATUS_TIMELINE_PROGRESS_ACCENT.completedDot,
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
  docsCatalogHint: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 11,
    color: TEXT_MUTED,
    marginBottom: 10,
  },

  reqBlock: { marginBottom: 12 },
  reqBlockNested: { marginTop: 10, marginBottom: 0 },
  additionalAttachmentWrap: {
    marginTop: 4,
  },
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
    borderColor: TEAL,
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
