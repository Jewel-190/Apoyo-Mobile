import { Feather, Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
} from "react-native";
import { supabase } from "../../../lib/supabase";

const MEDICAL_PNG = require("../../../assets/images/Medical.png");
const TRASHCAN_PNG = require("../../../assets/images/Trashcan.png");
const SAMPLE_MED_CERT_PNG = require("../../../assets/images/HolySpirit.png");
const SAMPLE_RX_PNG = require("../../../assets/images/RalphJacinto.png");
const SAMPLE_QUOTATION_PNG = require("../../../assets/images/Quotation.png");
const SAMPLE_INDIGENCY_PNG = require("../../../assets/images/Indigency.png");
const SAMPLE_ENDORSEMENT_PNG = require("../../../assets/images/Endorsement.png");
const SAMPLE_VOTERS_PNG = require("../../../assets/images/VotersCert.png");
const SAMPLE_LETTER_PNG = require("../../../assets/images/SampleLetter.png");

const FONT = "SF Pro Rounded";

const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const BORDER = "#E9EDED";

const CARD_BORDER = "#BFE8E6";
const ICON_BG = "#EAFBFB";
const ICON_BORDER = "#D8F1F1";

const DROP_BG = "#F6FEFE";
const DROP_DASH = "#68C9C5";

const DISABLED_BG = "#DDEEEE";
const DISABLED_TEXT = "#B8CACA";

const DANGER = "#E45454";
const CANCEL_BG = "#BDBDBD";

const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const SWIPE_OPEN_PX = 56;
const SWIPE_DELETE_PX = 120;
const ROW_HEIGHT = 64;

type PickedFile = {
  name: string;
  size?: number;
  uri: string;
  mimeType?: string;
};

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

async function pickOneFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    multiple: false,
    copyToCacheDirectory: true,
  });

  // handle expo picker shapes safely
  // @ts-ignore
  if (res?.canceled) return null;
  // @ts-ignore
  const a = res?.assets?.[0];
  if (!a) return null;

  const f: PickedFile = {
    name: a.name ?? "file",
    size: a.size,
    uri: a.uri,
    mimeType: a.mimeType,
  };

  if (typeof f.size === "number" && f.size > MAX_BYTES) {
    Alert.alert("File too large", `Max file size is ${MAX_MB} MB.`);
    return null;
  }

  return f;
}

function bytesLabel(size?: number) {
  if (typeof size !== "number") return "";
  const mb = size / (1024 * 1024);
  if (mb < 0.01) return "";
  return `${mb.toFixed(mb >= 10 ? 0 : 2)} MB`;
}

function fileKindLabel(mimeType?: string, name?: string) {
  const n = (name || "").toLowerCase();
  if (mimeType?.includes("pdf") || n.endsWith(".pdf")) return "PDF";
  if (mimeType?.includes("png") || n.endsWith(".png")) return "PNG";
  if (
    mimeType?.includes("jpeg") ||
    mimeType?.includes("jpg") ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg")
  )
    return "JPG";
  return "FILE";
}

function fileIconName(
  mimeType?: string,
  name?: string
): keyof typeof Ionicons.glyphMap {
  const kind = fileKindLabel(mimeType, name);
  if (kind === "PDF") return "document-text-outline";
  return "image-outline";
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

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

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
      Animated.timing(rowOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(rowScale, {
        toValue: 0.98,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
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
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dy) < 10,
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
        <Pressable
          onPress={animateDeleteThenConfirm}
          style={({ pressed }) => [
            styles.trashSquare,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="trash-outline" size={16} color={DANGER} />
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.filePill,
          {
            height: ROW_HEIGHT,
            transform: [{ translateX }, { scale: rowScale }],
            opacity: rowOpacity,
          },
        ]}
        {...pan.panHandlers}
      >
        {/* Thumbnail or icon */}
        <Pressable onPress={onPress} disabled={!onPress}>
          {isImage && thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={styles.fileThumbnail}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name={fileIconName(file.mimeType, file.name)}
              size={18}
              color={TEAL}
            />
          )}
        </Pressable>

        <Pressable style={{ flex: 1 }} onPress={onPress} disabled={!onPress}>
          <Text style={styles.pillName} numberOfLines={1}>
            {file.name}
          </Text>
          <Text style={styles.pillMeta}>{bytesLabel(file.size) || "Tap to view"}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (open) close();
            else openTrash();
          }}
          hitSlop={10}
          style={({ pressed }) => [
            { padding: 6 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name={open ? "chevron-forward" : "chevron-back"}
            size={16}
            color="#9BB0B0"
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Storage bucket name
const BUCKET_NAME = "medical-documents";

// File metadata stored in DB
type FileMetadata = {
  path: string;
  originalName: string;
  size?: number;
  mimeType?: string;
};

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

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, arrayBuffer, {
      upsert: true,
      contentType: file.mimeType || "application/octet-stream",
    });

  if (error) throw error;

  return {
    path: filePath,
    originalName: file.name,
    size: file.size,
    mimeType: file.mimeType,
  };
}

async function getSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(filePath, 3600);
  if (error) return null;
  return data.signedUrl;
}

