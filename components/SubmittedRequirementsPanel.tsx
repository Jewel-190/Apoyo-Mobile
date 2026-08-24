import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { inferAttachmentName } from "@/AppCore/AssistanceRequestAttachments";
import { fileIconName } from "@/AppCore/FileKindIcons";
import { getRequestDocumentSignedUrlCached } from "@/AppCore/RequestDocumentUpload";
import { attachmentStatusIcon } from "@/AppCore/RequestStatusPresentation";
import type { StatusScreenRequirementDef } from "@/AppCore/StatusCatalogBridge";
import { COLORS, FONT_FAMILY_ROUNDED } from "@/AppCore/Theme";

const FONT = FONT_FAMILY_ROUNDED;
const TEXT_DARK = COLORS.textDark;
const TEXT_MUTED = COLORS.textMuted;
const TEAL = COLORS.teal;

export type StatusUploadedDoc = {
  fileType: string;
  path: string;
  status?: string;
  created?: string;
  updated?: string;
  reasonForAction?: string;
  additionalReason?: string;
};

function isImagePath(path?: string) {
  const p = (path || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/.test(p);
}

function pickFileName(doc: StatusUploadedDoc) {
  return inferAttachmentName(doc.path, doc.fileType);
}

export function SubmittedRequirementsPanel({
  catalogReady,
  required,
  optionalRequirements,
  additionalAttachment,
  docs,
  additionalInfoText,
}: {
  catalogReady: boolean;
  required: StatusScreenRequirementDef[];
  optionalRequirements: StatusScreenRequirementDef[];
  additionalAttachment: StatusScreenRequirementDef | null;
  docs: StatusUploadedDoc[];
  additionalInfoText: string;
}) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  const docByReqKey = useMemo(() => {
    const map = new Map<string, StatusUploadedDoc>();
    for (const doc of docs) {
      const key = (doc.fileType || "").toString();
      if (key && !map.has(key)) map.set(key, doc);
    }
    return map;
  }, [docs]);

  useEffect(() => {
    let active = true;

    (async () => {
      const imageDocs = docs.filter((d) => isImagePath(d.path));
      if (!imageDocs.length) {
        if (active) setThumbnailUrls({});
        return;
      }

      const next: Record<string, string> = {};
      await Promise.all(
        imageDocs.map(async (doc) => {
          const signedUrl = await getRequestDocumentSignedUrlCached(doc.path, 3600);
          if (signedUrl) next[doc.path] = signedUrl;
        })
      );

      if (active) setThumbnailUrls(next);
    })();

    return () => {
      active = false;
    };
  }, [docs]);

  const openDoc = async (doc: StatusUploadedDoc) => {
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
    <>
      <View style={styles.docsWrap}>
        <View style={styles.docsHeader}>
          <Text style={styles.docsHeaderText}>Submitted Requirements</Text>
        </View>

        <View style={styles.docsBody}>
          {!catalogReady && !required.length ? (
            <Text style={styles.docsCatalogHint}>
              Loading requirement labels from catalog…
            </Text>
          ) : null}

          {required.map((def) => (
            <RequirementDocRow
              key={def.key}
              def={def}
              doc={docByReqKey.get(def.key)}
              thumbnailUrls={thumbnailUrls}
              emptyLabel="No file submitted yet"
              onOpenDoc={openDoc}
            />
          ))}

          {optionalRequirements.map((def) => (
            <RequirementDocRow
              key={def.key}
              def={def}
              doc={docByReqKey.get(def.key)}
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
            {additionalAttachment ? (
              <View style={styles.additionalAttachmentWrap}>
                <RequirementDocRow
                  def={additionalAttachment}
                  doc={docByReqKey.get(additionalAttachment.key)}
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
            <Text style={styles.previewTitle} numberOfLines={1}>
              {previewName}
            </Text>
            <Pressable
              onPress={() => setPreviewOpen(false)}
              style={({ pressed }) => [
                styles.previewCloseBtn,
                pressed && { opacity: 0.7 },
              ]}
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
    </>
  );
}

function RequirementDocRow(props: {
  def: StatusScreenRequirementDef;
  doc?: StatusUploadedDoc;
  thumbnailUrls: Record<string, string>;
  emptyLabel: string;
  onOpenDoc: (doc: StatusUploadedDoc) => void;
  compactTitle?: boolean;
}) {
  const { def, doc, thumbnailUrls, emptyLabel, onOpenDoc, compactTitle } = props;
  const fileName = doc ? pickFileName(doc) : "";
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
            <Ionicons name={iconName} size={16} color={doc ? TEAL : "#BDBDBD"} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.fileNameMini} numberOfLines={1}>
            {doc ? fileName : emptyLabel}
          </Text>
          <Text style={styles.fileSizeMini} numberOfLines={1}>
            {" "}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 14,
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
    fontSize: 14,
    color: TEXT_DARK,
  },
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
    fontSize: 14,
    color: TEXT_DARK,
  },
  fileSizeMini: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
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
    fontSize: 14,
    lineHeight: 18,
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
