// app/Status/StatusDetails.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;

/* ========= STORAGE ========= */
const STORAGE_KEY_STATUS_LIST = "apoyo_status_applications_v1";

/* ========= THEME ========= */
const BG = "#FFFFFF";
const TEXT_DARK = "#2B2B2B";
const TEXT_MUTED = "#7B7B7B";

/* badge */
const BADGE_PENDING = "#E8C6FF";

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
type ServiceStatus = "Pending" | "In Progress" | "Action Required" | "Approved";

function normalizeStatus(raw?: string): ServiceStatus {
  if (!raw) return "Pending";
  const s = raw.toString().trim().toLowerCase();
  if (s === "submitted" || s === "pending") return "Pending";
  if (s === "resubmitted") return "Pending";
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
};

/* ========= DOC TYPES ========= */
type StoredDoc = {
  uri?: string;
  name?: string;
  fileName?: string;
  filename?: string;
  size?: number;
  fileSize?: number;
  bytes?: number;
  type?: string;
  mimeType?: string;

  requirementKey?: string;
  reqKey?: string;
  requirementId?: string;
  label?: string;
  requirementLabel?: string;
};

type ReqDef = { key: string; label: string };

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

function idPrefix(category?: Category) {
  switch (category) {
    case "financial":
      return "FAHE";
    case "burial":
      return "BUHE";
    case "medical":
    default:
      return "MAHE";
  }
}

function makeAppId(category: Category | undefined, createdAt: number) {
  const year = new Date(createdAt).getFullYear();
  return `${idPrefix(category)}-${year}-001`;
}

/* ========= helpers for docs ========= */
function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function pickFileName(d: StoredDoc) {
  return (
    d.fileName ||
    d.filename ||
    d.name ||
    (typeof d.uri === "string" ? d.uri.split("/").pop() : "") ||
    "File"
  );
}