export default function MedicalReq() {
  const router = useRouter();
  const params = useLocalSearchParams<{ serviceId?: string; requestId?: string }>();
  const serviceId = params?.serviceId || "operations";
  const existingRequestId = params?.requestId;

  const [userId, setUserId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(existingRequestId || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);

  // File states
  const [medCertFile, setMedCertFile] = useState<PickedFile | null>(null);
  const [prescriptionFile, setPrescriptionFile] = useState<PickedFile | null>(null);
  const [quotationFile, setQuotationFile] = useState<PickedFile | null>(null);
  const [letterFile, setLetterFile] = useState<PickedFile | null>(null);
  const [voterIdFile, setVoterIdFile] = useState<PickedFile | null>(null);
  const [birthCertFile, setBirthCertFile] = useState<PickedFile | null>(null);
  const [barangayFile, setBarangayFile] = useState<PickedFile | null>(null);
  const [indigencyFile, setIndigencyFile] = useState<PickedFile | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<PickedFile | null>(null);

  const [uploadedPaths, setUploadedPaths] = useState<Record<string, string>>({});
  const [additionalInfo, setAdditionalInfo] = useState("");

  const [requesterName, setRequesterName] = useState<string>("");
  const [requesterContactNumber, setRequesterContactNumber] = useState<string>("");
  const [requesterEmail, setRequesterEmail] = useState<string>("");
  const [requesterPresentAddress, setRequesterPresentAddress] = useState<string>("");
  const [requesterLocked, setRequesterLocked] = useState<boolean>(false);
  const [openTipId, setOpenTipId] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewIsPdf, setPreviewIsPdf] = useState<boolean>(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [samplePreviewOpen, setSamplePreviewOpen] = useState(false);
  const [samplePreviewImage, setSamplePreviewImage] = useState<any | null>(null);
  const [samplePreviewTitle, setSamplePreviewTitle] = useState<string>("");

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    loadUserAndDraft();
  }, []);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
    });
    NetInfo.fetch().then((s) => setIsConnected(s.isConnected ?? false));
    return () => unsub();
  }, []);

  const loadUserAndDraft = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "Please log in to continue");
        router.back();
        return;
      }
      setUserId(user.id);

      // try to prefill from profile data
      if (!existingRequestId) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("first_name,middle_name,last_name,suffix,contact_number,email,address")
            .eq("id", user.id)
            .single();

          if (profile) {
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
      }

      if (existingRequestId) {
        const { data, error } = await supabase
          .from("medical_requests")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", existingRequestId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (data && !error) {
          setRequestId(data.id);
          setAdditionalInfo(data.additional_info || "");
          if (!requesterLocked) {
            setRequesterName(data.requester_name || "");
            setRequesterContactNumber(data.requester_contact_number || "");
            setRequesterEmail(data.requester_email || "");
            setRequesterPresentAddress(data.requester_present_address || "");
          }

          const parseFileMeta = (raw: string | null): { path: string; name: string } | null => {
            if (!raw) return null;
            try {
              const meta = JSON.parse(raw) as FileMetadata;
              return { path: meta.path, name: meta.originalName };
            } catch {
              return { path: raw, name: raw.split("/").pop() || "file" };
            }
          };

          const paths: Record<string, string> = {};
          const medMeta = parseFileMeta(data.med_cert_file_path);
          if (medMeta) { paths.medCert = medMeta.path; setMedCertFile({ name: medMeta.name, uri: "" }); }
          const presMeta = parseFileMeta(data.prescription_file_path);
          if (presMeta) { paths.prescription = presMeta.path; setPrescriptionFile({ name: presMeta.name, uri: "" }); }
          const quotMeta = parseFileMeta(data.quotation_file_path);
          if (quotMeta) { paths.quotation = quotMeta.path; setQuotationFile({ name: quotMeta.name, uri: "" }); }
          const letterMeta = parseFileMeta(data.letter_file_path);
          if (letterMeta) { paths.letter = letterMeta.path; setLetterFile({ name: letterMeta.name, uri: "" }); }
          const voterMeta = parseFileMeta(data.voter_id_file_path);
          if (voterMeta) { paths.voterId = voterMeta.path; setVoterIdFile({ name: voterMeta.name, uri: "" }); }
          const birthMeta = parseFileMeta(data.birth_cert_file_path);
          if (birthMeta) { paths.birthCert = birthMeta.path; setBirthCertFile({ name: birthMeta.name, uri: "" }); }
          const barangayMeta = parseFileMeta(data.barangay_endorsement_file_path);
          if (barangayMeta) { paths.barangay = barangayMeta.path; setBarangayFile({ name: barangayMeta.name, uri: "" }); }
          const indigencyMeta = parseFileMeta(data.indigency_cert_file_path);
          if (indigencyMeta) { paths.indigency = indigencyMeta.path; setIndigencyFile({ name: indigencyMeta.name, uri: "" }); }
          const attachMeta = parseFileMeta(data.attachment_file_path);
          if (attachMeta) { paths.attachment = attachMeta.path; setAttachmentFile({ name: attachMeta.name, uri: "" }); }

          setUploadedPaths(paths);
        }
      }
    } catch (err) {
      console.log("Load error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const ensureRequestId = async (): Promise<string> => {
    if (requestId) return requestId;
    if (!userId) throw new Error("User not logged in");

    let requesterPayload: Record<string, any> = {};
    try {
      const raw = await AsyncStorage.getItem(`apoyo_requestinfo_${serviceId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        requesterPayload = {
          requester_name: parsed.name || null,
          requester_contact_number: `${parsed.countryCode || ""}${parsed.phone || ""}` || null,
          requester_email: parsed.email || null,
          requester_present_address: parsed.address || null,
        };
      }
    } catch (e) {}

    const sid = /^\d+$/.test(String(serviceId)) ? Number(serviceId) : undefined;
    const insertPayload = {
      user_id: userId,
      status: "draft",
      ...(sid ? { service_id: sid } : {}),
      ...requesterPayload,
    };

    const { data, error } = await supabase
      .from("medical_requests")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) throw error;
    setRequestId(data.id);
    if (!requesterLocked) {
      setRequesterName(requesterPayload.requester_name || "");
      setRequesterContactNumber(requesterPayload.requester_contact_number || "");
      setRequesterEmail(requesterPayload.requester_email || "");
      setRequesterPresentAddress(requesterPayload.requester_present_address || "");
    }
    return data.id;
  };

  const getColumnName = (fileType: string): string => {
    const map: Record<string, string> = {
      medCert: "med_cert_file_path",
      prescription: "prescription_file_path",
      quotation: "quotation_file_path",
      letter: "letter_file_path",
      voterId: "voter_id_file_path",
      birthCert: "birth_cert_file_path",
      barangay: "barangay_endorsement_file_path",
      indigency: "indigency_cert_file_path",
      attachment: "attachment_file_path",
    };
    return map[fileType] || fileType;
  };

  const handleFilePick = async (
    fileType: string,
    setFile: (f: PickedFile | null) => void
  ) => {
    const file = await pickOneFile();
    if (!file || !userId) return;

    try {
      setIsSaving(true);
      const reqId = await ensureRequestId();
      const fileMetadata = await uploadFileToStorage(userId, reqId, fileType, file);
      const columnName = getColumnName(fileType);
      await supabase
        .from("medical_requests")
        .update({ [columnName]: JSON.stringify(fileMetadata) })
        .eq("id", reqId);

      setFile(file);
      setUploadedPaths(prev => ({ ...prev, [fileType]: fileMetadata.path }));
    } catch (err: any) {
      Alert.alert("Upload Error", err.message || "Failed to upload file");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileRemove = async (fileType: string) => {
    const filePath = uploadedPaths[fileType];
    if (!filePath || !requestId) return;

    try {
      setIsSaving(true);
      const columnName = getColumnName(fileType);
      await supabase
        .from("medical_requests")
        .update({ [columnName]: null })
        .eq("id", requestId);

      setUploadedPaths(prev => {
        const updated = { ...prev };
        delete updated[fileType];
        return updated;
      });

      const setters: Record<string, (f: PickedFile | null) => void> = {
        medCert: setMedCertFile,
        prescription: setPrescriptionFile,
        quotation: setQuotationFile,
        letter: setLetterFile,
        voterId: setVoterIdFile,
        birthCert: setBirthCertFile,
        barangay: setBarangayFile,
        indigency: setIndigencyFile,
        attachment: setAttachmentFile,
      };
      setters[fileType]?.(null);
    } catch (err: any) {
      Alert.alert("Delete Error", err.message || "Failed to delete file");
    } finally {
      setIsSaving(false);
    }
  };

  // Debounced additional info save
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
        await supabase
          .from("medical_requests")
          .update({ additional_info: text })
          .eq("id", requestId);
      } catch (err) {
        console.log("Save additional info error:", err);
      } finally {
        if (token === latestSaveTokenRef.current) setIsSaving(false);
      }
    }, 700);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      latestSaveTokenRef.current++;
    };
  }, []);

  useEffect(() => {
    const loadSignedUrls = async () => {
      const urls: Record<string, string> = {};
      for (const [key, path] of Object.entries(uploadedPaths)) {
        if (path && /\.(jpg|jpeg|png|gif|webp)$/i.test(path)) {
          const url = await getSignedUrl(path);
          if (url) urls[key] = url;
        }
      }
      setSignedUrls(urls);
    };
    if (Object.keys(uploadedPaths).length > 0) loadSignedUrls();
  }, [uploadedPaths]);


  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;

      const onBackPress = () => {
        if (previewOpen) { setPreviewOpen(false); return true; }
        if (removeOpen) { setRemoveOpen(false); setRemoveTarget(null); return true; }
        setBackConfirmOpen(true);
        return true;
      };

      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [previewOpen, removeOpen])
  );

  const openPreview = async (fileType: string, fileName: string) => {
    const path = uploadedPaths[fileType];
    if (!path) return;
    setLoadingPreview(true);
    setPreviewName(fileName);
    try {
      const url = await getSignedUrl(path);
      if (!url) { Alert.alert("Error", "Could not load file preview"); setLoadingPreview(false); return; }
      const isPdf = /\.pdf($|\?)/i.test(fileName || "") || /\.pdf($|\?)/i.test(path || "");
      setPreviewIsPdf(isPdf);
      setPreviewUri(url);
      setPreviewOpen(true);
    } catch (e) {
      console.log("Preview error:", e);
      Alert.alert("Error", "Could not load file preview");
    }
    setLoadingPreview(false);
  };

  const canSubmit = useMemo(() =>
    !!medCertFile && !!prescriptionFile && !!quotationFile && !!letterFile && !!voterIdFile && !!birthCertFile && !!barangayFile && !!indigencyFile && !isSaving && !isSubmitting
  , [medCertFile, prescriptionFile, quotationFile, letterFile, voterIdFile, birthCertFile, barangayFile, indigencyFile, isSaving, isSubmitting]);

  const submitAnim = usePressScale();
  const nextAnim = submitAnim;

  const onSubmit = async () => {
    if (!canSubmit || !requestId) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from("medical_requests")
        .update({ status: "pending", submitted_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      router.push({ pathname: "/Home/Medical/SubmissionSuccess", params: { serviceId, requestId } } as any);
    } catch (err: any) {
      Alert.alert("Submit Error", err.message || "Failed to submit request");
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const openRemove = (target: string | null) => { setRemoveTarget(target); setRemoveOpen(true); };
  const confirmRemove = async () => { if (removeTarget) await handleFileRemove(removeTarget); setRemoveOpen(false); setRemoveTarget(null); };
  const cancelRemove = () => { setRemoveOpen(false); setRemoveTarget(null); };

  const confirmBackAndGoHome = async () => {
    setBackConfirmOpen(false);
    try {
      setIsSaving(true);
      const reqId = await ensureRequestId();
      await supabase
        .from("medical_requests")
        .update({ additional_info: additionalInfo })
        .eq("id", reqId);
    } catch (err) {
      console.log("Error saving draft on back:", err);
    } finally {
      setIsSaving(false);
      router.push("/Home/Home" as any);
    }
  };

  const pickMedCert = () => handleFilePick("medCert", setMedCertFile);
  const pickPrescription = () => handleFilePick("prescription", setPrescriptionFile);
  const pickQuotation = () => handleFilePick("quotation", setQuotationFile);
  const pickLetter = () => handleFilePick("letter", setLetterFile);
  const pickVoterId = () => handleFilePick("voterId", setVoterIdFile);
  const pickBirthCert = () => handleFilePick("birthCert", setBirthCertFile);
  const pickBarangay = () => handleFilePick("barangay", setBarangayFile);
  const pickIndigency = () => handleFilePick("indigency", setIndigencyFile);
  const pickAttachment = () => handleFilePick("attachment", setAttachmentFile);

  const requirementTips = useMemo(
    () => ({
      medCert: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "where", title: "Where to Get It", details: "Get this from a licensed physician, clinic, or hospital medical records section." },
          { id: "bring", title: "What to Bring", details: "Bring valid ID and recent related medical records or lab results if available." },
          { id: "how", title: "How to Get It", details: "Complete consultation and request a certificate with diagnosis, signature, and PRC details." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_MED_CERT_PNG },
        ],
      },
      prescription: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "where", title: "Where to Get It", details: "Request this from a licensed doctor through clinic, hospital, or valid teleconsultation." },
          { id: "bring", title: "What to Bring", details: "Bring previous prescriptions, lab results, and ID to support proper prescription issuance." },
          { id: "how", title: "How to Get It", details: "Undergo consultation and ensure the prescription includes generic name and doctor PRC information." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_RX_PNG },
        ],
      },
      quotation: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "where", title: "Where to Get It", details: "Request this from hospital billing/admitting offices or accredited labs/pharmacies." },
          { id: "bring", title: "What to Bring", details: "Bring doctor orders, clinical details, and valid ID for accurate cost estimate." },
          { id: "how", title: "How to Get It", details: "Ask for itemized quotation and verify signature plus official stamp before submission." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_QUOTATION_PNG },
        ],
      },
      letter: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "format", title: "Format for Personal Letter", details: "Include date, request reason, medical context, contact details, requested aid amount, and signature." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_LETTER_PNG },
        ],
      },
      voterId: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "where", title: "Where to Get It", details: "Get this from your local COMELEC office after voter record verification." },
          { id: "bring", title: "What to Bring", details: "Bring valid ID, request form, and authorization if claiming for someone else." },
          { id: "how", title: "How to Get It", details: "Verify record, pay if needed, submit receipt/form, then claim signed and sealed certificate." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_VOTERS_PNG },
        ],
      },
      birthCert: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "accepted", title: "List of Accepted ID's", details: "PhilID/ePhilID, Passport, Driver's License, UMID, PRC, Postal ID, Voter's ID/Certificate, SSS/GSIS, Senior Citizen ID, PWD ID, TIN, and PhilHealth." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_VOTERS_PNG },
        ],
      },
      barangay: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "where", title: "Where to Get It", details: "Request this from your barangay hall where you currently reside." },
          { id: "bring", title: "What to Bring", details: "Bring valid ID, indigency certificate, and proof of medical need." },
          { id: "how", title: "How to Get It", details: "Ask for endorsement letter, ensure recipient details, and secure signature with dry seal." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_ENDORSEMENT_PNG },
        ],
      },
      indigency: {
        title: "Tips on Getting Requirements",
        items: [
          { id: "where", title: "Where to Get It", details: "Get this from your barangay hall based on residence jurisdiction." },
          { id: "bring", title: "What to Bring", details: "Bring valid ID, proof of residency, and supporting medical request documents." },
          { id: "how", title: "How to Get It", details: "Complete assessment and claim signed certificate with official dry seal." },
          { id: "sample", title: "Sample Document", details: "", image: SAMPLE_INDIGENCY_PNG },
        ],
      },
    }),
    []
  );

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

  const requiredStepOrder = [
    "medCert",
    "prescription",
    "quotation",
    "letter",
    "voterId",
    "birthCert",
    "barangay",
    "indigency",
  ] as const;
  type RequiredStepKey = (typeof requiredStepOrder)[number];

  const [currentStep, setCurrentStep] = useState(0);
  const [stepInitialized, setStepInitialized] = useState(false);

  const stepLabels: Record<RequiredStepKey, string> = {
    medCert: "Submit Medical Certificate",
    prescription: "Submit Doctor's Prescription",
    quotation: "Submit Quotation of Expenses",
    letter: "Submit Letter of Request to the Mayor",
    voterId: "Submit Patient's Voter's ID / Certificate",
    birthCert: "Submit Valid ID / Birth Certificate",
    barangay: "Submit Barangay Endorsement",
    indigency: "Submit Certificate of Indigency",
  };

  const getFileByKey = (key: RequiredStepKey): PickedFile | null => {
    if (key === "medCert") return medCertFile;
    if (key === "prescription") return prescriptionFile;
    if (key === "quotation") return quotationFile;
    if (key === "letter") return letterFile;
    if (key === "voterId") return voterIdFile;
    if (key === "birthCert") return birthCertFile;
    if (key === "barangay") return barangayFile;
    return indigencyFile;
  };

  const pickForKey = (key: RequiredStepKey) => {
    if (key === "medCert") return pickMedCert();
    if (key === "prescription") return pickPrescription();
    if (key === "quotation") return pickQuotation();
    if (key === "letter") return pickLetter();
    if (key === "voterId") return pickVoterId();
    if (key === "birthCert") return pickBirthCert();
    if (key === "barangay") return pickBarangay();
    return pickIndigency();
  };

  useEffect(() => {
    if (isLoading || stepInitialized) return;
    const firstMissingIndex = requiredStepOrder.findIndex((key) => !getFileByKey(key));
    setCurrentStep(firstMissingIndex === -1 ? requiredStepOrder.length : firstMissingIndex);
    setStepInitialized(true);
  }, [
    isLoading,
    stepInitialized,
    medCertFile,
    prescriptionFile,
    quotationFile,
    letterFile,
    voterIdFile,
    birthCertFile,
    barangayFile,
    indigencyFile,
  ]);

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
          <Text style={styles.topTitle}>Medical Assistance - Operations</Text>
        </View>

        <Pressable
          onPress={() => setBackConfirmOpen(true)}
          style={({ pressed }) => [styles.homeBtn, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="home" size={18} color={TEAL} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.serviceCard}>
          <LinearGradient colors={["#12B4D8", "#2AC8EE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardTopGradient} />

          <View style={styles.iconBox}>
            <Image source={MEDICAL_PNG} style={styles.hospitalIcon} resizeMode="contain" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.serviceName}>Medical Operations</Text>
            <Text style={styles.serviceDesc}>Emergency funding for dialysis, chemotherapy, and medical operations.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Service Requirements</Text>

        <View style={styles.noteRow}>
          {isSaving ? (<ActivityIndicator size={14} color={TEAL} style={{ marginTop: 1 }} />) : (<Ionicons name="cloud-upload-outline" size={14} color="#B7C2C2" style={{ marginTop: 1 }} />)}
          <Text style={styles.sectionNote}>{isSaving ? "Saving..." : "Your files are auto-saved"}</Text>
        </View>

        {requiredStepOrder.map((stepKey) => {
          const stepFile = getFileByKey(stepKey);
          return (
            <View key={stepKey}>
              <Text style={styles.reqLabel}>
                {stepLabels[stepKey]} <Text style={styles.reqStar}>*</Text>
              </Text>
              {!stepFile ? (
                <Pressable onPress={() => pickForKey(stepKey)} style={({ pressed }) => [styles.dropBox, pressed && { opacity: 0.92 }]}>
                  <View style={styles.plusCol}><Ionicons name="add" size={26} color={TEAL} /></View>
                  <View style={{ flex: 1 }}><Text style={styles.dropTitle}>Attach requested files.</Text><Text style={styles.dropSub}>Files supported (jpeg, pdf, png) Max 5 MB</Text></View>
                </Pressable>
              ) : (
                <View style={styles.dropBoxFilled}><SwipeDeletePill file={stepFile} onRequestRemove={() => openRemove(stepKey)} thumbnailUri={signedUrls[stepKey]} onPress={() => openPreview(stepKey, stepFile.name)} /></View>
              )}
            </View>
          );
        })}

        <Text style={styles.additionalTitle}>Additional Information</Text>
        <Text style={styles.reqLabel}>Description or Other Relevant Information (optional)</Text>
        <TextInput style={styles.textArea} placeholder="Provide any additional details or requirements." placeholderTextColor={"#A0A9A9"} multiline maxLength={400} value={additionalInfo} onChangeText={handleAdditionalChange} textAlignVertical="top" editable={!isSaving} />
        <Text style={styles.charCount}>{additionalInfo.length}/400 characters</Text>

        <Text style={styles.reqLabel}>Attachments (optional)</Text>
        {!attachmentFile ? (
          <Pressable onPress={pickAttachment} style={({ pressed }) => [styles.dropBox, pressed && { opacity: 0.92 }]}>
            <View style={styles.plusCol}><Ionicons name="add" size={26} color={TEAL} /></View>
            <View style={{ flex: 1 }}><Text style={styles.dropTitle}>Attach requested files.</Text><Text style={styles.dropSub}>Files supported (jpeg, pdf, png) Max 5 MB</Text></View>
          </Pressable>
        ) : (
          <View style={styles.dropBoxFilled}><SwipeDeletePill file={attachmentFile} onRequestRemove={() => openRemove("attachment")} thumbnailUri={signedUrls.attachment} onPress={() => openPreview("attachment", attachmentFile.name)} /></View>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => setBackConfirmOpen(true)} style={({ pressed }) => [styles.prevBtn, pressed && { opacity: 0.92 }]}>
            <Text style={styles.prevText}>Back</Text>
          </Pressable>

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            onPressIn={canSubmit ? nextAnim.pressIn : undefined}
            onPressOut={canSubmit ? nextAnim.pressOut : undefined}
            style={{ flex: 1 }}
          >
            <Animated.View style={[styles.nextBtn, !canSubmit && styles.nextBtnDisabled, { transform: [{ scale: nextAnim.scale }] }]}>
              <Text style={[styles.nextText, !canSubmit && styles.nextTextDisabled]}>Submit</Text>
            </Animated.View>
          </Pressable>
        </View>
      </View>

      <Modal transparent visible={removeOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={cancelRemove}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Image source={TRASHCAN_PNG} style={styles.trashImg} resizeMode="contain" />

            <Text style={styles.modalTitle}>Are you sure you want to{"\n"}remove this file?</Text>

            <Text style={styles.modalSub}>"{removeTarget || "File"}"</Text>

            <View style={styles.modalBtns}>
              <Pressable onPress={cancelRemove} style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.9 }]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={confirmRemove} style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.9 }]}><Text style={styles.removeText}>Remove</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={backConfirmOpen} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setBackConfirmOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Go back to Home?</Text>
            <Text style={styles.modalSub}>Your current draft will be saved.</Text>
            <View style={styles.modalBtns}>
              <Pressable onPress={() => setBackConfirmOpen(false)} style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.9 }]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={confirmBackAndGoHome} style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.9 }]}><Text style={styles.removeText}>Confirm</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={previewOpen} animationType="fade">
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewOpen(false)}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{previewName}</Text>
            <Pressable onPress={() => setPreviewOpen(false)} style={({ pressed }) => [styles.previewCloseBtn, pressed && { opacity: 0.7 }]}><Ionicons name="close" size={24} color="#FFF" /></Pressable>
          </View>
          <Pressable style={styles.previewContent} onPress={() => {}}>
            {previewUri && (<Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />)}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={samplePreviewOpen} animationType="fade">
        <Pressable style={styles.previewOverlay} onPress={() => setSamplePreviewOpen(false)}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{samplePreviewTitle}</Text>
            <Pressable onPress={() => setSamplePreviewOpen(false)} style={({ pressed }) => [styles.previewCloseBtn, pressed && { opacity: 0.7 }]}>
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

      {loadingPreview && (<View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#FFF" /></View>)}
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
  topTitle: { textAlign: "center", fontFamily: FONT, fontWeight: "700", fontSize: 16, color: TEXT_DARK },
  topCenter: { position: "absolute", left: 0, right: 0, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  onlineDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  offlineText: { marginRight: 8, color: DANGER, fontSize: 12 },
  homeBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DDEEEE", backgroundColor: "#F7FCFC" },
  topSideSpacer: { width: 36, height: 36 },

  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },

  serviceCard: { borderRadius: 12, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "#FFFFFF", padding: 12, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden" },
  cardTopGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },

  iconBox: { width: 46, height: 46, borderRadius: 12, backgroundColor: ICON_BG, borderWidth: 1, borderColor: ICON_BORDER, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  hospitalIcon: { width: 28, height: 28 },

  serviceName: { fontFamily: FONT, fontWeight: "600", fontSize: 13.5, color: TEXT_DARK },
  serviceDesc: { marginTop: 2, fontFamily: FONT, fontWeight: "400", fontSize: 11.2, lineHeight: 15, color: MUTED },

  sectionTitle: { marginTop: 14, fontFamily: FONT, fontWeight: "700", fontSize: 14, color: TEXT_DARK },
  stepTitle: { marginTop: 6, fontFamily: FONT, fontWeight: "700", fontSize: 12.5, color: TEAL },
  tipSectionTitle: { marginTop: 14, fontFamily: FONT, fontWeight: "700", fontSize: 13, color: TEXT_DARK },
  tipCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  tipHead: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tipTitle: {
    flex: 1,
    marginRight: 10,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: TEXT_DARK,
  },
  tipBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 11.2,
    lineHeight: 17,
    color: "#586767",
  },
  tipImageContainer: { paddingHorizontal: 12, paddingBottom: 12 },
  tipImage: {
    width: "100%",
    height: 260,
    borderRadius: 10,
    backgroundColor: "#FAFEFE",
    borderWidth: 1,
    borderColor: "#E7F2F2",
  },

  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  sectionNote: { fontFamily: FONT, fontWeight: "400", fontSize: 10.8, color: "#B7C2C2" },

  reqLabel: { marginTop: 14, fontFamily: FONT, fontWeight: "400", fontSize: 12, color: TEXT_DARK },
  reqStar: { color: DANGER },

  dropBox: { marginTop: 10, borderRadius: 12, backgroundColor: DROP_BG, borderWidth: 1.8, borderColor: DROP_DASH, borderStyle: "dashed", paddingVertical: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  plusCol: { width: 26, alignItems: "center", justifyContent: "center" },
  dropTitle: { fontFamily: FONT, fontWeight: "600", fontSize: 13, color: TEAL },
  dropSub: { marginTop: 4, fontFamily: FONT, fontWeight: "400", fontSize: 11.2, color: "#3A4A4A" },

  dropBoxFilled: { marginTop: 10, borderRadius: 12, backgroundColor: DROP_BG, borderWidth: 1.8, borderColor: DROP_DASH, borderStyle: "dashed", paddingVertical: 12, paddingHorizontal: 12 },

  swipeWrap: { width: "100%", height: ROW_HEIGHT, overflow: "hidden" },
  swipeActions: { position: "absolute", right: 0, top: 0, bottom: 0, width: SWIPE_OPEN_PX, alignItems: "center", justifyContent: "center" },
  trashSquare: { width: 40, height: 40, borderRadius: 8, backgroundColor: "#F7DCDC", alignItems: "center", justifyContent: "center" },

  filePill: { width: "100%", backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1, borderColor: "#E4EFEF", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  pillName: { fontFamily: FONT, fontWeight: "600", fontSize: 11.5, color: TEXT_DARK },
  pillMeta: { marginTop: 2, fontFamily: FONT, fontWeight: "400", fontSize: 10.5, color: "#7E8F8F" },

  bottomBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: "#FFFFFF" },
  prevBtn: { width: 112, height: 52, borderRadius: 26, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  prevText: { fontFamily: FONT, fontWeight: "700", fontSize: 13, color: "#FFFFFF" },
  nextBtn: { height: 52, borderRadius: 26, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  nextBtnDisabled: { backgroundColor: DISABLED_BG },
  nextText: { fontFamily: FONT, fontWeight: "700", fontSize: 14, color: "#FFFFFF" },
  nextTextDisabled: { color: DISABLED_TEXT },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 360, backgroundColor: "#FFFFFF", borderRadius: 16, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  trashImg: { width: 78, height: 78, marginBottom: 10 },

  modalTitle: { fontFamily: FONT, fontWeight: "700", fontSize: 13, color: TEXT_DARK, textAlign: "center", lineHeight: 18 },
  modalSub: { marginTop: 8, fontFamily: FONT, fontWeight: "400", fontSize: 12, color: "#6E7E7E", textAlign: "center" },

  modalBtns: { flexDirection: "row", gap: 12, marginTop: 14 },
  cancelBtn: { flex: 1, height: 40, borderRadius: 10, backgroundColor: CANCEL_BG, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: FONT, fontWeight: "700", fontSize: 12.5, color: "#FFFFFF" },
  removeBtn: { flex: 1, height: 40, borderRadius: 10, backgroundColor: DANGER, alignItems: "center", justifyContent: "center" },
  removeText: { fontFamily: FONT, fontWeight: "700", fontSize: 12.5, color: "#FFFFFF" },

  additionalTitle: { marginTop: 20, fontFamily: FONT, fontWeight: "700", fontSize: 13, color: TEXT_DARK },
  textArea: { marginTop: 10, borderRadius: 12, borderWidth: 1.2, borderColor: DROP_DASH, padding: 12, height: 150, fontFamily: FONT, fontSize: 13, color: TEXT_DARK, backgroundColor: "#FFFFFF", textAlignVertical: "top" },
  charCount: { marginTop: 6, fontFamily: FONT, fontWeight: "400", fontSize: 10.5, color: MUTED, textAlign: "right" },

  fileThumbnail: { width: 36, height: 36, borderRadius: 6, backgroundColor: "#E8F4F4" },

  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)" },
  previewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16 },
  previewTitle: { flex: 1, fontFamily: FONT, fontWeight: "600", fontSize: 16, color: "#FFFFFF", marginRight: 16 },
  previewCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  previewContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  previewImage: { width: "100%", height: "100%" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },

  deleteBtn: { width: 150, height: 52, borderRadius: 26, backgroundColor: DANGER, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  deleteText: { fontFamily: FONT, fontWeight: "700", fontSize: 13, color: "#FFFFFF" },
});
