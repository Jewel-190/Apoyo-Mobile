import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import { RequirementTipsDropdown } from "@/AppCore/RequirementTipsDropdown";
import {
  getHomeRequirementLabelForAttachment,
  getHomeRequirementTips,
  resolveAttachmentSlotKey,
  type RequirementTipItem,
} from "@/AppCore/ServiceRequirementFieldTypes";
import { resolveServiceId } from "@/AppCore/CatalogLookupRuntime";
import { inferAttachmentName } from "@/AppCore/AssistanceRequestAttachments";
import { getRequestDocumentSignedUrlCached } from "@/AppCore/RequestDocumentUpload";
import { supabase } from "@/AppCore/SupabaseClient";
import { normalizeServiceStatus, statusBadgeTheme } from "@/AppCore/RequestStatusPresentation";
import { patchStatusApplicationInCache } from "@/AppCore/StatusApplicationsRepository";
import { COLORS, FONT_FAMILY_ROUNDED } from "@/AppCore/Theme";

const FONT = FONT_FAMILY_ROUNDED;
const BG = COLORS.white;
const TEXT_DARK = COLORS.textDark;
const TEXT_MUTED = COLORS.textMuted;
const TEAL = COLORS.teal;
const ORANGE = "#E45454";
const ORANGE_SOFT = "#FFEDEE";
const REQUEST_DOCS_BUCKET = "request-documents";

type ActionAttachmentRow = {
  uid: string;
  file_type: string;
  path: string;
  status: string;
  reason_for_action: string | null;
  additional_reason: string | null;
};

type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

type ActionItem = {
  uid: string;
  status: string;
  requiresUpdate: boolean;
  fileType: string;
  slotKey: string | null;
  tips: RequirementTipItem[];
  sampleDocumentImage?: string;
  label: string;
  path: string;
  reasonForAction: string;
  additionalReason: string;
  existingUrl?: string;
  newFile: PickedFile | null;
};

function firstParam(v?: string | string[]) {
  if (Array.isArray(v)) return v[0] || "";
  return (v || "").toString();
}