function pickFileSize(d: StoredDoc): number | undefined {
  const v =
    typeof d.size === "number"
      ? d.size
      : typeof d.fileSize === "number"
      ? d.fileSize
      : typeof d.bytes === "number"
      ? d.bytes
      : undefined;
  return v;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function normalizeDocs(raw: any): StoredDoc[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as StoredDoc[];
  if (typeof raw === "object") {
    const arr =
      (Array.isArray((raw as any).docs) && (raw as any).docs) ||
      (Array.isArray((raw as any).files) && (raw as any).files) ||
      (Array.isArray((raw as any).uploads) && (raw as any).uploads) ||
      (Array.isArray((raw as any).items) && (raw as any).items) ||
      null;
    if (arr) return arr as StoredDoc[];

    const values = Object.values(raw);
    if (values.every((x) => typeof x === "object"))
      return values as StoredDoc[];
  }
  return [];
}

function requirementsFor(category?: Category, title?: string): ReqDef[] {
  const t = (title || "").toLowerCase();

  const MEDICAL: ReqDef[] = [
    { key: "personal_letter", label: "Personal Letter" },
    { key: "voters_id", label: "Patient's Voters ID/ Certificate" },
    { key: "barangay_endorsement", label: "Barangay Endorsement" },
    { key: "indigency", label: "Indigency Certificate" },
    { key: "valid_id", label: "Patient's Valid ID" },
    { key: "medical_certificate", label: "Medical Certificate" },
    { key: "prescription", label: "Doctor's Prescription" },
    { key: "quotation", label: "Quotation of Expenses" },
  ];

  const FINANCIAL: ReqDef[] = [
    { key: "personal_letter", label: "Personal Letter" },
    { key: "valid_id", label: "Valid ID" },
    { key: "barangay_endorsement", label: "Barangay Endorsement" },
    { key: "indigency", label: "Indigency Certificate" },
    { key: "proof", label: "Proof / Supporting Document" },
  ];

  const BURIAL: ReqDef[] = [
    { key: "personal_letter", label: "Personal Letter" },
    { key: "death_certificate", label: "Death Certificate" },
    { key: "valid_id", label: "Valid ID" },
    { key: "barangay_endorsement", label: "Barangay Endorsement" },
    { key: "indigency", label: "Indigency Certificate" },
    { key: "funeral_contract", label: "Funeral Contract / Quotation" },
  ];

  if (
    category === "burial" ||
    t.includes("burial") ||
    t.includes("cremation") ||
    t.includes("columbarium") ||
    t.includes("colombarium")
  )
    return BURIAL;

  if (
    category === "financial" ||
    t.includes("financial") ||
    t.includes("monetary")
  )
    return FINANCIAL;

  return MEDICAL;
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
  }>();

  const [app, setApp] = useState<ApplicationItem | null>(null);

  const [showDocs, setShowDocs] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<StoredDoc[]>([]);

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
              });
              return;
            }
          }
        }
      } catch {}

      const fallbackCategory =
        (params?.category as Category) ?? ("medical" as Category);
      const fallbackCreatedAt = Number(params?.createdAt) || Date.now();
      const fallbackStatus = normalizeStatus((params?.status as string) ?? "") ?? "Pending";
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
      });
    })();
  }, [
    params?.id,
    params?.category,
    params?.createdAt,
    params?.status,
    params?.title,
    params?.applicationId,
  ]);

  const badgeText = app?.status ?? "Pending";
  const createdAt = app?.createdAt ?? Date.now();

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

  const appId = useMemo(() => {
    if (app?.applicationId) return app.applicationId;
    const passed = (params?.applicationId || "").toString().trim();
    if (passed) return passed;
    return makeAppId(app?.category, createdAt);
  }, [app?.applicationId, app?.category, createdAt, params?.applicationId]);

  const headerStroke = useMemo<[string, string]>(
    () => topBarGradient(app?.category),
    [app?.category]
  );

  const reqDefs = useMemo(() => {
    return requirementsFor(app?.category, app?.title);
  }, [app?.category, app?.title]);

  useEffect(() => {
    (async () => {
      if (!app?.id) return;

      const id = String(app.id);
      const cat = String(app.category || "medical");
      const titleSlug = slugify(app.title || "");

      const keysToTry = [
        `apoyo_docs_${id}`,
        `apoyo_documents_${id}`,
        `apoyo_uploads_${id}`,
        `apoyo_files_${id}`,

        `apoyo_${cat}_docs_${id}`,
        `apoyo_${cat}_documents_${id}`,
        `apoyo_${cat}_uploads_${id}`,
        `apoyo_${cat}_files_${id}`,

        `apoyo_${cat}_${titleSlug}_docs_${id}`,
        `apoyo_${cat}_${titleSlug}_documents_${id}`,
        `apoyo_${cat}_${titleSlug}_uploads_${id}`,

        appId ? `apoyo_docs_${appId}` : "",
        appId ? `apoyo_${cat}_docs_${appId}` : "",
        appId ? `apoyo_${cat}_uploads_${appId}` : "",
      ].filter(Boolean);

      let foundDocs: StoredDoc[] = [];
      for (const k of keysToTry) {
        try {
          const raw = await AsyncStorage.getItem(k);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const docs = normalizeDocs(parsed);
          if (docs.length) {
            foundDocs = docs;
            break;
          }
        } catch {}
      }

      setUploadedDocs(foundDocs);
    })();
  }, [app?.id, app?.category, app?.title, appId]);

  const docByReqKey = useMemo(() => {
    const map = new Map<string, StoredDoc>();

    for (const d of uploadedDocs) {
      const k =
        (
          d.requirementKey ||
          d.reqKey ||
          d.requirementId ||
          (d.label ? slugify(d.label) : "") ||
          (d.requirementLabel ? slugify(d.requirementLabel) : "")
        )?.toString() || "";
      if (k && !map.has(k)) map.set(k, d);
    }

    for (const d of uploadedDocs) {
      const fn = pickFileName(d).toLowerCase();
      for (const r of reqDefs) {
        if (map.has(r.key)) continue;

        if (r.key === "personal_letter" && fn.includes("letter"))
          map.set(r.key, d);
        else if (
          r.key === "voters_id" &&
          (fn.includes("voter") || fn.includes("certificate"))
        )
          map.set(r.key, d);
        else if (r.key === "barangay_endorsement" && fn.includes("endorse"))
          map.set(r.key, d);
        else if (r.key === "indigency" && fn.includes("indigen"))
          map.set(r.key, d);
        else if (r.key === "valid_id" && fn.includes("id")) map.set(r.key, d);
        else if (
          r.key === "medical_certificate" &&
          (fn.includes("medical") || fn.includes("cert"))
        )
          map.set(r.key, d);
        else if (r.key === "prescription" && fn.includes("prescrip"))
          map.set(r.key, d);
        else if (
          r.key === "quotation" &&
          (fn.includes("quote") || fn.includes("quotation"))
        )
          map.set(r.key, d);
        else if (r.key === "death_certificate" && fn.includes("death"))
          map.set(r.key, d);
        else if (
          r.key === "funeral_contract" &&
          (fn.includes("funeral") ||
            fn.includes("contract") ||
            fn.includes("quotation") ||
            fn.includes("quote"))
        )
          map.set(r.key, d);
      }
    }

    return map;
  }, [uploadedDocs, reqDefs]);

  const openDoc = async (doc: StoredDoc) => {
    const uri = (doc?.uri || "").toString().trim();
    if (!uri) {
      Alert.alert("Cannot open", "No file URI saved for this upload.");
      return;
    }
    try {
      const can = await Linking.canOpenURL(uri);
      if (!can) {
        Alert.alert("Cannot open", "Your device cannot open this file.");
        return;
      }
      await Linking.openURL(uri);
    } catch {
      Alert.alert("Cannot open", "Failed to open the file.");
    }
  };

  const NODE1 = 14 + TIMELINE_Y_OFFSET;
  const NODE2 = 70 + TIMELINE_Y_OFFSET;
  const NODE3 = 126 + TIMELINE_Y_OFFSET;
  const NODE4 = 182 + TIMELINE_Y_OFFSET;

  const STEP1 = 232 + TIMELINE_Y_OFFSET;
  const STEP2 = 292 + TIMELINE_Y_OFFSET;

  const EXTRA = showDocs ? 420 : 0;
  const LINE_HEIGHT = STEP2 + 42 + EXTRA;

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

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
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

            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>

            <View style={styles.infoRows}>
              <InfoRow
                label={typeLabel(app?.category)}
                value={typeOfAssistance}
              />
              <InfoRow
                label="Date of Application:"
                value={formatDate(createdAt)}
              />
              <InfoRow label="Application ID:" value={appId} />
            </View>
          </View>
        </View>

        <View style={styles.timelineWrap}>
          <View style={[styles.line, { height: LINE_HEIGHT }]} />

          <View style={[styles.node, { top: NODE1 }]} />
          <View style={[styles.node, { top: NODE2 }]} />
          <View style={[styles.node, { top: NODE3 }]} />
          <View style={[styles.node, { top: NODE4 }]} />

          <View style={[styles.greenNodeWrap, { top: STEP1 }]} />
          <View style={[styles.greenNode, { top: STEP1 + 2 }]}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>

          <View style={[styles.timeLeft, { top: STEP1 - 8 }]}>
            <Text style={styles.timeDate} numberOfLines={1}>
              {formatDate(createdAt)}
            </Text>
            <Text style={styles.timeClock} numberOfLines={1}>
              {formatTime(createdAt)}
            </Text>
          </View>

          <View style={[styles.eventCard, { top: STEP1 - 14 }]}>
            <Text style={styles.eventTitle}>Pending review</Text>
            <Text style={styles.eventDesc}>
              The document has landed in the admin’s inbox but hasn’t{"\n"}been
              opened yet.
            </Text>
          </View>

          <View style={[styles.greenNodeWrap, { top: STEP2 }]} />
          <View style={[styles.greenNode, { top: STEP2 + 2 }]}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>

          <View style={[styles.timeLeft, { top: STEP2 - 8 }]}>
            <Text style={styles.timeDate} numberOfLines={1}>
              {formatDate(createdAt)}
            </Text>
            <Text style={styles.timeClock} numberOfLines={1}>
              {formatTime(createdAt)}
            </Text>
          </View>

          <View style={[styles.eventCard2, { top: STEP2 - 18 }]}>
            <Pressable
              onPress={() => {}}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.submitBtnText}>
                Submit {assistanceTitle(app?.category)} Documents
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowDocs((v) => !v)}
              style={({ pressed }) => [
                styles.viewDocsRow,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.viewDocsText}>View Documents</Text>
              <Ionicons
                name={showDocs ? "chevron-up" : "chevron-down"}
                size={16}
                color={TEXT_MUTED}
              />
            </Pressable>

            {/* ✅ MINIMIZED DESIGN LIKE YOUR 2ND SCREENSHOT */}
            {showDocs ? (
              <View style={styles.docsWrap}>
                <View style={styles.docsHeader}>
                  <Text style={styles.docsHeaderText}>
                    Submitted Requirements
                  </Text>
                </View>

                <View style={styles.docsBody}>
                  {reqDefs.map((r) => {
                    const doc = docByReqKey.get(r.key);
                    const fileName = doc ? pickFileName(doc) : "";
                    const sizeTxt = doc ? formatBytes(pickFileSize(doc)) : "";
                    const isPdf =
                      (fileName || "").toLowerCase().endsWith(".pdf") ||
                      (doc?.mimeType || "").toLowerCase().includes("pdf") ||
                      (doc?.type || "").toLowerCase().includes("pdf");

                    return (
                      <View key={r.key} style={styles.reqBlock}>
                        <View style={styles.reqTitleRow}>
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color={GREEN}
                            style={{ marginTop: 1 }}
                          />
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
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text style={styles.fileNameMini} numberOfLines={1}>
                              {doc ? fileName : "No file selected"}
                            </Text>
                            <Text style={styles.fileSizeMini} numberOfLines={1}>
                              {doc ? sizeTxt || " " : " "}
                            </Text>
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ height: STEP2 + 72 + EXTRA }} />
        </View>
      </ScrollView>
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

  timelineWrap: { position: "relative", marginTop: 100, paddingTop: 26 },

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

  eventCard2: {
    position: "absolute",
    left: EVENT_LEFT,
    right: 10,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 0,
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

  viewDocsRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 2,
  },
  viewDocsText: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10,
    color: TEXT_MUTED,
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
});
