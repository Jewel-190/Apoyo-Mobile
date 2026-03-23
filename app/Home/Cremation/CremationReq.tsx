import { Feather, Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../../../lib/supabase";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";

const ICON_CREMATION = require("../../../assets/images/Cremation.png");
const TRASHCAN_PNG = require("../../../assets/images/Trashcan.png");
const SAMPLE_DEATH_CERT_PNG = require("../../../assets/images/DeathCert.png");
const SAMPLE_VOTERS_PNG = require("../../../assets/images/VotersCert.png");
const SAMPLE_ENDORSEMENT_PNG = require("../../../assets/images/Endorsement.png");
const SAMPLE_INDIGENCY_PNG = require("../../../assets/images/Indigency.png");

const FONT = "SF Pro Rounded";
const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const DANGER = "#E45454";
const BORDER = "#E9EDED";
const CARD_BORDER = "#BFE8E6";
const ICON_BG = "#EAFBFB";
const ICON_BORDER = "#D8F1F1";
const DROP_BG = "#F6FEFE";
const DROP_DASH = "#68C9C5";
const DISABLED_BG = "#DDEEEE";
const DISABLED_TEXT = "#B8CACA";
const CANCEL_BG = "#BDBDBD";
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const SWIPE_OPEN_PX = 56;
const SWIPE_DELETE_PX = 120;
const ROW_HEIGHT = 64;

const BUCKET_NAME = "cremation-documents";
const REQUEST_TABLE = "cremation_requests";

type FuneralCoverageChoice = "Add Funeral Aid" | "Service Only";
type NicheCoverageChoice = "Add Niche Allocation" | "Not at this time";

function normalizeFuneralCoverage(value?: unknown): FuneralCoverageChoice | null {
  if (value === true) return "Add Funeral Aid";
  if (value === false) return "Service Only";
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (
    v === "yes" ||
    v === "add funeral aid" ||
    v === "funeral wake services" ||
    v === "funeral aid"
  )
    return "Add Funeral Aid";
  if (v === "no" || v === "service only" || v === "not at this time")
    return "Service Only";
  return null;
}

function normalizeNicheCoverage(value?: unknown): NicheCoverageChoice | null {
  if (value === true) return "Add Niche Allocation";
  if (value === false) return "Not at this time";
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (
    v === "yes" ||
    v === "add niche allocation" ||
    v === "niche allocation" ||
    v === "yes, add niche allocation"
  )
    return "Add Niche Allocation";
  if (v === "no" || v === "not at this time") return "Not at this time";
  return null;
}

function parseCoverageBundle(value?: unknown): {
  funeralAid: FuneralCoverageChoice | null;
  nicheAllocation: NicheCoverageChoice | null;
} {
  if (typeof value !== "string") {
    return { funeralAid: null, nicheAllocation: null };
  }

  const v = value.toLowerCase();

  let funeralAid = normalizeFuneralCoverage(value);
  let nicheAllocation = normalizeNicheCoverage(value);

  if (!funeralAid) {
    if (v.includes("add funeral aid") || v.includes("funeral wake services") || v.includes("funeral aid")) {
      funeralAid = "Add Funeral Aid";
    } else if (v.includes("service only")) {
      funeralAid = "Service Only";
    }
  }

  if (!nicheAllocation) {
    if (v.includes("add niche allocation") || v.includes("niche allocation") || v.includes("columbarium niche")) {
      nicheAllocation = "Add Niche Allocation";
    } else if (v.includes("not at this time")) {
      nicheAllocation = "Not at this time";
    }
  }

  return { funeralAid, nicheAllocation };
}

function composeCoverageLabel(
  funeralAid: FuneralCoverageChoice | null,
  nicheAllocation: NicheCoverageChoice | null
): string | null {
  if (!funeralAid && !nicheAllocation) return null;
  return `Funeral: ${funeralAid || "Not selected"} | Niche: ${nicheAllocation || "Not selected"}`;
}

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.timing(scale, {
      toValue: 0.985,
      duration: 110,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  const pressOut = () =>
    Animated.timing(scale, {
      toValue: 1,
      duration: 130,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  return { scale, pressIn, pressOut };
}

type PickedFile = { name: string; uri: string; mimeType?: string; size?: number };

type FileMetadata = {
  path: string;
  originalName: string;
  size?: number;
  mimeType?: string;
};

async function pickOneFile(): Promise<PickedFile | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    // @ts-ignore
    if (res?.canceled) return null;
    const a = res?.assets?.[0];
    if (!a?.uri) return null;
    const size = a.size ?? undefined;
    if (typeof size === "number" && size > MAX_BYTES) {
      Alert.alert("File too large", `Max file size is ${MAX_MB} MB.`);
      return null;
    }
    return { name: a.name ?? "file", uri: a.uri, mimeType: a.mimeType, size };
  } catch (e) {
    console.log(e);
    Alert.alert("Upload failed", "Please try again.");
    return null;
  }
}

function bytesLabel(size?: number) {
  if (typeof size !== "number") return "";
  const mb = size / (1024 * 1024);
  if (mb < 0.01) return "";
  return `${mb.toFixed(mb >= 10 ? 0 : 2)} MB`;
}

function fileIconName(mime?: string, name?: string) {
  const n = (name || "").toLowerCase();
  if (mime?.includes("pdf") || n.endsWith(".pdf")) return "document-text-outline" as const;
  return "image-outline" as const;
}

async function uploadFileToStorage(
  userId: string,
  requestId: string,
  fileType: string,
  file: PickedFile
): Promise<FileMetadata> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${userId}/${requestId}/${fileType}_${sanitizedName}`;
  const response = await fetch(file.uri);
  const blob = await response.blob();
  const arrayBuffer = await new Response(blob).arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, arrayBuffer, {
    upsert: true,
    contentType: file.mimeType || "application/octet-stream",
  });
  if (error) throw error;
  return { path: filePath, originalName: file.name, size: file.size, mimeType: file.mimeType };
}

async function deleteFileFromStorage(filePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
  if (error) throw error;
}

async function getSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(filePath, 3600);
  if (error) return null;
  return data.signedUrl;
}

function SwipeDeletePill({
  file,
  onRequestRemove,
  thumbnailUri,
  onPress,
}: {
  file: PickedFile;
  onRequestRemove: () => void;
  thumbnailUri?: string | null;
  onPress?: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;
  const rowScale = useRef(new Animated.Value(1)).current;
  const [open, setOpen] = useState(false);

  const isImage = file.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const close = () => {
    setOpen(false);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const openTrash = () => {
    setOpen(true);
    Animated.timing(translateX, {
      toValue: -SWIPE_OPEN_PX,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const animateDeleteThenConfirm = () => {
    Animated.parallel([
      Animated.timing(rowOpacity, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(rowScale, { toValue: 0.98, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      translateX.setValue(0);
      rowOpacity.setValue(1);
      rowScale.setValue(1);
      setOpen(false);
      onRequestRemove();
    });
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dy) < 10,
      onPanResponderMove: (_, g) => {
        const x = clamp(g.dx, -240, 0);
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        const x = g.dx;
        if (x <= -SWIPE_DELETE_PX) {
          animateDeleteThenConfirm();
          return;
        }
        if (x <= -SWIPE_OPEN_PX / 2) openTrash();
        else close();
      },
      onPanResponderTerminate: () => close(),
    })
  ).current;

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeActions}>
        <Pressable onPress={animateDeleteThenConfirm} style={({ pressed }) => [styles.trashSquare, pressed && { opacity: 0.85 }]}>
          <Ionicons name="trash-outline" size={16} color={DANGER} />
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.filePill,
          { height: ROW_HEIGHT, transform: [{ translateX }, { scale: rowScale }], opacity: rowOpacity },
        ]}
        {...pan.panHandlers}
      >
        <Pressable onPress={onPress} disabled={!onPress}>
          {isImage && thumbnailUri ? (
            <Image source={{ uri: thumbnailUri }} style={styles.fileThumbnail} resizeMode="cover" />
          ) : (
            <Ionicons name={fileIconName(file.mimeType, file.name)} size={18} color={TEAL} />
          )}
        </Pressable>

        <Pressable style={{ flex: 1 }} onPress={onPress} disabled={!onPress}>
          <Text style={styles.pillName} numberOfLines={1}>{file.name}</Text>
          <Text style={styles.pillMeta}>{bytesLabel(file.size) || "Tap to view"}</Text>
        </Pressable>

        <Pressable onPress={() => { if (open) close(); else openTrash(); }} hitSlop={10} style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.85 }]}>
          <Ionicons name={open ? "chevron-forward" : "chevron-back"} size={16} color="#9BB0B0" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const removeTargetLabels: Record<string, string> = {
  deathCert: "Death Certificate",
  validId: "Valid ID of Deceased",
  barangay: "Barangay Endorsement of the Deceased",
  indigency: "Indigency Certificate of the Deceased",
  attachment: "Additional Attachment",
};

export default function CremationReq() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    serviceId?: string;
    requestId?: string;
    coverage?: string;
    funeralAid?: string;
    nicheAllocation?: string;
    niche?: string;
  }>();
  const serviceId = params?.serviceId || "cremation";
  const existingRequestId = params?.requestId;

  const initialCoverage = parseCoverageBundle(params?.coverage?.toString());

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [tableReady, setTableReady] = useState<boolean | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(existingRequestId || null);

  const [requesterName, setRequesterName] = useState<string>("");
  const [requesterContactNumber, setRequesterContactNumber] = useState<string>("");
  const [requesterEmail, setRequesterEmail] = useState<string>("");
  const [requesterPresentAddress, setRequesterPresentAddress] = useState<string>("");
  const [requesterLocked, setRequesterLocked] = useState<boolean>(false);

  const [deathCertFile, setDeathCertFile] = useState<PickedFile | null>(null);
  const [validIdFile, setValidIdFile] = useState<PickedFile | null>(null);
  const [barangayFile, setBarangayFile] = useState<PickedFile | null>(null);
  const [indigencyCertFile, setIndigencyCertFile] = useState<PickedFile | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<PickedFile | null>(null);

  const [funeralAid, setFuneralAid] = useState<FuneralCoverageChoice | null>(
    normalizeFuneralCoverage(params?.funeralAid?.toString()) ||
      normalizeFuneralCoverage(params?.coverage?.toString()) ||
      initialCoverage.funeralAid
  );
  const [nicheAllocation, setNicheAllocation] = useState<NicheCoverageChoice | null>(
    normalizeNicheCoverage(params?.nicheAllocation?.toString()) ||
      normalizeNicheCoverage(params?.niche?.toString()) ||
      initialCoverage.nicheAllocation
  );

  const [uploadedPaths, setUploadedPaths] = useState<Record<string, string>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const [additionalInfo, setAdditionalInfo] = useState("");

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);


  const [backConfirmOpen, setBackConfirmOpen] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [openTipId, setOpenTipId] = useState<string | null>(null);
  const [samplePreviewOpen, setSamplePreviewOpen] = useState(false);
  const [samplePreviewImage, setSamplePreviewImage] = useState<any>(null);
  const [samplePreviewTitle, setSamplePreviewTitle] = useState("Sample Document");

  const submitAnim = usePressScale();
  const nextAnim = submitAnim;

  useEffect(() => {
    loadUserAndDraft();
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
    });
    NetInfo.fetch().then((s) => setIsConnected(s.isConnected ?? false));
    return () => unsub();
  }, []);

  useEffect(() => {
    const loadSigned = async () => {
      const urls: Record<string, string> = {};
      for (const [key, path] of Object.entries(uploadedPaths)) {
        if (path && /\.(jpg|jpeg|png|gif|webp)$/i.test(path)) {
          const url = await getSignedUrl(path);
          if (url) urls[key] = url;
        }
      }
      setSignedUrls(urls);
    };
    if (Object.keys(uploadedPaths).length > 0) loadSigned();
  }, [uploadedPaths]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const onBack = () => {
        setBackConfirmOpen(true);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [])
  );

  const checkRequestTableAvailability = async () => {
    try {
      const { error } = await supabase
        .from(REQUEST_TABLE)
        .select("id", { head: true, count: "exact" })
        .limit(1);

      if (error && (error as any).code === "PGRST205") {
        setTableReady(false);
        return;
      }

      setTableReady(true);
    } catch {
      setTableReady(true);
    }
  };

  const loadUserAndDraft = async () => {
    try {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "Please log in to continue");
        router.back();
        return;
      }
      setUserId(user.id);
      await checkRequestTableAvailability();

      if (!existingRequestId) {
        try {
          const { data: profile } = await supabase
            .from("users")
            .select("first_name,middle_name,last_name,suffix,contact_number,email,address,verified")
            .eq("id", user.id)
            .single();

          if (profile && profile.verified) {
            const parts = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean);
            const name = `${parts.join(" ")}${profile.suffix ? " " + profile.suffix : ""}`.trim();
            setRequesterName(name);
            setRequesterContactNumber(profile.contact_number || "");
            setRequesterEmail(profile.email || "");
            setRequesterPresentAddress(profile.address || "");
            setRequesterLocked(true);
          }
        } catch (e) {
          console.log("Failed to load user profile:", e);
        }

        if (!funeralAid || !nicheAllocation) {
          const infoRaw = await AsyncStorage.getItem(`apoyo_requestinfo_${serviceId}`);
          if (infoRaw) {
            const parsed = JSON.parse(infoRaw);
            const bundle = parseCoverageBundle(parsed?.coverage);
            setFuneralAid((prev) => prev || normalizeFuneralCoverage(parsed?.funeralAid) || bundle.funeralAid);
            setNicheAllocation((prev) => prev || normalizeNicheCoverage(parsed?.nicheAllocation) || bundle.nicheAllocation);
          }
        }
      }

      const parseFileMeta = (raw: string | null): { path: string; name: string; mimeType?: string; size?: number } | null => {
        if (!raw) return null;
        try {
          const meta = JSON.parse(raw) as FileMetadata;
          return { path: meta.path, name: meta.originalName, mimeType: meta.mimeType, size: meta.size };
        } catch {
          return { path: raw, name: raw.split("/").pop() || "file" };
        }
      };

      if (existingRequestId) {
        const { data: existingRequest, error } = await supabase
          .from(REQUEST_TABLE)
          .select("*")
          .eq("user_id", user.id)
          .eq("id", existingRequestId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (existingRequest && !error) {
          setRequestId(existingRequest.id);
          setAdditionalInfo(existingRequest.additional_info || "");

          const coverageBundle = parseCoverageBundle(existingRequest.coverage);
          setFuneralAid((prev) => prev || normalizeFuneralCoverage(existingRequest.coverage ?? existingRequest.funeral_aid) || coverageBundle.funeralAid);
          setNicheAllocation((prev) => prev || normalizeNicheCoverage(existingRequest.coverage ?? existingRequest.niche_allocation) || coverageBundle.nicheAllocation);

          if (!requesterLocked) {
            setRequesterName(existingRequest.requester_name || "");
            setRequesterContactNumber(existingRequest.requester_contact_number || "");
            setRequesterEmail(existingRequest.requester_email || "");
            setRequesterPresentAddress(existingRequest.requester_present_address || "");
          }

          const paths: Record<string, string> = {};
          const deathMeta = parseFileMeta(existingRequest.death_cert_file_path);
          if (deathMeta) {
            paths.deathCert = deathMeta.path;
            setDeathCertFile({ name: deathMeta.name, uri: "", mimeType: deathMeta.mimeType, size: deathMeta.size });
          }
          const validIdMeta = parseFileMeta(existingRequest.valid_id_file_path);
          if (validIdMeta) {
            paths.validId = validIdMeta.path;
            setValidIdFile({ name: validIdMeta.name, uri: "", mimeType: validIdMeta.mimeType, size: validIdMeta.size });
          }
          const barangayMeta = parseFileMeta(existingRequest.barangay_endorsement_file_path);
          if (barangayMeta) {
            paths.barangay = barangayMeta.path;
            setBarangayFile({ name: barangayMeta.name, uri: "", mimeType: barangayMeta.mimeType, size: barangayMeta.size });
          }
          const indigencyMeta = parseFileMeta(existingRequest.indigency_cert_file_path);
          if (indigencyMeta) {
            paths.indigency = indigencyMeta.path;
            setIndigencyCertFile({ name: indigencyMeta.name, uri: "", mimeType: indigencyMeta.mimeType, size: indigencyMeta.size });
          }
          const attachmentMeta = parseFileMeta(existingRequest.attachment_file_path);
          if (attachmentMeta) {
            paths.attachment = attachmentMeta.path;
            setAttachmentFile({ name: attachmentMeta.name, uri: "", mimeType: attachmentMeta.mimeType, size: attachmentMeta.size });
          }
          setUploadedPaths(paths);
        }
      }
    } catch (err) {
      console.log("Load user error", err);
    } finally {
      setIsLoading(false);
    }
  };

  const ensureRequestId = async (): Promise<string> => {
    if (tableReady === false) {
      throw new Error("Cremation requests are not yet configured in the backend. Please contact support.");
    }
    if (requestId) return requestId;
    if (!userId) throw new Error("User not logged in");

    let requesterPayload: Record<string, any> = {
      requester_name: requesterName || null,
      requester_contact_number: requesterContactNumber || null,
      requester_email: requesterEmail || null,
      requester_present_address: requesterPresentAddress || null,
    };

    try {
      const raw = await AsyncStorage.getItem(`apoyo_requestinfo_${serviceId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        requesterPayload = {
          requester_name: parsed.name || requesterPayload.requester_name,
          requester_contact_number:
            `${parsed.countryCode || ""}${parsed.phone || ""}` ||
            requesterPayload.requester_contact_number,
          requester_email: parsed.email || requesterPayload.requester_email,
          requester_present_address:
            parsed.address || requesterPayload.requester_present_address,
        };

        if (!requesterLocked) {
          setRequesterName(requesterPayload.requester_name || "");
          setRequesterContactNumber(requesterPayload.requester_contact_number || "");
          setRequesterEmail(requesterPayload.requester_email || "");
          setRequesterPresentAddress(requesterPayload.requester_present_address || "");
        }
      }
    } catch {
      // Ignore malformed cached requester data and continue with local state.
    }

    const { data, error } = await supabase
      .from(REQUEST_TABLE)
      .insert({
        user_id: userId,
        status: "draft",
        service_id: serviceId,
        coverage: composeCoverageLabel(funeralAid, nicheAllocation),
        ...requesterPayload,
      })
      .select("id")
      .single();
    if (error) throw error;
    setRequestId(data.id);
    return data.id;
  };

  const getColumnName = (fileType: string) => {
    const map: Record<string, string> = {
      deathCert: "death_cert_file_path",
      validId: "valid_id_file_path",
      barangay: "barangay_endorsement_file_path",
      indigency: "indigency_cert_file_path",
      attachment: "attachment_file_path",
    };
    return map[fileType] || fileType;
  };

  const handleFilePickAndUpload = async (fileType: string, setFile: (f: PickedFile | null) => void) => {
    const file = await pickOneFile();
    if (!file || !userId) return;
    try {
      setIsSaving(true);
      const reqId = await ensureRequestId();
      const fileMetadata = await uploadFileToStorage(userId, reqId, fileType, file);
      const columnName = getColumnName(fileType);
      await supabase.from(REQUEST_TABLE).update({ [columnName]: JSON.stringify(fileMetadata) }).eq("id", reqId);
      setFile(file);
      setUploadedPaths((p) => ({ ...p, [fileType]: fileMetadata.path }));
    } catch (err: any) {
      Alert.alert("Upload Error", err.message || "Failed to upload file");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileRemove = async (fileType: string, clearFile: (f: PickedFile | null) => void) => {
    const path = uploadedPaths[fileType];
    if (!path || !requestId) return;
    try {
      setIsSaving(true);
      await deleteFileFromStorage(path);
      const columnName = getColumnName(fileType);
      await supabase.from(REQUEST_TABLE).update({ [columnName]: null }).eq("id", requestId);
      setUploadedPaths((prev) => {
        const n = { ...prev };
        delete n[fileType];
        return n;
      });
      clearFile(null);
    } catch (err: any) {
      Alert.alert("Delete Error", err.message || "Failed to delete file");
    } finally {
      setIsSaving(false);
    }
  };

  const pickDeathCert = () => handleFilePickAndUpload("deathCert", setDeathCertFile);
  const pickValidId = () => handleFilePickAndUpload("validId", setValidIdFile);
  const pickBarangay = () => handleFilePickAndUpload("barangay", setBarangayFile);
  const pickIndigencyCert = () => handleFilePickAndUpload("indigency", setIndigencyCertFile);
  const pickAttachment = () => handleFilePickAndUpload("attachment", setAttachmentFile);

  const openRemove = (target: string) => {
    setRemoveTarget(target);
    setRemoveOpen(true);
  };

  const cancelRemove = () => {
    setRemoveOpen(false);
    setRemoveTarget(null);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoveOpen(false);
    if (removeTarget === "deathCert") await handleFileRemove("deathCert", setDeathCertFile);
    if (removeTarget === "validId") await handleFileRemove("validId", setValidIdFile);
    if (removeTarget === "barangay") await handleFileRemove("barangay", setBarangayFile);
    if (removeTarget === "indigency") await handleFileRemove("indigency", setIndigencyCertFile);
    if (removeTarget === "attachment") await handleFileRemove("attachment", setAttachmentFile);
    setRemoveTarget(null);
  };

  const openPreview = async (fileType: string, fileName: string) => {
    const path = uploadedPaths[fileType];
    if (!path) return;
    setLoadingPreview(true);
    try {
      const url = await getSignedUrl(path);
      if (!url) {
        Alert.alert("Error", "Could not load file preview");
        setLoadingPreview(false);
        return;
      }
      setPreviewUri(url);
      setPreviewName(fileName);
      setPreviewOpen(true);
    } catch (e) {
      console.log("Preview error", e);
      Alert.alert("Error", "Could not load file preview");
    }
    setLoadingPreview(false);
  };

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveTokenRef = useRef(0);

  const handleAdditionalChange = (text: string) => {
    setAdditionalInfo(text);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const token = ++latestSaveTokenRef.current;
      if (!requestId) return;
      try {
        setIsSaving(true);
        await supabase.from(REQUEST_TABLE).update({ additional_info: text }).eq("id", requestId);
      } catch (e) {
        console.log("Save additional info error", e);
      } finally {
        if (token === latestSaveTokenRef.current) setIsSaving(false);
      }
    }, 700);
  };

  const confirmBackAndGoHome = async () => {
    setBackConfirmOpen(false);
    try {
      setIsSaving(true);
      const reqId = await ensureRequestId();
      await supabase
        .from(REQUEST_TABLE)
        .update({
          additional_info: additionalInfo,
          coverage: composeCoverageLabel(funeralAid, nicheAllocation),
          requester_name: requesterName || null,
          requester_contact_number: requesterContactNumber || null,
          requester_email: requesterEmail || null,
          requester_present_address: requesterPresentAddress || null,
        })
        .eq("id", reqId);
    } catch (e) {
      console.log("Error saving draft on back:", e);
    } finally {
      setIsSaving(false);
      router.push("/Home/Home" as any);
    }
  };

  const canSubmit =
    tableReady !== false &&
    !!(deathCertFile && validIdFile && barangayFile && indigencyCertFile && funeralAid && nicheAllocation) &&
    additionalInfo.length <= 400 &&
    !isSaving &&
    !isSubmitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      setIsSaving(true);
      setIsSubmitting(true);
      const reqId = await ensureRequestId();
      const { error } = await supabase
        .from(REQUEST_TABLE)
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          coverage: composeCoverageLabel(funeralAid, nicheAllocation),
          additional_info: additionalInfo,
          requester_name: requesterName || null,
          requester_contact_number: requesterContactNumber || null,
          requester_email: requesterEmail || null,
          requester_present_address: requesterPresentAddress || null,
        })
        .eq("id", reqId);
      if (error) throw error;
      router.push({ pathname: "/Home/Cremation/SubmissionSuccess", params: { requestId: reqId } } as any);
    } catch (e: any) {
      Alert.alert("Submit failed", e?.message || "Please try again.");
    } finally {
      setIsSaving(false);
      setIsSubmitting(false);
    }
  };

  const requirementTips = {
    deathCert: {
      title: "Tips on Getting Requirements",
      items: [
        { id: "where", title: "Where to Get It", details: "Request this from the Local Civil Registrar where the death was recorded." },
        { id: "bring", title: "What to Bring", details: "Bring valid ID, relationship proof if required, and reference details of the deceased." },
        { id: "how", title: "How to Get It", details: "Submit request form, pay applicable fees, and claim certified copy with seal." },
        { id: "sample", title: "Sample Document", details: "", image: SAMPLE_DEATH_CERT_PNG },
      ],
    },
    validId: {
      title: "Tips on Getting Requirements",
      items: [
        {
          id: "accepted",
          title: "List of Accepted ID's",
          details:
            "PhilID/ePhilID, Passport, Driver's License, UMID, PRC, Postal ID, Voter's ID/Certificate, SSS/GSIS, Senior Citizen ID, PWD ID, TIN, and PhilHealth.",
        },
        { id: "sample", title: "Sample Document", details: "", image: SAMPLE_VOTERS_PNG },
      ],
    },
    barangay: {
      title: "Tips on Getting Requirements",
      items: [
        { id: "where", title: "Where to Get It", details: "Request this from your barangay hall where the deceased or family currently resides." },
        { id: "bring", title: "What to Bring", details: "Bring valid ID, proof of residency, and any cremation assistance documents." },
        { id: "how", title: "How to Get It", details: "Request endorsement letter and secure authorized signature with barangay dry seal." },
        { id: "sample", title: "Sample Document", details: "", image: SAMPLE_ENDORSEMENT_PNG },
      ],
    },
    indigency: {
      title: "Tips on Getting Requirements",
      items: [
        { id: "where", title: "Where to Get It", details: "Get this from your barangay hall or local social welfare office." },
        { id: "bring", title: "What to Bring", details: "Bring valid ID, proof of residency, and documents related to cremation assistance." },
        { id: "how", title: "How to Get It", details: "Complete assessment and claim signed certificate with official seal." },
        { id: "sample", title: "Sample Document", details: "", image: SAMPLE_INDIGENCY_PNG },
      ],
    },
  };

  const renderTips = (fieldKey: keyof typeof requirementTips) => {
    const tipGroup = requirementTips[fieldKey];
    return (
      <>
        <Text style={styles.tipSectionTitle}>{tipGroup.title}</Text>
        {tipGroup.items.map((tip) => {
          const scopedId = `${fieldKey}-${tip.id}`;
          const expanded = openTipId === scopedId;
          return (
            <View key={scopedId} style={styles.tipCard}>
              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setOpenTipId((prev) => (prev === scopedId ? null : scopedId));
                }}
                style={({ pressed }) => [styles.tipHead, pressed && { opacity: 0.86 }]}
              >
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Feather name={expanded ? "arrow-down-right" : "arrow-up-right"} size={20} color="#D0D0D0" />
              </Pressable>
              {expanded ? (
                <>
                  {tip.details ? <Text style={styles.tipBody}>{tip.details}</Text> : null}
                  {tip.image ? (
                    <View style={styles.tipImageContainer}>
                      <Pressable
                        onPress={() => {
                          setSamplePreviewImage(tip.image);
                          setSamplePreviewTitle(tip.title || "Sample Document");
                          setSamplePreviewOpen(true);
                        }}
                        style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                      >
                        <Image source={tip.image} style={styles.tipImage} resizeMode="contain" />
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          );
        })}
      </>
    );
  };

  const requiredStepOrder = ["deathCert", "validId", "barangay", "indigency"] as const;
  type RequiredStepKey = (typeof requiredStepOrder)[number];

  const [currentStep, setCurrentStep] = useState(0);
  const [stepInitialized, setStepInitialized] = useState(false);

  const stepLabels: Record<RequiredStepKey, string> = {
    deathCert: "Submit Death Certificate",
    validId: "Submit Valid ID of Deceased",
    barangay: "Submit Barangay Endorsement of the Deceased",
    indigency: "Submit Indigency Certificate of the Deceased",
  };

  const getFileByKey = (key: RequiredStepKey): PickedFile | null => {
    if (key === "deathCert") return deathCertFile;
    if (key === "validId") return validIdFile;
    if (key === "barangay") return barangayFile;
    return indigencyCertFile;
  };

  const pickForKey = (key: RequiredStepKey) => {
    if (key === "deathCert") return pickDeathCert();
    if (key === "validId") return pickValidId();
    if (key === "barangay") return pickBarangay();
    return pickIndigencyCert();
  };

  useEffect(() => {
    if (isLoading || stepInitialized) return;
    const firstMissingIndex = requiredStepOrder.findIndex((key) => !getFileByKey(key));
    setCurrentStep(firstMissingIndex === -1 ? requiredStepOrder.length : firstMissingIndex);
    setStepInitialized(true);
  }, [isLoading, stepInitialized, deathCertFile, validIdFile, barangayFile, indigencyCertFile]);

  const totalSteps = requiredStepOrder.length + 1;
  const infoStepIndex = requiredStepOrder.length;
  const isInfoStep = currentStep === infoStepIndex;
  const currentStepKey = requiredStepOrder[Math.min(currentStep, requiredStepOrder.length - 1)];
  const currentFile = isInfoStep ? null : getFileByKey(currentStepKey);
  const isLastStep = isInfoStep;
  const canProceedStep = isInfoStep ? true : (!!currentFile && !isSaving && !isSubmitting);

  const onPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => Math.max(prev - 1, 0));
      return;
    }
    setBackConfirmOpen(true);
  };

  const onNextStep = () => {
    if (!canProceedStep) return;
    if (isLastStep) {
      onSubmit();
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, requiredStepOrder.length));
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={TEAL} />
        <Text style={{ marginTop: 12, color: MUTED }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <View style={styles.topSideSpacer} />

        <View style={styles.topCenter}>
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: isConnected === false ? DANGER : isConnected === true ? "#2ECC71" : "#B7C2C2" },
            ]}
          />
          {isConnected === false && <Text style={styles.offlineText}>Offline</Text>}
          <Text style={styles.topTitle}>Cremation Assistance</Text>
        </View>

        <Pressable
          onPress={() => setBackConfirmOpen(true)}
          style={({ pressed }) => [styles.homeBtn, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="home" size={18} color={TEAL} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.serviceCard}>
          <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardTopGradient} />

          <View style={styles.iconBox}>
            <Image source={ICON_CREMATION} style={styles.serviceIcon} resizeMode="contain" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.serviceName}>Cremation Assistance</Text>
            <Text style={styles.serviceDesc}>Urgent aid for immediate and essential cremation services.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Service Requirements</Text>
        <Text style={styles.stepTitle}>Step {currentStep + 1} out of {totalSteps}</Text>
        <View style={styles.noteRow}>
          {isSaving ? (
            <ActivityIndicator size={14} color={TEAL} style={{ marginTop: 1 }} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={14} color="#B7C2C2" style={{ marginTop: 1 }} />
          )}
          <Text style={styles.sectionNote}>{isSaving ? "Saving..." : "Your files are auto-saved"}</Text>
        </View>
        {tableReady === false && (
          <View
            style={{
              marginTop: 8,
              marginBottom: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#F1D1D1",
              backgroundColor: "#FFF5F5",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontFamily: FONT, fontSize: 12, fontWeight: "600", color: DANGER }}>
              Cremation requests are not yet available in the backend. Please contact support.
            </Text>
          </View>
        )}

        <Text style={styles.reqLabel}>Coverage of Assistance<Text style={styles.reqStar}> *</Text></Text>

        <View style={[styles.coverageCard, { borderColor: funeralAid ? "#CDEBEB" : "#F1D1D1", backgroundColor: funeralAid ? "#F2FCFC" : "#FFF5F5" }]}> 
          <Text style={[styles.coverageTitle, { color: funeralAid ? TEAL : DANGER }]}>Funeral Coverage</Text>
          <Text style={[styles.coverageValue, { color: funeralAid ? TEAL : DANGER }]}> 
            {funeralAid || "No selection. Please choose in Cremation Details."}
          </Text>
        </View>

        <View style={[styles.coverageCard, { borderColor: nicheAllocation ? "#CDEBEB" : "#F1D1D1", backgroundColor: nicheAllocation ? "#F2FCFC" : "#FFF5F5" }]}> 
          <Text style={[styles.coverageTitle, { color: nicheAllocation ? TEAL : DANGER }]}>Niche Coverage</Text>
          <Text style={[styles.coverageValue, { color: nicheAllocation ? TEAL : DANGER }]}> 
            {nicheAllocation || "No selection. Please choose in Cremation Details."}
          </Text>
        </View>


        {!isInfoStep ? (
          <>
            <Text style={styles.reqLabel}>
              {stepLabels[currentStepKey]} <Text style={styles.reqStar}>*</Text>
            </Text>

            {!currentFile ? (
              <Pressable
                onPress={() => pickForKey(currentStepKey)}
                style={({ pressed }) => [
                  styles.dropBox,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <View style={styles.plusCol}>
                  <Ionicons name="add" size={26} color={TEAL} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropTitle}>Attach requested files.</Text>
                  <Text style={styles.dropSub}>
                    Files supported (jpeg, pdf, png) Max 5 MB
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.dropBoxFilled}>
                <SwipeDeletePill
                  file={currentFile}
                  onRequestRemove={() => openRemove(currentStepKey)}
                  thumbnailUri={signedUrls[currentStepKey]}
                  onPress={() => openPreview(currentStepKey, currentFile.name)}
                />
              </View>
            )}
            {renderTips(currentStepKey)}
          </>
        ) : null}

        {isInfoStep ? (
          <>
            <Text style={styles.additionalTitle}>Additional Information</Text>

        <Text style={styles.reqLabel}>
          Description or Other Relevant Information (optional)
        </Text>
        <TextInput
          style={styles.textArea}
          placeholder="Provide any additional details or requirements."
          placeholderTextColor={"#A0A9A9"}
          multiline
          maxLength={400}
          value={additionalInfo}
          onChangeText={handleAdditionalChange}
          textAlignVertical="top"
          editable={!isSaving}
        />
        <Text style={styles.charCount}>
          {additionalInfo.length}/400 characters
        </Text>

          <Text style={styles.reqLabel}>Attachments (optional)</Text>

          {!attachmentFile ? (
          <Pressable
            onPress={pickAttachment}
            style={({ pressed }) => [
              styles.dropBox,
              pressed && { opacity: 0.92 },
            ]}
          >
            <View style={styles.plusCol}>
              <Ionicons name="add" size={26} color={TEAL} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dropTitle}>Attach requested files.</Text>
              <Text style={styles.dropSub}>
                Files supported (jpeg, pdf, png) Max 5 MB
              </Text>
            </View>
          </Pressable>
          ) : (
          <View style={styles.dropBoxFilled}>
            <SwipeDeletePill
              file={attachmentFile}
              onRequestRemove={() => openRemove("attachment")}
              thumbnailUri={signedUrls.attachment}
              onPress={() => openPreview("attachment", attachmentFile.name)}
            />
          </View>
            )}
          </>
        ) : null}

        <View style={{ height: 140 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={onPreviousStep}
            style={({ pressed }) => [styles.prevBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.prevText}>{currentStep === 0 ? "Back" : "Previous"}</Text>
          </Pressable>

          <Pressable
            onPress={onNextStep}
            disabled={isLastStep ? !canSubmit : !canProceedStep}
            onPressIn={isLastStep ? (canSubmit ? nextAnim.pressIn : undefined) : (canProceedStep ? nextAnim.pressIn : undefined)}
            onPressOut={isLastStep ? (canSubmit ? nextAnim.pressOut : undefined) : (canProceedStep ? nextAnim.pressOut : undefined)}
            style={{ flex: 1 }}
          >
            <Animated.View
              style={[
                styles.nextBtn,
                (isLastStep ? !canSubmit : !canProceedStep) && styles.nextBtnDisabled,
                { transform: [{ scale: nextAnim.scale }] },
              ]}
            >
              <Text
                style={[styles.nextText, (isLastStep ? !canSubmit : !canProceedStep) && styles.nextTextDisabled]}
              >
                {isLastStep ? "Submit" : "Next"}
              </Text>
            </Animated.View>
          </Pressable>
        </View>
      </View>

      <Modal transparent visible={removeOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={cancelRemove}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Image
              source={TRASHCAN_PNG}
              style={styles.trashImg}
              resizeMode="contain"
            />

            <Text style={styles.modalTitle}>
              Are you sure you want to{"\n"}remove this file?
            </Text>

            <Text style={styles.modalSub}>
              "{removeTarget ? removeTargetLabels[removeTarget] : "File"}"
            </Text>

            <View style={styles.modalBtns}>
              <Pressable
                onPress={cancelRemove}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={confirmRemove}
                style={({ pressed }) => [
                  styles.removeBtn,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={backConfirmOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setBackConfirmOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Go back to Home?</Text>
            <Text style={styles.modalSub}>Changes will be saved to draft</Text>

            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setBackConfirmOpen(false)}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.cancelText}>No</Text>
              </Pressable>

              <Pressable
                onPress={confirmBackAndGoHome}
                style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.removeText}>Yes</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={previewOpen} animationType="fade">
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
            {previewUri && (
              <Image
                source={{ uri: previewUri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={samplePreviewOpen} animationType="fade">
        <Pressable style={styles.previewOverlay} onPress={() => setSamplePreviewOpen(false)}>
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
            {samplePreviewImage ? (
              <Image source={samplePreviewImage} style={styles.previewImage} resizeMode="contain" />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {loadingPreview && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },

  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 16,
    color: TEXT_DARK,
  },
  topCenter: { position: "absolute", left: 0, right: 0, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  onlineDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  offlineText: { marginRight: 8, color: DANGER, fontSize: 12 },
  homeBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DDEEEE", backgroundColor: "#F7FCFC" },
  topSideSpacer: { width: 36, height: 36 },

  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },

  serviceCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "#FFFFFF",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  cardTopGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },

  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: ICON_BG,
    borderWidth: 1,
    borderColor: ICON_BORDER,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  serviceIcon: { width: 28, height: 28 },

  serviceName: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13.5,
    color: TEXT_DARK,
  },
  serviceDesc: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 11.2,
    lineHeight: 15,
    color: MUTED,
  },

  sectionTitle: {
    marginTop: 14,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  stepTitle: { marginTop: 6, fontFamily: FONT, fontWeight: "700", fontSize: 12.5, color: TEAL },

  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  sectionNote: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.8,
    color: "#B7C2C2",
  },

  coverageCard: {
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  coverageTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 11.5,
  },
  coverageValue: {
    marginTop: 3,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
  },
  reqLabel: {
    marginTop: 14,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    color: TEXT_DARK,
  },
  reqStar: { color: DANGER },

  dropBox: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: DROP_BG,
    borderWidth: 1.8,
    borderColor: DROP_DASH,
    borderStyle: "dashed",
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  plusCol: { width: 26, alignItems: "center", justifyContent: "center" },
  dropTitle: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: TEAL,
  },
  dropSub: {
    marginTop: 4,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 11.2,
    color: "#3A4A4A",
  },

  dropBoxFilled: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: DROP_BG,
    borderWidth: 1.8,
    borderColor: DROP_DASH,
    borderStyle: "dashed",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },

  swipeWrap: { width: "100%", height: ROW_HEIGHT, overflow: "hidden" },
  swipeActions: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_OPEN_PX,
    alignItems: "center",
    justifyContent: "center",
  },
  trashSquare: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F7DCDC",
    alignItems: "center",
    justifyContent: "center",
  },

  filePill: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4EFEF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  pillName: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 11.5,
    color: TEXT_DARK,
  },
  pillMeta: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.5,
    color: "#7E8F8F",
  },

  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  prevBtn: { width: 112, height: 52, borderRadius: 26, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  prevText: { fontFamily: FONT, fontWeight: "700", fontSize: 13, color: "#FFFFFF" },
  nextBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  nextBtnDisabled: { backgroundColor: DISABLED_BG },
  nextText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
  nextTextDisabled: { color: DISABLED_TEXT },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  trashImg: { width: 78, height: 78, marginBottom: 10 },

  modalTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    color: TEXT_DARK,
    textAlign: "center",
    lineHeight: 18,
  },
  modalSub: {
    marginTop: 8,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12,
    color: "#6E7E7E",
    textAlign: "center",
  },

  modalBtns: { flexDirection: "row", gap: 12, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: CANCEL_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12.5,
    color: "#FFFFFF",
  },
  removeBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12.5,
    color: "#FFFFFF",
  },

  deleteBtn: {
    width: 150,
    height: 52,
    borderRadius: 26,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  deleteText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    color: "#FFFFFF",
  },

  additionalTitle: {
    marginTop: 20,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 13,
    color: TEXT_DARK,
  },
  textArea: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: DROP_DASH,
    padding: 12,
    height: 150,
    fontFamily: FONT,
    fontSize: 13,
    color: TEXT_DARK,
    backgroundColor: "#FFFFFF",
    textAlignVertical: "top",
  },
  charCount: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 10.5,
    color: MUTED,
    textAlign: "right",
  },

  tipSectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 12,
    color: TEXT_DARK,
  },
  tipCard: {
    borderWidth: 1,
    borderColor: "#E5EFEF",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
    overflow: "hidden",
  },
  tipHead: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tipTitle: {
    flex: 1,
    paddingRight: 12,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 12,
    color: TEXT_DARK,
  },
  tipBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginTop: -2,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 11,
    lineHeight: 16,
    color: "#8A9494",
  },
  tipImageContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginTop: -4,
  },
  tipImage: {
    width: "100%",
    height: 170,
    borderRadius: 10,
    backgroundColor: "#F4F8F8",
  },

  fileThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#E8F4F4",
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
