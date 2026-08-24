/**
 * File submission step: attachments, additional info, draft lifecycle, submit.
 * Page-local hook + UI (formerly `useRequestForm` + `UnifiedAssistanceRequestScreen`).
 */
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import {
  Redirect,
  useGlobalSearchParams,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ROUTES } from "@/AppCore/AppRoutePaths";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { fileIconName, fileKindLabel } from "@/AppCore/FileKindIcons";
import {
  getCatalogLookupRuntime,
  resolveServiceId,
  type CatalogServiceRuntime,
  type CatalogTipItem,
} from "@/AppCore/CatalogLookupRuntime";
import { COLORS, FONT_FAMILY_ROUNDED } from "@/AppCore/Theme";
import {
  deleteRequestAttachment as deleteAttachmentRow,
  inferAttachmentName,
  listRequestAttachments,
  upsertRequestAttachment,
} from "@/AppCore/AssistanceRequestAttachments";
import { supabase } from "@/AppCore/SupabaseClient";
import {
  MAX_REQUEST_FILE_BYTES,
  deleteRequestDocument,
  getRequestDocumentSignedUrlCached,
  uploadRequestDocument,
  type UploadFileInput,
} from "@/AppCore/RequestDocumentUpload";
import {
  ASSISTANCE_REQUESTS_TABLE,
  buildAssistanceDraftInsert,
  insertAssistanceDraftSerialized,
  partitionAssistanceRowPatch,
  submitRequest,
} from "@/AppCore/AssistanceRequestSql";
import { upsertSubmittedStatusApplication } from "@/AppCore/AssistanceStatusApplicationsCache";
import { markStatusApplicationsCacheDirty } from "@/AppCore/StatusApplicationsRepository";
import { toDbFileType } from "@/AppCore/AttachmentSlotDbMapping";
import { isOptionalAttachmentSlot } from "@/AppCore/CatalogContentParse";
import {
  type ServiceId,
  getService,
  successRouteForService,
  tableForService,
} from "@/AppCore/AssistanceServiceDefinitions";
import { useAuthSession } from "@/AppCore/UseAuthSession";
import {
  buildPreflightChoiceLines,
  draftPatchFromRouteParams,
} from "@/AppCore/PreflightSelections";
import {
  defaultServiceFormPath,
  normalizeRouteServiceId,
  pickServiceIdFromSearchParams,
  REQUEST_FIELDS_PATH,
} from "@/AppCore/RequestPipelineRoutes";

function formatSubmitError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.details === "string" && o.details.trim()) return o.details.trim();
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint.trim();
    if (typeof o.code === "string" && o.code.trim()) return o.code.trim();
  }
  return "Submission failed. Please try again.";
}

function NetworkBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      setOnline(Boolean(s.isConnected));
    });
    return () => unsub();
  }, []);

  if (online) return null;

  return (
    <View style={networkBannerStyles.banner}>
      <Text style={networkBannerStyles.text}>
        You&apos;re offline. File uploads and saving to the server need a connection.
      </Text>
    </View>
  );
}

const networkBannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  text: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    textAlign: "center",
  },
});

function attachmentLooksLikeImage(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return false;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(lower);
}

type AttachmentFileRowProps = {
  storagePath: string;
  label: string;
  fileName: string;
  kind: string;
  icon: ReturnType<typeof fileIconName>;
  required?: boolean;
  /** When true, thumbnail area shows a spinner (replacing file). */
  replacing?: boolean;
  onRemove?: () => void;
};

