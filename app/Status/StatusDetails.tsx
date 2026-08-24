// app/Status/StatusDetails.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { fromDbFileType } from "@/AppCore/AttachmentSlotDbMapping";
import type { ApplicationItem } from "@/AppCore/AssistanceStatusApplicationsCache";
import { statusApplicationRealId } from "@/AppCore/AssistanceStatusApplicationsCache";
import { readStatusApplicationsCache } from "@/AppCore/StatusApplicationsRepository";
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
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { buildPreflightChoiceLines } from "@/AppCore/PreflightSelections";
import {
  requirementSlotsGroupedForService,
  resolveCatalogServiceIdForStatusHints,
} from "@/AppCore/StatusCatalogBridge";
import { enrichStatusApplicationItem } from "@/AppCore/ServiceCatalogDisplay";
import type { Category, ServiceStatus } from "@/AppCore/AppUiDomainTypes";
import {
  dbStatusForLabel,
  resolveStatusDetailsHeaderStatus,
  normalizeServiceStatus,
  statusBadgeTheme,
} from "@/AppCore/RequestStatusPresentation";
import {
  buildRequestTimelineSteps,
} from "@/AppCore/RequestStatusTimeline";
import { supabase } from "@/AppCore/SupabaseClient";
import { markRequestNotificationsRead } from "@/AppCore/UserNotificationsQuery";
import { COLORS, FONT_FAMILY_ROUNDED } from "@/AppCore/Theme";
import { RequestStatusTimelinePanel } from "@/components/RequestStatusTimelinePanel";
import {
  SubmittedRequirementsPanel,
  type StatusUploadedDoc,
} from "@/components/SubmittedRequirementsPanel";

const FONT = FONT_FAMILY_ROUNDED;

/* ========= THEME ========= */
const BG = COLORS.white;
const TEXT_DARK = COLORS.textDark;
const TEXT_MUTED = COLORS.textMuted;
const TEAL = COLORS.teal;

/* ========= DOC TYPES ========= */
type StoredDoc = StatusUploadedDoc;

type RequestDetailsRow = {
  id: string;
  service_id: string | null;
  service_name?: string | null;
  assistance_name?: string | null;
  category_slug?: string | null;
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
    const snapshot = String(requestRow?.service_name || "").trim();
    if (snapshot) return snapshot;
    const rt = getCatalogLookupRuntime();
    const sid = resolveServiceId(app?.service ?? "");
    if (sid && rt?.byServiceId[sid]?.displayName) {
      return rt.byServiceId[sid].displayName;
    }
    return app?.title || "—";
  }, [app?.service, app?.title, requestRow?.service_name]);

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
  const isActionRequired = badgeText === "Action Required";

  const timelineSteps = useMemo(
    () =>
      buildRequestTimelineSteps({
        auditHistory,
        fallbackStatus: requestRow?.status || app?.status,
        fallbackTimestamp:
          toMillis(requestRow?.updated_at) ||
          toMillis(requestRow?.submitted_at) ||
          toMillis(requestRow?.created_at) ||
          app?.createdAt,
      }),
    [
      auditHistory,
      requestRow?.status,
      requestRow?.updated_at,
      requestRow?.submitted_at,
      requestRow?.created_at,
      app?.status,
      app?.createdAt,
    ]
  );

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
          "id,service_id,service_name,assistance_name,category_slug,status,request_code,created_at,updated_at,submitted_at,additional_info,financial_request_type,payload";

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
                title: String(row.service_name || "").trim() || prev.title,
                categorySlug:
                  String(row.category_slug || "").trim() || prev.categorySlug,
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
          <RequestStatusTimelinePanel
            steps={timelineSteps}
            showActionRequiredLink={isActionRequired}
            actionRequiredParams={{
              requestId: realRequestId,
              title: app?.title || "",
              service: catalogServiceId || app?.service || "",
              requestCode: requestCode || "",
            }}
          />
          <SubmittedRequirementsPanel
            catalogReady={catalogReady}
            required={requirementGroups.required}
            optionalRequirements={requirementGroups.optionalRequirements}
            additionalAttachment={requirementGroups.additionalAttachment}
            docs={uploadedDocs}
            additionalInfoText={additionalInfoText}
          />
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: "400",
    color: "#9AA6A6",
    lineHeight: 20,
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
    fontSize: 14,
    color: TEXT_DARK,
  },
  infoValue: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: TEXT_DARK,
  },

  timelineWrap: { marginTop: 10 },

});