function humanizeFileType(fileType: string) {
  return fileType
    .replace(/_file$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function isImagePath(path?: string) {
  const p = (path || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/.test(p);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export default function ActionRequiredDetails() {
  const { bundle } = useAssistanceCatalog();
  const catalogReady = !!bundle?.runtime;
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    requestTable?: string | string[];
    title?: string | string[];
    service?: string | string[];
    requestCode?: string | string[];
  }>();

  const requestId = firstParam(params?.id).trim();
  const requestService = firstParam(params?.service).trim();
  const requestTitle = firstParam(params?.title).trim() || "Application";

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [samplePreviewOpen, setSamplePreviewOpen] = useState(false);
  const [samplePreviewUri, setSamplePreviewUri] = useState("");
  const [samplePreviewTitle, setSamplePreviewTitle] = useState("Sample document");

  const resolvedServiceId = useMemo(() => {
    const sid = resolveServiceId(requestService);
    if (sid) return sid;
    const raw = requestService.trim();
    return raw || null;
  }, [requestService]);

  useEffect(() => {
    if (!requestId) {
      setIsLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        let serviceId = resolvedServiceId;
        if (!serviceId) {
          const { data: reqRow } = await supabase
            .from("assistance_requests")
            .select("service_id")
            .eq("id", requestId)
            .maybeSingle();
          serviceId =
            resolveServiceId(reqRow?.service_id ?? "") ??
            (reqRow?.service_id ? String(reqRow.service_id) : null);
        }

        const { data, error } = await supabase
          .from("request_attachments")
          .select("uid,file_type,path,status,reason_for_action,additional_reason")
          .eq("assistance_request_id", requestId)
          .in("status", ["action_required", "resubmitted"])
          .order("created", { ascending: true });

        if (error) throw error;

        const rows = (data || []) as ActionAttachmentRow[];
        const details = serviceId
          ? bundle?.detailsByServiceId?.[serviceId]
          : undefined;

        const next: ActionItem[] = await Promise.all(
          rows.map(async (row) => {
            const requiresUpdate =
              (row.status || "").toString().trim().toLowerCase() ===
              "action_required";
            const existingUrl = isImagePath(row.path)
              ? await getRequestDocumentSignedUrlCached(row.path, 3600)
              : null;

            const slotKey = resolveAttachmentSlotKey({
              serviceId,
              dbFileType: row.file_type,
            });

            const tips =
              slotKey && serviceId
                ? getHomeRequirementTips({
                    serviceId,
                    requirementId: slotKey,
                  })
                : [];

            const reqMeta = slotKey
              ? details?.requirements?.find((r) => r.id === slotKey)
              : undefined;

            const sharedLabel = getHomeRequirementLabelForAttachment({
              serviceId,
              dbFileType: row.file_type,
            });

            return {
              uid: row.uid,
              status: row.status,
              requiresUpdate,
              fileType: row.file_type,
              slotKey,
              tips,
              sampleDocumentImage: reqMeta?.sampleDocumentImage?.trim() || undefined,
              label: sharedLabel || humanizeFileType(row.file_type),
              path: row.path,
              reasonForAction:
                (row.reason_for_action ||
                  (requiresUpdate
                    ? "Please update this document."
                    : "This document was resubmitted.")
                ).trim(),
              additionalReason: (row.additional_reason || "").trim(),
              existingUrl: existingUrl || undefined,
              newFile: null,
            };
          })
        );

        next.sort((a, b) => {
          if (a.requiresUpdate === b.requiresUpdate) return 0;
          return a.requiresUpdate ? -1 : 1;
        });

        if (active) setItems(next);
      } catch (e) {
        console.log("Load action-required details failed:", e);
        if (active) {
          Alert.alert("Error", "Could not load action-required details.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [requestId, requestService, resolvedServiceId, catalogReady, bundle]);

  const updatableItems = useMemo(
    () => items.filter((item) => item.requiresUpdate),
    [items]
  );

  const allReady = useMemo(() => {
    if (!updatableItems.length) return false;
    return updatableItems.every((item) => !!item.newFile);
  }, [updatableItems]);

  const pendingCount = useMemo(
    () => updatableItems.filter((item) => !item.newFile).length,
    [updatableItems]
  );

  const pickReplacement = async (itemUid: string) => {
    const target = items.find((it) => it.uid === itemUid);
    if (!target?.requiresUpdate) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const f = result.assets?.[0];
      if (!f?.uri) return;

      const picked: PickedFile = {
        uri: f.uri,
        name: f.name || "file",
        mimeType: f.mimeType || undefined,
        size: typeof f.size === "number" ? f.size : undefined,
      };

      setItems((prev) =>
        prev.map((it) => (it.uid === itemUid ? { ...it, newFile: picked } : it))
      );
    } catch {
      Alert.alert("Error", "Could not pick file.");
    }
  };

  const openSamplePreview = (uri: string, title: string) => {
    setSamplePreviewUri(uri);
    setSamplePreviewTitle(title || "Sample document");
    setSamplePreviewOpen(true);
  };

  const openExistingPreview = async (item: ActionItem) => {
    const newUri = item.newFile?.uri || "";
    const hasNewFile = !!newUri;

    if (hasNewFile) {
      const newName = item.newFile?.name || item.label;
      const newIsImage =
        !!item.newFile?.mimeType?.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(newName);

      if (newIsImage) {
        setPreviewUri(newUri);
        setPreviewName(newName);
        setPreviewOpen(true);
        return;
      }

      try {
        const canOpenNew = await Linking.canOpenURL(newUri);
        if (canOpenNew) {
          await Linking.openURL(newUri);
          return;
        }
      } catch {}

      Alert.alert("Preview unavailable", "Preview is available for image files.");
      return;
    }

    if (!item.path) return;

    try {
      setLoadingPreview(true);
      const signedUrl = (await getRequestDocumentSignedUrlCached(item.path, 60)) || "";
      if (!signedUrl) {
        Alert.alert("Error", "Could not load file preview.");
        return;
      }

      if (isImagePath(item.path)) {
        setPreviewUri(signedUrl);
        setPreviewName(item.label);
        setPreviewOpen(true);
      } else {
        await Linking.openURL(signedUrl);
      }
    } catch {
      Alert.alert("Error", "Could not load file preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const submitUpdates = async () => {
    if (!requestId) return;
    if (!updatableItems.length) {
      Alert.alert("No pending updates", "There are no files that need updating.");
      return;
    }
    if (!allReady || isSubmitting) return;

    try {
      setIsSubmitting(true);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Unable to identify current user.");

      const stagedUpdates: Array<{ uid: string; oldPath: string; newPath: string }> = [];

      for (const item of updatableItems) {
        const file = item.newFile;
        if (!file) throw new Error("Missing replacement for one or more files.");

        const sanitizedName = sanitizeFileName(file.name);
        const newPath = `${userId}/${requestId}/${item.fileType}_${sanitizedName}`;

        const fetched = await fetch(file.uri);
        const blob = await fetched.blob();
        const buffer = await new Response(blob).arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from(REQUEST_DOCS_BUCKET)
          .upload(newPath, buffer, {
            upsert: true,
            contentType: file.mimeType || "application/octet-stream",
          });

        if (uploadError) throw uploadError;

        stagedUpdates.push({ uid: item.uid, oldPath: item.path, newPath });
      }

      // Apply DB mutations only after all replacements are successfully uploaded.
      for (const update of stagedUpdates) {
        const { error: updateAttachmentError } = await supabase
          .from("request_attachments")
          .update({
            path: update.newPath,
            status: "resubmitted",
          })
          .eq("uid", update.uid);

        if (updateAttachmentError) throw updateAttachmentError;
      }

      const { data: updatedRequest, error: updateRequestError } = await supabase
        .from("assistance_requests")
        .update({
          status: "resubmitted",
          submitted_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select("id,status")
        .single();

      if (updateRequestError) throw updateRequestError;
      if (normalizeServiceStatus(updatedRequest?.status) !== "Resubmitted") {
        throw new Error("Request status did not update. Please try again.");
      }

      const oldPathsToDelete = stagedUpdates
        .filter((x) => !!x.oldPath && x.oldPath !== x.newPath)
        .map((x) => x.oldPath);

      if (oldPathsToDelete.length) {
        await supabase.storage.from(REQUEST_DOCS_BUCKET).remove(oldPathsToDelete);
      }

      await patchStatusApplicationInCache(requestId, {
        status: "Resubmitted",
        createdAt: Date.now(),
      });

      router.back();
    } catch (e: any) {
      Alert.alert("Update failed", e?.message || "Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="chevron-back" size={22} color={TEXT_DARK} />
        </Pressable>

        <Text style={styles.topTitle}>Action required</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.loadingText}>Loading details...</Text>
        </View>
      ) : (
        <View style={styles.contentWrap}>
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.noticeCard}>
              <View style={styles.noticeAccent} />
              <Text style={styles.noticeTitle}>Requirement Correction</Text>
              <Text style={styles.noticeDesc}>
                Your application is currently on hold. We require a resubmission of your documents.
              </Text>
              <Text style={styles.noticeSub}>{requestTitle}</Text>
              {items.length > 0 ? (
                <Text style={styles.noticePendingSub}>
                  {updatableItems.length === 0
                    ? "No pending updates. Documents are already resubmitted"
                    : pendingCount > 0
                    ? `${pendingCount} file${pendingCount === 1 ? "" : "s"} still need update`
                    : "All required files are ready for submission"}
                </Text>
              ) : null}
            </View>

            {items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No items to update</Text>
                <Text style={styles.emptySub}>
                  There are currently no attachments tagged as action required.
                </Text>
              </View>
            ) : (
              <View style={styles.listCard}>
                {items.map((item) => {
                  const localIsImage =
                    !!item.newFile?.mimeType?.startsWith("image/") ||
                    /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(item.newFile?.name || "");
                  const isPendingUpdate = item.requiresUpdate && !item.newFile;
                  const isResubmitted = !item.requiresUpdate;
                  const hasTipsPanel =
                    item.requiresUpdate &&
                    (item.tips.length > 0 || !!item.sampleDocumentImage?.trim());
                  const resubmittedTheme = statusBadgeTheme("Resubmitted");

                  return (
                    <View key={item.uid} style={styles.itemBlock}>
                      <View style={styles.fieldLabelRow}>
                        <Text style={styles.fieldLabel}>{item.label}</Text>
                        {isResubmitted ? (
                          <View
                            style={[
                              styles.statusPill,
                              {
                                borderColor: resubmittedTheme.bg,
                                backgroundColor: resubmittedTheme.bg,
                              },
                            ]}
                          >
                            <Ionicons
                              name="refresh-circle"
                              size={14}
                              color={resubmittedTheme.text}
                            />
                            <Text
                              style={[
                                styles.statusPillText,
                                { color: resubmittedTheme.text },
                              ]}
                            >
                              Resubmitted
                            </Text>
                          </View>
                        ) : isPendingUpdate ? (
                          <View style={styles.pendingBadge}>
                            <Ionicons name="alert-circle" size={14} color="#E45454" />
                            <Text style={styles.pendingBadgeText}>Not updated</Text>
                          </View>
                        ) : (
                          <View style={styles.readyBadge}>
                            <Ionicons name="checkmark-circle" size={14} color="#2F9E44" />
                            <Text style={styles.readyBadgeText}>Ready</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.reasonText}>{item.reasonForAction}</Text>
                      {item.additionalReason ? (
                        <Text style={styles.additionalReasonText}>{item.additionalReason}</Text>
                      ) : null}

                      <Pressable
                        onPress={() => openExistingPreview(item)}
                        style={({ pressed }) => [
                          styles.fileRow,
                          isPendingUpdate && styles.fileRowPending,
                          pressed && { opacity: 0.9 },
                        ]}
                      >
                        <View style={styles.fileThumbWrap}>
                          {localIsImage && item.newFile?.uri ? (
                            <Image
                              source={{ uri: item.newFile.uri }}
                              style={styles.fileThumbnail}
                              resizeMode="cover"
                            />
                          ) : item.existingUrl ? (
                            <Image
                              source={{ uri: item.existingUrl }}
                              style={styles.fileThumbnail}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons name="document-outline" size={18} color={TEXT_MUTED} />
                          )}
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.fileName} numberOfLines={1}>
                            {item.newFile?.name || inferAttachmentName(item.path, item.fileType)}
                          </Text>
                          <Text style={styles.fileMeta} numberOfLines={1}>
                            {isResubmitted
                              ? "Already resubmitted. Tap card to preview"
                              : item.newFile
                              ? "Selected. Tap card to preview"
                              : "Pending update. Tap card to preview"}
                          </Text>
                        </View>

                        <Pressable
                          onPress={() => pickReplacement(item.uid)}
                          disabled={!item.requiresUpdate}
                          style={({ pressed }) => [styles.previewChip, pressed && { opacity: 0.85 }]}
                        >
                          <Text style={styles.previewChipText}>
                            {item.requiresUpdate ? "Update" : "Done"}
                          </Text>
                        </Pressable>
                      </Pressable>

                      {hasTipsPanel ? (
                        <RequirementTipsDropdown
                          tips={item.tips}
                          sampleDocumentImage={item.sampleDocumentImage}
                          sampleDocumentTitle="Sample document"
                          onOpenSample={openSamplePreview}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View style={styles.bottomBar}>
            <Pressable
              onPress={submitUpdates}
              disabled={!allReady || isSubmitting || !updatableItems.length}
              style={({ pressed }) => [
                styles.updateBtn,
                (!allReady || isSubmitting || !updatableItems.length) && { opacity: 0.6 },
                pressed && allReady && !isSubmitting ? { opacity: 0.9 } : null,
              ]}
            >
              <Text style={styles.updateBtnText}>
                {isSubmitting
                  ? "Updating..."
                  : !updatableItems.length
                  ? "No pending updates"
                  : allReady
                  ? "Update"
                  : `Update (${pendingCount} pending)`}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <Modal transparent visible={previewOpen} animationType="fade">
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewOpen(false)}>
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
              <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={samplePreviewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSamplePreviewOpen(false)}
      >
        <Pressable
          style={styles.previewOverlay}
          onPress={() => setSamplePreviewOpen(false)}
        >
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {samplePreviewTitle}
            </Text>
            <Pressable
              onPress={() => setSamplePreviewOpen(false)}
              style={({ pressed }) => [styles.previewCloseBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </Pressable>
          </View>

          <Pressable style={styles.previewContent} onPress={() => {}}>
            {samplePreviewUri ? (
              <Image
                source={{ uri: samplePreviewUri }}
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
    fontSize: 15,
    color: TEXT_DARK,
  },

  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 120,
    gap: 12,
  },
  contentWrap: {
    flex: 1,
  },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 14,
    color: TEXT_MUTED,
  },

  noticeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F7B7B7",
    backgroundColor: ORANGE_SOFT,
    padding: 14,
  },
  noticeAccent: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: ORANGE,
    marginBottom: 8,
  },
  noticeTitle: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 14,
    color: "#A12E2E",
  },
  noticeDesc: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_DARK,
  },
  noticeSub: {
    marginTop: 8,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEXT_MUTED,
  },
  noticePendingSub: {
    marginTop: 8,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#A12E2E",
  },

  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    backgroundColor: "#FFFFFF",
    padding: 12,
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  emptySub: {
    marginTop: 4,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: "center",
  },

  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 12,
  },
  itemBlock: {
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F3F3",
    paddingBottom: 12,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldLabel: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 14,
    color: TEXT_DARK,
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#F0B3B3",
    backgroundColor: "#FFEDEE",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  pendingBadgeText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#E45454",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  statusPillText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
  },
  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#BFE8CC",
    backgroundColor: "#EAF8EF",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  readyBadgeText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#2F9E44",
  },
  reasonText: {
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 14,
    color: "#A12E2E",
  },
  additionalReasonText: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: TEXT_MUTED,
  },

  fileRow: {
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCDCDC",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fileRowPending: {
    borderColor: "#F0B3B3",
    backgroundColor: "#FFF6F6",
  },
  fileThumbWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#FAFAFA",
  },
  fileThumbnail: {
    width: "100%",
    height: "100%",
  },
  fileName: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  fileMeta: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: TEXT_MUTED,
  },
  previewChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D7E5E5",
    backgroundColor: "#F8FBFB",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  previewChipText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEAL,
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },

  updateBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  updateBtnText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
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
  previewImage: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