function AttachmentFileRow(props: AttachmentFileRowProps) {
  const isImage = useMemo(
    () => attachmentLooksLikeImage(props.fileName),
    [props.fileName]
  );
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(
    () => isImage && !props.replacing
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (props.replacing) setPreviewOpen(false);
  }, [props.replacing]);

  useEffect(() => {
    if (!isImage || props.replacing) {
      setThumbLoading(false);
      setThumbUri(null);
      return;
    }
    let cancelled = false;
    setThumbLoading(true);
    setThumbUri(null);
    void (async () => {
      const url = await getRequestDocumentSignedUrlCached(props.storagePath, 60 * 60);
      if (cancelled) return;
      setThumbUri(url);
      setThumbLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.storagePath, isImage, props.replacing]);

  const thumbContent = props.replacing ? (
    <View style={attachmentSlotStyles.thumbBox}>
      <ActivityIndicator size="small" color={COLORS.teal} />
    </View>
  ) : isImage ? (
    <Pressable
      onPress={() => thumbUri && setPreviewOpen(true)}
      disabled={!thumbUri}
      style={({ pressed }) => [
        attachmentSlotStyles.thumbPressable,
        pressed && thumbUri && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${props.fileName}`}
    >
      <View style={attachmentSlotStyles.thumbBox}>
        {thumbLoading ? (
          <ActivityIndicator size="small" color={COLORS.teal} />
        ) : thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={attachmentSlotStyles.thumbImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Ionicons name="image-outline" size={20} color={COLORS.textMuted} />
        )}
      </View>
    </Pressable>
  ) : (
    <View style={attachmentSlotStyles.thumbBox}>
      <Ionicons name="document-text-outline" size={20} color={COLORS.teal} />
    </View>
  );

  return (
    <>
      <View
        style={[
          attachmentSlotStyles.row,
          props.replacing && attachmentSlotStyles.rowBusy,
        ]}
      >
        <View style={attachmentSlotStyles.rowLeft}>
          {thumbContent}
          <View style={{ flex: 1 }}>
            <Text style={attachmentSlotStyles.label} numberOfLines={1}>
              {props.label}
              {props.required ? (
                <Text style={attachmentSlotStyles.required}> *</Text>
              ) : null}
            </Text>
            {props.replacing ? (
              <Text style={attachmentSlotStyles.uploadingHint}>
                Uploading new file…
              </Text>
            ) : null}
            <Text style={attachmentSlotStyles.fileName} numberOfLines={1}>
              {props.fileName}
            </Text>
          </View>
          <Text style={attachmentSlotStyles.kind}>{props.kind}</Text>
        </View>
        {props.replacing ? (
          <View style={attachmentSlotStyles.iconMuted}>
            <Ionicons name={props.icon} size={16} color={COLORS.textMuted} />
          </View>
        ) : props.onRemove ? (
          <Pressable
            onPress={props.onRemove}
            hitSlop={8}
            style={({ pressed }) => [
              attachmentSlotStyles.removeBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${props.label}`}
          >
            <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={attachmentPreviewStyles.root}>
          <Pressable
            style={attachmentPreviewStyles.backdrop}
            onPress={() => setPreviewOpen(false)}
            accessibilityLabel="Close preview"
          />
          <View style={attachmentPreviewStyles.sheet} pointerEvents="box-none">
            <View style={attachmentPreviewStyles.sheetHeader}>
              <Text
                style={attachmentPreviewStyles.sheetTitle}
                numberOfLines={1}
              >
                {props.fileName}
              </Text>
              <Pressable
                onPress={() => setPreviewOpen(false)}
                hitSlop={12}
                style={({ pressed }) => [
                  attachmentPreviewStyles.closeBtn,
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color={COLORS.white} />
              </Pressable>
            </View>
            {thumbUri ? (
              <Image
                source={{ uri: thumbUri }}
                style={attachmentPreviewStyles.fullImage}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

type AttachmentSlotProps = {
  label: string;
  path?: string | null;
  uploading?: boolean;
  /** True while loading saved attachments for an existing draft row. */
  slotLoading?: boolean;
  required?: boolean;
  helperText?: string;
  onPick: () => void;
  onRemove?: () => void;
};

function AttachmentSlot(props: AttachmentSlotProps) {
  const hasFile = Boolean(props.path);
  const uploading = !!props.uploading;
  const slotLoading = !!props.slotLoading;
  const showEmptyBusy = !hasFile && (uploading || slotLoading);

  if (hasFile && !uploading) {
    const fileName = inferAttachmentName(props.path ?? "");
    const kind = fileKindLabel(undefined, fileName);
    const icon = fileIconName(undefined, fileName);
    return (
      <AttachmentFileRow
        storagePath={props.path!}
        label={props.label}
        fileName={fileName}
        kind={kind}
        icon={icon}
        required={props.required}
        onRemove={props.onRemove}
      />
    );
  }

  if (hasFile && uploading) {
    const fileName = inferAttachmentName(props.path ?? "");
    const kind = fileKindLabel(undefined, fileName);
    const icon = fileIconName(undefined, fileName);
    return (
      <AttachmentFileRow
        storagePath={props.path!}
        label={props.label}
        fileName={fileName}
        kind={kind}
        icon={icon}
        required={props.required}
        replacing
      />
    );
  }

  return (
    <Pressable
      onPress={props.onPick}
      disabled={showEmptyBusy}
      style={({ pressed }) => [
        attachmentSlotStyles.row,
        attachmentSlotStyles.rowEmpty,
        showEmptyBusy && attachmentSlotStyles.rowBusy,
        pressed && !showEmptyBusy && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Attach ${props.label}`}
      accessibilityState={{ busy: showEmptyBusy }}
    >
      <View style={attachmentSlotStyles.rowLeft}>
        <View style={attachmentSlotStyles.iconBox}>
          {showEmptyBusy ? (
            <ActivityIndicator size="small" color={COLORS.teal} />
          ) : (
            <Ionicons name="document-attach-outline" size={20} color={COLORS.teal} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={attachmentSlotStyles.label}>
            {props.label}
            {props.required ? (
              <Text style={attachmentSlotStyles.required}> *</Text>
            ) : null}
          </Text>
          {showEmptyBusy ? (
            <Text style={attachmentSlotStyles.uploadingHint}>
              {uploading ? "Uploading file…" : "Loading saved file…"}
            </Text>
          ) : props.helperText ? (
            <Text style={attachmentSlotStyles.helper}>{props.helperText}</Text>
          ) : (
            <Text style={attachmentSlotStyles.helper}>
              Tap to attach PDF or image (max 5 MB)
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const DROP_BG = "#F6FEFE";
const DROP_DASH = "#68C9C5";

const attachmentSlotStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    minHeight: 60,
    borderWidth: 1.2,
    borderColor: COLORS.teal,
    gap: 7,
  },
  rowEmpty: {
    backgroundColor: DROP_BG,
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: DROP_DASH,
  },
  rowBusy: {
    opacity: 0.96,
    borderColor: "#5AB8B4",
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EAFBFB",
    borderWidth: 1,
    borderColor: "#D8F1F1",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPressable: {
    borderRadius: 8,
  },
  thumbBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#EAFBFB",
    borderWidth: 1,
    borderColor: "#D8F1F1",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  label: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    color: COLORS.textDark,
    fontWeight: "600",
  },
  required: {
    color: COLORS.danger,
  },
  fileName: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  helper: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  uploadingHint: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.teal,
    marginTop: 3,
  },
  iconMuted: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F7F7",
  },
  kind: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMuted,
    marginLeft: 8,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE9E9",
  },
});

const attachmentPreviewStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flex: 1,
    zIndex: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 52 : 20,
    paddingBottom: 10,
    gap: 10,
  },
  sheetTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    flex: 1,
    width: "100%",
    marginBottom: 20,
  },
});

function RequirementTipsDropdown({ tips }: { tips: CatalogTipItem[] }) {
  const [open, setOpen] = useState(false);
  const [openTipId, setOpenTipId] = useState<string | null>(null);
  if (!tips.length) return null;

  return (
    <View style={tipsDropdownStyles.wrap}>
      <View style={tipsDropdownStyles.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [
          tipsDropdownStyles.head,
          pressed && { opacity: 0.88 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Show requirement tips"
      >
        <Text style={tipsDropdownStyles.headText}>Tips for this requirement</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#A0A7A7"
        />
      </Pressable>
      {open ? (
        <View style={tipsDropdownStyles.body}>
          {tips.map((tip, idx) => {
            const sid = tip.id || `${tip.title}-${idx}`;
            const expanded = openTipId === sid;
            return (
              <View key={sid} style={tipsDropdownStyles.tipCard}>
                <Pressable
                  onPress={() => setOpenTipId((x) => (x === sid ? null : sid))}
                  style={tipsDropdownStyles.tipHead}
                >
                  <Text style={tipsDropdownStyles.tipTitle}>{tip.title}</Text>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#9AA6A6"
                  />
                </Pressable>
                {expanded && !!(tip.details || "").trim() ? (
                  <Text style={tipsDropdownStyles.tipTxt}>{tip.details}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      </View>
    </View>
  );
}

const tipsDropdownStyles = StyleSheet.create({
  /** Tight gap under the file row; space between *different* requirements is on the outer group. */
  wrap: {
    marginTop: 2,
    marginBottom: 0,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    overflow: "hidden",
    backgroundColor: "#FFF",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 11,
    backgroundColor: COLORS.white,
  },
  headText: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  body: {
    paddingHorizontal: 11,
    paddingBottom: 10,
    backgroundColor: "#FAFAFA",
  },
  tipCard: {
    marginTop: 8,
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4ECEC",
    padding: 10,
  },
  tipHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tipTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  tipTxt: {
    marginTop: 6,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
  },
});

type RequestFormShellProps = {
  title: string;
  subtitle?: string;
  onHomePress: () => void;
  children: ReactNode;
  headerExtras?: ReactNode;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
};

function RequestFormShell(props: RequestFormShellProps) {
  return (
    <SafeAreaView style={formShellStyles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.tealDark} />

      <View style={formShellStyles.headerSolid}>
        <View style={formShellStyles.headerRow}>
          <Pressable
            onPress={props.onHomePress}
            hitSlop={10}
            style={({ pressed }) => [
              formShellStyles.homeBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save draft and go home"
          >
            <Ionicons name="home-outline" size={22} color={COLORS.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={formShellStyles.headerTitle} numberOfLines={1}>
              {props.title}
            </Text>
            {props.subtitle ? (
              <Text style={formShellStyles.headerSubtitle} numberOfLines={1}>
                {props.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <NetworkBanner />

      <KeyboardAvoidingView
        style={formShellStyles.keyboardFlex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={formShellStyles.scrollFlex}
          contentContainerStyle={formShellStyles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {props.headerExtras}
          <View style={formShellStyles.body}>{props.children}</View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={formShellStyles.footer}>
        <Pressable
          onPress={props.onSubmit}
          disabled={props.submitting || props.submitDisabled}
          style={({ pressed }) => [
            formShellStyles.submitBtn,
            (props.submitting || props.submitDisabled) &&
              formShellStyles.submitDisabled,
            pressed && !props.submitting && !props.submitDisabled && {
              opacity: 0.92,
            },
          ]}
          accessibilityRole="button"
        >
          {props.submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={formShellStyles.submitText}>
              {props.submitLabel ?? "Submit Application"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const formShellStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.panel,
  },
  headerSolid: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
    backgroundColor: COLORS.teal,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  homeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  headerTitle: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.white,
  },
  headerSubtitle: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  keyboardFlex: {
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 106,
    paddingTop: 3,
    flexGrow: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 11,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
  },
  submitBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.teal,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  submitDisabled: {
    backgroundColor: "#A8D6D4",
  },
  submitText: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.white,
  },
});

const FIELD_BG = "#EAFBFB";
const FIELD_BORDER = COLORS.teal;
const TEXT_DARK = COLORS.textDark;

type UseRequestFormOptions = {
  serviceId: ServiceId;
  initialRequestId?: string;
  draftExtras?: Record<string, unknown>;
  /** First draft create skips DB reuse (Home → "another request"). */
  forceNewDraft?: boolean;
};

type RequestFormState = {
  loading: boolean;
  userId: string | null;
  requestId: string | null;
  paths: Record<string, string>;
  uploading: Record<string, boolean>;
  additionalInfo: string;
  submitting: boolean;
  error: string | null;
};

type RequestFormActions = {
  pickFile: (slot: string) => Promise<void>;
  removeFile: (slot: string) => Promise<void>;
  patchDraft: (patch: Record<string, unknown>) => Promise<void>;
  setAdditionalInfo: (text: string) => void;
  persistAdditionalInfo: () => Promise<void>;
  /** Persists additional info and ensures a draft row exists (best-effort). */
  saveDraftBeforeExit: () => Promise<void>;
  submit: () => Promise<void>;
};

type UseRequestFormReturn = {
  state: RequestFormState;
  actions: RequestFormActions;
  serviceLabel: string;
};

function useRequestForm(opts: UseRequestFormOptions): UseRequestFormReturn {
  const router = useRouter();
  const session = useAuthSession();
  const service = getService(opts.serviceId);
  if (!service) {
    throw new Error(`useRequestForm: unknown serviceId ${opts.serviceId}`);
  }
  const attachmentSlotMap =
    getCatalogLookupRuntime()?.byServiceId[service.id]?.attachmentSlotMap;
  if (!attachmentSlotMap || Object.keys(attachmentSlotMap).length === 0) {
    throw new Error(
      `useRequestForm: catalog missing attachment_slot_map for ${service.id}`
    );
  }
  const requestTable = tableForService(opts.serviceId);

  const additionalInfoRef = useRef("");

  const [state, setState] = useState<RequestFormState>({
    loading: true,
    userId: null,
    requestId: opts.initialRequestId ?? null,
    paths: {},
    uploading: {},
    additionalInfo: "",
    submitting: false,
    error: null,
  });

  const draftExtrasRef = useRef<Record<string, unknown>>(opts.draftExtras ?? {});
  /**
   * First `ensureRequestId` after mount may pass `forceNew` into serialized insert
   * so Home "start another request" creates a fresh row; later calls reuse DB draft.
   */
  const wantsForceNewInsertRef = useRef(
    Boolean(opts.forceNewDraft) && !opts.initialRequestId
  );

  /**
   * Tracks the active draft row for this screen. Prefer this over mirroring
   * `state.requestId` in an effect (state can lag and clear the ref mid-flight).
   */
  const requestIdRef = useRef<string | null>(opts.initialRequestId ?? null);

  useEffect(() => {
    if (opts.initialRequestId) {
      requestIdRef.current = opts.initialRequestId;
    }
  }, [opts.initialRequestId]);

  useEffect(() => {
    if (session.loading) return;

    if (!opts.initialRequestId) {
      setState((s) => ({
        ...s,
        loading: false,
        userId: session.userId,
        paths: {},
        additionalInfo: "",
      }));
      additionalInfoRef.current = "";
      return;
    }

    let active = true;

    (async () => {
      const userId = session.userId;
      let paths: Record<string, string> = {};
      let additionalInfo = "";

      if (userId && opts.initialRequestId) {
        try {
          paths = await listRequestAttachments({
            requestTable,
            attachmentSlotMap,
            requestUid: opts.initialRequestId,
          });
        } catch {
          /* ignore initial load failures */
        }
        try {
          const { data: row } = await supabase
            .from(ASSISTANCE_REQUESTS_TABLE)
            .select("additional_info")
            .eq("id", opts.initialRequestId as never)
            .maybeSingle();
          const ai = (row as { additional_info?: string | null } | null)
            ?.additional_info;
          additionalInfo = typeof ai === "string" ? ai : "";
        } catch {
          /* ignore */
        }
      }

      additionalInfoRef.current = additionalInfo;

      if (active) {
        setState((s) => ({
          ...s,
          loading: false,
          userId,
          paths,
          additionalInfo,
        }));
      }
    })();

    return () => {
      active = false;
    };
  }, [
    session.loading,
    session.userId,
    opts.initialRequestId,
    requestTable,
    attachmentSlotMap,
  ]);

  const ensureRequestId = useCallback(
    async (userId: string): Promise<string> => {
      if (requestIdRef.current) return requestIdRef.current;

      const forceNew = wantsForceNewInsertRef.current;
      if (forceNew) wantsForceNewInsertRef.current = false;

      const id = await insertAssistanceDraftSerialized(
        userId,
        service.id,
        () =>
          buildAssistanceDraftInsert(
            service.id,
            userId,
            draftExtrasRef.current
          ),
        { forceNew }
      );
      requestIdRef.current = id;
      setState((s) => ({ ...s, requestId: id }));
      return id;
    },
    [service.id]
  );

  const pickFile = useCallback<RequestFormActions["pickFile"]>(
    async (slot) => {
      try {
        if (!state.userId) {
          Alert.alert("Sign in required", "Please sign in to upload files.");
          return;
        }

        const res = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/*"],
          multiple: false,
          copyToCacheDirectory: true,
        });
        if ((res as { canceled?: boolean }).canceled) return;
        const asset = res.assets?.[0];
        if (!asset?.uri) return;

        if (typeof asset.size === "number" && asset.size > MAX_REQUEST_FILE_BYTES) {
          Alert.alert(
            "File too large",
            `Max file size is ${Math.round(MAX_REQUEST_FILE_BYTES / (1024 * 1024))} MB.`
          );
          return;
        }

        setState((s) => ({ ...s, uploading: { ...s.uploading, [slot]: true } }));

        const requestId = await ensureRequestId(state.userId);

        const file: UploadFileInput = {
          uri: asset.uri,
          name: asset.name ?? "file",
          mimeType: asset.mimeType,
        };

        const dbFileType = toDbFileType(attachmentSlotMap, slot);
        let orphanStoragePath: string | null = null;
        try {
          const uploaded = await uploadRequestDocument({
            userId: state.userId,
            requestId,
            fileType: dbFileType,
            file,
          });
          orphanStoragePath = uploaded.path;

          await upsertRequestAttachment({
            requestTable,
            attachmentSlotMap,
            requestUid: requestId,
            fileType: slot,
            path: uploaded.path,
          });

          orphanStoragePath = null;

          setState((s) => ({
            ...s,
            requestId,
            paths: { ...s.paths, [slot]: uploaded.path },
            uploading: { ...s.uploading, [slot]: false },
          }));
        } finally {
          if (orphanStoragePath) {
            try {
              await deleteRequestDocument(orphanStoragePath);
            } catch {
              /* best-effort: remove file that never got a DB row */
            }
          }
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" &&
                err !== null &&
                "message" in err &&
                String((err as { message: unknown }).message).trim().length > 0
              ? String((err as { message: unknown }).message)
              : "Upload failed. Please try again.";
        setState((s) => ({
          ...s,
          uploading: { ...s.uploading, [slot]: false },
          error: message,
        }));
        Alert.alert("Upload failed", message);
      }
    },
    [attachmentSlotMap, ensureRequestId, requestTable, state.userId]
  );

  const removeFile = useCallback<RequestFormActions["removeFile"]>(
    async (slot) => {
      const requestId = state.requestId;
      if (!requestId) {
        setState((s) => {
          const next = { ...s.paths };
          delete next[slot];
          return { ...s, paths: next };
        });
        return;
      }
      try {
        await deleteAttachmentRow({
          requestTable,
          attachmentSlotMap,
          requestUid: requestId,
          fileType: slot,
        });
        setState((s) => {
          const next = { ...s.paths };
          delete next[slot];
          return { ...s, paths: next };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to remove file.";
        setState((s) => ({ ...s, error: message }));
        Alert.alert("Remove failed", message);
      }
    },
    [attachmentSlotMap, requestTable, state.requestId]
  );

  const patchDraft = useCallback<RequestFormActions["patchDraft"]>(
    async (patch) => {
      if (!state.userId) return;
      const requestId = await ensureRequestId(state.userId);
      const { rowPatch, payloadFragment } = partitionAssistanceRowPatch(patch);
      let updateBody: Record<string, unknown> = { ...rowPatch };
      if (Object.keys(payloadFragment).length > 0) {
        const { data: cur, error: loadErr } = await supabase
          .from(ASSISTANCE_REQUESTS_TABLE)
          .select("payload")
          .eq("id", requestId as never)
          .maybeSingle();
        if (loadErr) {
          setState((s) => ({ ...s, error: loadErr.message }));
          return;
        }
        const prev =
          cur?.payload && typeof cur.payload === "object" && !Array.isArray(cur.payload)
            ? (cur.payload as Record<string, unknown>)
            : {};
        updateBody = {
          ...updateBody,
          payload: { ...prev, ...payloadFragment },
        };
      }

      const { error } = await supabase
        .from(ASSISTANCE_REQUESTS_TABLE)
        .update(updateBody as never)
        .eq("id", requestId as never);
      if (error) {
        setState((s) => ({ ...s, error: error.message }));
        return;
      }
      setState((s) => ({ ...s, requestId }));
    },
    [ensureRequestId, requestTable, state.userId]
  );

  const setAdditionalInfo = useCallback<RequestFormActions["setAdditionalInfo"]>(
    (text) => {
      additionalInfoRef.current = text;
      setState((s) => ({ ...s, additionalInfo: text }));
    },
    []
  );

  const persistAdditionalInfo =
    useCallback<RequestFormActions["persistAdditionalInfo"]>(async () => {
      if (!state.userId) return;
      const trimmed = additionalInfoRef.current.trim();
      const requestId = await ensureRequestId(state.userId);
      const { error } = await supabase
        .from(ASSISTANCE_REQUESTS_TABLE)
        .update({ additional_info: trimmed || null } as never)
        .eq("id", requestId as never);
      if (error) {
        setState((s) => ({ ...s, error: error.message }));
        return;
      }
      setState((s) => ({ ...s, requestId }));
    }, [ensureRequestId, requestTable, state.userId]);

  const saveDraftBeforeExit =
    useCallback<RequestFormActions["saveDraftBeforeExit"]>(async () => {
      if (!state.userId) return;
      try {
        await persistAdditionalInfo();
      } catch {
        /* best-effort */
      }
    }, [persistAdditionalInfo, state.userId]);

  const submit = useCallback<RequestFormActions["submit"]>(async () => {
    const rid = requestIdRef.current ?? state.requestId;
    if (!state.userId || !rid) {
      Alert.alert("Nothing to submit", "Please attach the required documents first.");
      return;
    }
    setState((s) => ({ ...s, submitting: true, error: null }));
    try {
      const runtime = getCatalogLookupRuntime()?.byServiceId[service.id];
      const slotRequired = runtime?.slotRequired ?? {};
      const fileSlots =
        runtime?.fileSlots?.length ? runtime.fileSlots : Object.keys(attachmentSlotMap);

      let remotePaths: Record<string, string>;
      try {
        remotePaths = await listRequestAttachments({
          requestTable,
          attachmentSlotMap,
          requestUid: rid,
        });
      } catch {
        setState((s) => ({ ...s, submitting: false }));
        Alert.alert(
          "Connection problem",
          "Could not verify your uploads on the server. Check your network and try again."
        );
        return;
      }

      const missingOnServer = fileSlots.filter(
        (slot) =>
          slotRequired[slot] &&
          !isOptionalAttachmentSlot(slot) &&
          !remotePaths[slot]?.trim()
      );
      if (missingOnServer.length) {
        setState((s) => {
          const nextPaths: Record<string, string> = { ...s.paths };
          for (const slot of fileSlots) {
            const p = remotePaths[slot]?.trim();
            if (p) nextPaths[slot] = p;
            else delete nextPaths[slot];
          }
          return { ...s, paths: nextPaths, submitting: false };
        });
        Alert.alert(
          "Uploads not finished",
          "Required files are not saved on the server yet (often due to a weak connection). Please attach them again, wait until the upload spinner clears, then submit."
        );
        return;
      }

      setState((s) => {
        const nextPaths: Record<string, string> = { ...s.paths };
        for (const slot of fileSlots) {
          const p = remotePaths[slot]?.trim();
          if (p) nextPaths[slot] = p;
          else delete nextPaths[slot];
        }
        return { ...s, paths: nextPaths };
      });

      const notes = additionalInfoRef.current.trim();
      await submitRequest({
        serviceId: opts.serviceId,
        requestId: rid,
        extras: { additional_info: notes || null },
      });

      const rt = getCatalogLookupRuntime()?.byServiceId[service.id];
      await upsertSubmittedStatusApplication(
        {
          id: rid,
          title: rt?.displayName ?? service.title,
          description: "",
          status: "Pending",
          category: (rt?.categorySlug ?? "uncategorized") as import("@/AppCore/AppUiDomainTypes").Category,
          categorySlug: rt?.categorySlug,
          service: service.id,
          createdAt: Date.now(),
        },
        rid
      );
      markStatusApplicationsCacheDirty();

      router.replace({
        pathname: successRouteForService(opts.serviceId) as never,
        params: {
          requestId: rid,
          serviceId: opts.serviceId,
        },
      } as never);
    } catch (err) {
      const message = formatSubmitError(err);
      setState((s) => ({ ...s, submitting: false, error: message }));
      Alert.alert("Submission failed", message);
    }
  }, [
    attachmentSlotMap,
    opts.serviceId,
    requestTable,
    router,
    service.id,
    state.requestId,
    state.userId,
  ]);

  return {
    state,
    actions: {
      pickFile,
      removeFile,
      patchDraft,
      setAdditionalInfo,
      persistAdditionalInfo,
      saveDraftBeforeExit,
      submit,
    },
    serviceLabel: service.title,
  };
}

function RequestFieldsBody(props: {
  canonical: string;
  initialRequestId?: string;
  draftExtras: Record<string, unknown>;
  forceNewDraft?: boolean;
  runtime: CatalogServiceRuntime;
  routeParams: Record<string, string | string[] | undefined>;
  choiceLines: { label: string; value: string }[];
}) {
  const router = useRouter();
  const form = useRequestForm({
    serviceId: props.canonical as ServiceId,
    initialRequestId: props.initialRequestId,
    draftExtras: props.draftExtras,
    forceNewDraft: props.forceNewDraft,
  });

  const [choiceLines, setChoiceLines] = useState(props.choiceLines);

  useEffect(() => {
    // Avoid flicker: only overwrite when we actually have lines from params.
    // (When navigating from Status, params are often empty while we hydrate from DB.)
    if (props.choiceLines.length > 0) setChoiceLines(props.choiceLines);
  }, [props.choiceLines]);

  useEffect(() => {
    // When navigating from Status, we often only get `requestId` and lose the
    // preflight params. Hydrate choices from the saved draft row.
    if (choiceLines.length > 0) return;
    if (!props.initialRequestId) return;

    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from(ASSISTANCE_REQUESTS_TABLE)
          .select("service_id, financial_request_type, payload")
          .eq("id", props.initialRequestId as never)
          .maybeSingle();
        if (!active) return;
        if (error || !data) return;

        const row = data as {
          service_id?: string | null;
          financial_request_type?: string | null;
          payload?: unknown;
        };
        const sk = (row.service_id || props.canonical).toString();
        const rebuilt = buildPreflightChoiceLines(sk, {
          routeParams: props.routeParams,
          financialRequestType: row.financial_request_type ?? null,
          payload: row.payload,
        });
        if (rebuilt.length > 0) setChoiceLines(rebuilt);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      active = false;
    };
  }, [choiceLines.length, props.canonical, props.initialRequestId, props.routeParams]);

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const leaveModalOpenRef = useRef(false);
  useEffect(() => {
    leaveModalOpenRef.current = leaveModalOpen;
  }, [leaveModalOpen]);

  const openLeaveModal = useCallback(() => {
    setLeaveModalOpen(true);
  }, []);

  const closeLeaveModal = useCallback(() => {
    setLeaveModalOpen(false);
  }, []);

  const saveDraftRef = useRef(form.actions.saveDraftBeforeExit);
  saveDraftRef.current = form.actions.saveDraftBeforeExit;

  const saveDraftExitBusyRef = useRef(false);
  const confirmSaveDraftAndHome = useCallback(async () => {
    if (saveDraftExitBusyRef.current) return;
    saveDraftExitBusyRef.current = true;
    try {
      setLeaveModalOpen(false);
      try {
        await saveDraftRef.current();
      } catch {
        /* ignore */
      }
      router.replace(ROUTES.home as never);
    } finally {
      saveDraftExitBusyRef.current = false;
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (leaveModalOpenRef.current) {
          setLeaveModalOpen(false);
          return true;
        }
        setLeaveModalOpen(true);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [])
  );

  const requiredSlots = useMemo(
    () =>
      props.runtime.fileSlots.filter(
        (s) =>
          props.runtime.slotRequired[s] && !isOptionalAttachmentSlot(s)
      ),
    [props.runtime]
  );
  const optionalSlots = useMemo(
    () => props.runtime.fileSlots.filter((s) => !props.runtime.slotRequired[s]),
    [props.runtime]
  );
  /** Optional extra file slot(s) — below Additional information. */
  const optionalAttachmentSlots = useMemo(
    () => props.runtime.fileSlots.filter((s) => isOptionalAttachmentSlot(s)),
    [props.runtime.fileSlots]
  );
  const optionalWithRequirementsSlots = useMemo(
    () =>
      optionalSlots.filter((s) => !isOptionalAttachmentSlot(s)),
    [optionalSlots]
  );

  const renderRequirementGroup = (slot: string, isLastInSection: boolean) => {
    const tips = props.runtime.requirementTipsBySlot[slot] ?? [];
    return (
      <View
        key={slot}
        style={
          isLastInSection
            ? requestScreenStyles.requirementFieldGroupLast
            : requestScreenStyles.requirementFieldGroup
        }
      >
        <AttachmentSlot
          label={props.runtime.slotTitles[slot] ?? slot}
          required={!!props.runtime.slotRequired[slot]}
          path={form.state.paths[slot]}
          uploading={!!form.state.uploading[slot]}
          slotLoading={
            form.state.loading && Boolean(props.initialRequestId)
          }
          onPick={() => void form.actions.pickFile(slot)}
          onRemove={
            form.state.paths[slot]
              ? () => void form.actions.removeFile(slot)
              : undefined
          }
        />
        {tips.length > 0 ? <RequirementTipsDropdown tips={tips} /> : null}
      </View>
    );
  };

  const renderNotesAttachmentGroup = (slot: string, isLast: boolean) => {
    const tips = props.runtime.requirementTipsBySlot[slot] ?? [];
    return (
      <View
        key={slot}
        style={
          isLast
            ? requestScreenStyles.notesAttachmentFieldGroupLast
            : requestScreenStyles.notesAttachmentFieldGroup
        }
      >
        <AttachmentSlot
          label={props.runtime.slotTitles[slot] ?? slot}
          required={false}
          path={form.state.paths[slot]}
          uploading={!!form.state.uploading[slot]}
          slotLoading={
            form.state.loading && Boolean(props.initialRequestId)
          }
          onPick={() => void form.actions.pickFile(slot)}
          onRemove={
            form.state.paths[slot]
              ? () => void form.actions.removeFile(slot)
              : undefined
          }
        />
        {tips.length > 0 ? <RequirementTipsDropdown tips={tips} /> : null}
      </View>
    );
  };

  const onSubmit = () => {
    const missing = props.runtime.fileSlots.filter(
      (s) =>
        props.runtime.slotRequired[s] &&
        !isOptionalAttachmentSlot(s) &&
        !form.state.paths[s]
    );
    if (missing.length) {
      Alert.alert(
        "Requirements incomplete",
        "Please attach all required documents before submitting."
      );
      return;
    }
    void form.actions.submit();
  };

  const canSubmit = useMemo(() => {
    if (form.state.loading || !form.state.requestId || !form.state.userId) return false;
    const missing = props.runtime.fileSlots.some(
      (s) =>
        props.runtime.slotRequired[s] &&
        !isOptionalAttachmentSlot(s) &&
        !form.state.paths[s]
    );
    if (missing) return false;
    const uploadingAny = Object.values(form.state.uploading).some(Boolean);
    if (uploadingAny) return false;
    return true;
  }, [
    form.state.loading,
    form.state.requestId,
    form.state.userId,
    form.state.paths,
    form.state.uploading,
    props.runtime.fileSlots,
    props.runtime.slotRequired,
  ]);

  const choiceCard =
    choiceLines.length > 0 ? (
      <View style={requestScreenStyles.choiceCardWrap}>
        <View style={requestScreenStyles.choiceCard}>
          <Text style={requestScreenStyles.choiceCardTitle}>Your selections</Text>
          {choiceLines.map((line, idx) => (
            <View
              key={`choice-${idx}-${line.label}`}
              style={[
                requestScreenStyles.choiceRow,
                idx > 0 ? requestScreenStyles.choiceRowBorder : null,
              ]}
            >
              <Text style={requestScreenStyles.choiceLabel}>{line.label}</Text>
              <Text style={requestScreenStyles.choiceValue}>{line.value}</Text>
            </View>
          ))}
        </View>
      </View>
    ) : null;

  return (
    <>
      <RequestFormShell
        title={props.runtime.displayName}
        headerExtras={choiceCard}
        onHomePress={openLeaveModal}
        submitting={form.state.submitting}
        submitDisabled={!canSubmit}
        onSubmit={onSubmit}
      >
        {requiredSlots.length > 0 || optionalWithRequirementsSlots.length > 0 ? (
          <View
            style={
              choiceLines.length > 0
                ? requestScreenStyles.blockAfterChoice
                : undefined
            }
          >
            <Text
              style={[
                requestScreenStyles.sectionTitle,
                requestScreenStyles.requirementsSectionTitle,
              ]}
            >
              Requirements
            </Text>
            <Text
              style={[
                requestScreenStyles.sectionHint,
                requestScreenStyles.requirementsHintSpacing,
              ]}
            >
              Attach PDF or images for each item (max 5 MB per file).
              {"\n"}Fields marked " * " are required.
            </Text>
            {requiredSlots.map((slot, idx) =>
              renderRequirementGroup(
                slot,
                idx === requiredSlots.length - 1 &&
                  optionalWithRequirementsSlots.length === 0
              )
            )}
            {optionalWithRequirementsSlots.map((slot, idx) =>
              renderRequirementGroup(
                slot,
                idx === optionalWithRequirementsSlots.length - 1
              )
            )}
          </View>
        ) : null}

        <View
          style={[
            requestScreenStyles.additionalGroup,
            (requiredSlots.length > 0 || optionalWithRequirementsSlots.length > 0) &&
              requestScreenStyles.additionalGroupAfterReq,
            choiceLines.length > 0 &&
              requiredSlots.length === 0 &&
              optionalWithRequirementsSlots.length === 0 &&
              requestScreenStyles.additionalGroupAfterChoice,
          ]}
        >
          <Text
            style={[requestScreenStyles.sectionTitle, requestScreenStyles.sectionTitleInGroup]}
          >
            Additional information
          </Text>
          <Text style={requestScreenStyles.optionalPill}>Optional</Text>
          <Text style={requestScreenStyles.sectionHint}>
            Share context for reviewers (special circumstances, references, etc.).
          </Text>
          <TextInput
            style={requestScreenStyles.additionalInput}
            value={form.state.additionalInfo}
            onChangeText={form.actions.setAdditionalInfo}
            onEndEditing={() => void form.actions.persistAdditionalInfo()}
            placeholder="Type any extra details here…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            editable={!form.state.loading && Boolean(form.state.userId)}
            textAlignVertical="top"
            maxLength={4000}
          />

          {optionalAttachmentSlots.map((slot, idx) =>
            renderNotesAttachmentGroup(
              slot,
              idx === optionalAttachmentSlots.length - 1
            )
          )}
        </View>
      </RequestFormShell>

      <Modal
        visible={leaveModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeLeaveModal}
      >
        <View style={leaveModalStyles.overlay}>
          <View style={leaveModalStyles.card}>
            <Text style={leaveModalStyles.title}>Save draft and leave?</Text>
            <Text style={leaveModalStyles.body}>
              Your answers and uploads will be kept as a draft. You can continue later
              from the Status tab.
            </Text>
            <View style={leaveModalStyles.actions}>
              <Pressable
                onPress={closeLeaveModal}
                style={({ pressed }) => [
                  leaveModalStyles.btnSecondary,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={leaveModalStyles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmSaveDraftAndHome()}
                style={({ pressed }) => [
                  leaveModalStyles.btnPrimary,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={leaveModalStyles.btnPrimaryText}>Save draft & Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const leaveModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  title: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_DARK,
    textAlign: "center",
  },
  body: {
    marginTop: 10,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 11,
    marginTop: 18,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
  },
  btnSecondaryText: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: COLORS.teal,
    alignItems: "center",
  },
  btnPrimaryText: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.white,
  },
});

export type RequestFieldsProps = {
  forcedServiceKey?: string;
};

export default function RequestFields({ forcedServiceKey }: RequestFieldsProps = {}) {
  const router = useRouter();
  const { loading: catalogLoading, error: catalogError, reload } =
    useAssistanceCatalog();
  const params = useLocalSearchParams();
  const globalParams = useGlobalSearchParams();
  const rawKey = useMemo(() => {
    const f = forcedServiceKey?.trim();
    if (f) return f.toLowerCase();
    return pickServiceIdFromSearchParams(
      params as Record<string, string | string[] | undefined>,
      globalParams as Record<string, string | string[] | undefined>
    );
  }, [forcedServiceKey, params, globalParams]);

  const canonical = normalizeRouteServiceId(rawKey);

  const draftExtras = useMemo(
    () =>
      draftPatchFromRouteParams(
        params as Record<string, string | string[] | undefined>
      ),
    [params]
  );

  const initialRequestId = useMemo(() => {
    const v = params.requestId;
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" && s.trim() ? s.trim() : undefined;
  }, [params.requestId]);

  const forceNewDraft = useMemo(() => {
    const v = params.forceNewDraft;
    const s = Array.isArray(v) ? v[0] : v;
    return s === "1" || String(s).toLowerCase() === "true";
  }, [params.forceNewDraft]);

  const mergedRouteParams = useMemo(
    () =>
      ({
        ...(globalParams as Record<string, string | string[] | undefined>),
        ...(params as Record<string, string | string[] | undefined>),
      }),
    [globalParams, params]
  );

  const choiceLines = useMemo(
    () =>
      canonical
        ? buildPreflightChoiceLines(canonical, {
            routeParams: mergedRouteParams,
          })
        : [],
    [canonical, mergedRouteParams]
  );

  const catalog = getCatalogLookupRuntime();
  const rt =
    canonical != null ? catalog?.byServiceId[canonical] ?? null : null;

  const rest = { ...params } as Record<string, string | string[] | undefined>;
  delete (rest as { serviceKey?: unknown }).serviceKey;

  if (!canonical) {
    const first = getCatalogLookupRuntime()?.sortedServiceIds?.[0];
    const path = defaultServiceFormPath();
    if (path === "/Home/Home") {
      return <Redirect href="/Home/Home" />;
    }
    return (
      <Redirect
        href={
          {
            pathname: REQUEST_FIELDS_PATH,
            params: {
              ...rest,
              serviceId: pickServiceIdFromSearchParams(rest, globalParams) || first || "",
            },
          } as never
        }
      />
    );
  }

  if (catalog && !rt) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          Unknown assistance type. Please go back and choose a service from Home.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const waitingForCatalog =
    !rt?.attachmentSlotMap ||
    Object.keys(rt.attachmentSlotMap).length === 0;

  if (waitingForCatalog) {
    if (catalogLoading) {
      return (
        <View style={styles.fallback}>
          <ActivityIndicator color="#0B8F8B" />
          <Text style={styles.fallbackText}>Loading assistance catalog…</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      );
    }

    if (catalogError || !catalog) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>
            We couldn&apos;t load the assistance catalog. Check your connection
            and try again.
          </Text>
          <Pressable
            onPress={() => void reload()}
            style={[styles.backLink, styles.retryBtn]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.fallback}>
        <ActivityIndicator color="#0B8F8B" />
        <Text style={styles.fallbackText}>Loading assistance catalog…</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <RequestFieldsBody
      canonical={canonical}
      runtime={rt}
      initialRequestId={initialRequestId}
      draftExtras={draftExtras}
      forceNewDraft={forceNewDraft}
      routeParams={mergedRouteParams}
      choiceLines={choiceLines}
    />
  );
}

const requestScreenStyles = StyleSheet.create({
  blockAfterChoice: {
    marginTop: 1,
  },
  /** Extra space between one requirement (file + tips) and the next. */
  requirementFieldGroup: {
    marginBottom: 10,
  },
  requirementFieldGroupLast: {
    marginBottom: 1,
  },
  /** Slightly looser stack under the notes field (usually one optional file). */
  notesAttachmentFieldGroup: {
    marginBottom: 10,
  },
  notesAttachmentFieldGroupLast: {
    marginBottom: 0,
  },
  /** Pulls the Requirements heading closer to content above (e.g. selections card). */
  requirementsSectionTitle: {
    marginTop: 0,
  },
  /** Adds breathing room before the first requirement row. */
  requirementsHintSpacing: {
    marginBottom: 15,
  },
  additionalGroup: {
    gap: 7,
  },
  additionalGroupAfterReq: {
    marginTop: 9,
  },
  additionalGroupAfterChoice: {
    marginTop: 8,
  },
  choiceCardWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
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
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.teal,
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
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "400",
    color: "#9AA6A6",
    lineHeight: 20,
  },
  choiceValue: {
    marginTop: 4,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.teal,
    lineHeight: 20,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontWeight: "700",
    fontSize: 18,
    color: TEXT_DARK,
    marginTop: 3,
  },
  sectionTitleInGroup: {
    marginTop: 0,
  },
  sectionTitleSub: {
    marginTop: 10,
  },
  sectionHint: {
    marginTop: 6,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
  },
  sectionHintTight: {
    marginTop: 4,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
  },
  optionalPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
    fontFamily: FONT_FAMILY_ROUNDED,
    fontWeight: "600",
    fontSize: 14,
    color: COLORS.teal,
    backgroundColor: FIELD_BG,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
  },

  additionalInput: {
    minHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: FIELD_BORDER,
    backgroundColor: FIELD_BG,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontWeight: "600",
    fontSize: 14,
    color: TEXT_DARK,
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#F6FEFE",
  },
  fallbackText: {
    fontSize: 14,
    color: "#2B2B2B",
    textAlign: "center",
  },
  backLink: { paddingVertical: 8, paddingHorizontal: 16 },
  retryBtn: {
    backgroundColor: "#0B8F8B",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { fontSize: 14, color: "#fff", fontWeight: "600" },
  backLinkText: { fontSize: 14, color: "#0B8F8B", fontWeight: "600" },
});
