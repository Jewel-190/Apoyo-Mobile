import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
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
import BottomNavBar, { NAV_TOTAL_HEIGHT, TabKey } from "../../components/BottomNavBar";
import VerifyModal from "../../components/VerifyModal";
import { supabase } from "../../lib/supabase";

const { width } = Dimensions.get("window");

const TEAL = "#0B8F8B";
const PANEL_BG = "#F5F6F6";
const TEXT_DARK = "#2B2B2B";
const TEXT_MUTED = "#7B7B7B";

const GRAD = {
  chip: ["#7BE05B", "#63C44A"] as [string, string],
  blue: ["#12B4D8", "#2AC8EE"] as [string, string],
  yellow: ["#F6D34D", "#F2B600"] as [string, string],
  purple: ["#7C3AED", "#EC4899"] as [string, string],
};

const FONT = "SF Pro Rounded";

const CACHE_USER = "apoyo_user_cache";

const ROUTE_REQUEST = "/Home/RequestInfo";
const ROUTE_APPROVED = "/Home/ApprovedAssistance";

const PROFILE_PNG = require("../../assets/images/ProfileIcon.png");
const APPROVED_ICON_PNG = require("../../assets/images/Book2.png");

const ICON_HOSPITAL = require("../../assets/images/Hospital.png");
const ICON_TREATMENT = require("../../assets/images/Treatment.png");
const ICON_MEDICAL = require("../../assets/images/Medical.png");
const ICON_FINANCIAL = require("../../assets/images/Financial.png");
const ICON_MONETARY = require("../../assets/images/Monetary.png");
const ICON_BURIAL = require("../../assets/images/Burial.png");
const ICON_CREMATION = require("../../assets/images/Cremation.png");
const ICON_COLOMBARIUM = require("../../assets/images/Colombarium.png");

type ChipKey = "all" | "medical" | "financial" | "burial";
type Accent = "blue" | "yellow" | "purple";

type Service = {
  id: string;
  title: string;
  desc: string;
  accent: Accent;
  icon: any;
};

type ReqItem = { id: string; title: string; details?: string };

type DetailsPage = {
  headerTitle: string;
  serviceTitle: string;
  serviceDesc: string;
  about: string;
  who: string[];
  reminderTitle: string;
  reminderBody: string;
  requirementsTitle: string;
  requirements: ReqItem[];
  applyLabel: string;
};

type GateTarget =
  | { type: "service"; serviceId: string }
  | { type: "route"; path: string }
  | null;

export default function Assistance() {
  const router = useRouter();
  const params = useLocalSearchParams<{ verified?: string }>();

  const [chip, setChip] = useState<ChipKey>("all");
  const [verified, setVerified] = useState(false);

  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null);

  const [openReq, setOpenReq] = useState<
    Record<string, Record<string, boolean>>
  >({});

  const successHandledOnce = useRef(false);
  const pendingTarget = useRef<GateTarget>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Draft dialog state
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);

  const services: Service[] = useMemo(
    () => [
      {
        id: "hospital",
        title: "Hospitalization\nExpense",
        desc: "Urgent medical aid for\nexpenses during hospital\nconfinement.",
        accent: "blue",
        icon: ICON_HOSPITAL,
      },
      {
        id: "treatment",
        title: "Treatment &\nProcedures",
        desc: "Urgent medical aid for\noutpatient treatments and\nprocedures.",
        accent: "blue",
        icon: ICON_TREATMENT,
      },
      {
        id: "operations",
        title: "Medical Operations",
        desc: "Emergency funding for\ndialysis, chemotherapy,\nand medical operations.",
        accent: "blue",
        icon: ICON_MEDICAL,
      },
      {
        id: "emergency-finance",
        title: "Emergency\nFinancial Relief",
        desc: "Urgent monetary aid for\ncritical and immediate\nfinancial crises.",
        accent: "yellow",
        icon: ICON_FINANCIAL,
      },
      {
        id: "burial-money",
        title: "Monetary\nBurial Aid",
        desc: "Urgent monetary aid for\nimmediate burial service\nexpenses.",
        accent: "yellow",
        icon: ICON_MONETARY,
      },
      {
        id: "burial-site",
        title: "Burial Site\nAssistance",
        desc: "Urgent aid for securing\nfuneral reminder.",
        accent: "purple",
        icon: ICON_BURIAL,
      },
      {
        id: "cremation",
        title: "Cremation\nAssistance",
        desc: "Urgent aid for immediate\nand essential cremation\nservices.",
        accent: "purple",
        icon: ICON_CREMATION,
      },
      {
        id: "colombarium",
        title: "Columbarium\nAllocation",
        desc: "Urgent aid for securing\nessential colombarium\nniche space.",
        accent: "purple",
        icon: ICON_COLOMBARIUM,
      },
    ],
    []
  );

  const filtered = useMemo(() => {
    if (chip === "all") return services;
    if (chip === "medical") return services.filter((s) => s.accent === "blue");
    if (chip === "financial")
      return services.filter((s) => s.accent === "yellow");
    return services.filter((s) => s.accent === "purple");
  }, [chip, services]);

  const detailsMap: Record<string, DetailsPage> = useMemo(
    () => ({
      hospital: {
        headerTitle: "Medical Assistance",
        serviceTitle: "Hospitalization Expense",
        serviceDesc:
          "Urgent medical aid for expenses during hospital confinement.",
        about:
          "The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.",
        who: ["Individuals and families with inadequate resources."],
        reminderTitle: "Reminder",
        reminderBody:
          "The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)",
        requirementsTitle: "Requirements",
        requirements: [
          {
            id: "pl",
            title: "Personal Letter",
            details:
              "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
          },
          {
            id: "voter",
            title: "Patient's Voters ID/ Certificate",
            details:
              "Patient must be legitimate registered voters of the City of Dasmariñas.",
          },
          {
            id: "endorse",
            title: "Patient's Endorsement & Indigency Certificate",
            details:
              "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
          },
          {
            id: "validid",
            title: "Patient's Valid ID",
            details:
              "Valid ID or Birth Certificate of the patient and requestor.",
          },
          { id: "abstract", title: "Medical Abstract" },
          { id: "bill", title: "Partial Hospital Bill" },
        ],
        applyLabel: "Apply Now",
      },

      treatment: {
        headerTitle: "Medical Assistance",
        serviceTitle: "Treatment & Procedures",
        serviceDesc:
          "Urgent medical aid for outpatient treatments and procedures.",
        about:
          "The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.",
        who: ["Individuals and families with inadequate resources."],
        reminderTitle: "Reminder",
        reminderBody:
          "The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)",
        requirementsTitle: "Requirements",
        requirements: [
          {
            id: "pl",
            title: "Personal Letter",
            details:
              "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
          },
          {
            id: "voter",
            title: "Patient's Voters ID/ Certificate",
            details:
              "Patient must be legitimate registered voters of the City of Dasmariñas.",
          },
          {
            id: "endorse",
            title: "Patient's Endorsement & Indigency Certificate",
            details:
              "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
          },
          {
            id: "validid",
            title: "Patient's Valid ID",
            details:
              "Valid ID or Birth Certificate of the patient and requestor.",
          },
          {
            id: "medcert",
            title: "Medical Certificate",
            details:
              "Latest medical certificate indicating diagnosis and recommended management/treatment.",
          },
          {
            id: "rx",
            title: "Doctor's Prescription",
            details:
              "Official prescription for medicines/procedures needed, signed by the attending physician.",
          },
          {
            id: "lab",
            title: "Laboratory Request",
            details:
              "Laboratory request or result relevant to the patient's case (if applicable).",
          },
        ],
        applyLabel: "Apply Now",
      },

      operations: {
        headerTitle: "Medical Assistance",
        serviceTitle: "Medical Operations",
        serviceDesc:
          "Emergency funding for dialysis, chemotherapy, and medical operations.",
        about:
          "The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.",
        who: ["Individuals and families with inadequate resources."],
        reminderTitle: "Reminder",
        reminderBody:
          "The request for medical assistance must be processed by the patient or their immediate family member who lives in the same household (e.g., spouse, child, parent, or sibling)",
        requirementsTitle: "Requirements",
        requirements: [
          {
            id: "pl",
            title: "Personal Letter",
            details:
              "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
          },
          {
            id: "voter",
            title: "Patient's Voters ID/ Certificate",
            details:
              "Patient must be legitimate registered voters of the City of Dasmariñas.",
          },
          {
            id: "endorse",
            title: "Patient's Endorsement & Indigency Certificate",
            details:
              "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
          },
          {
            id: "validid",
            title: "Patient's Valid ID",
            details:
              "Valid ID or Birth Certificate of the patient and requestor.",
          },
          {
            id: "medcert",
            title: "Medical Certificate",
            details:
              "Latest medical certificate indicating diagnosis and recommended management/treatment.",
          },
          {
            id: "rx",
            title: "Doctor's Prescription",
            details:
              "Official prescription for medicines/procedures needed, signed by the attending physician.",
          },
          {
            id: "quote",
            title: "Quotation of Expenses",
            details:
              "Itemized quotation/billing statement (dialysis/chemo/procedure) from hospital/clinic.",
          },
        ],
        applyLabel: "Apply Now",
      },

      "emergency-finance": {
        headerTitle: "Financial Assistance",
        serviceTitle: "Emergency Financial Relief",
        serviceDesc:
          "Urgent monetary aid for critical and immediate financial crises.",
        about:
          "The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.",
        who: ["Individuals and families with inadequate resources."],
        reminderTitle: "Reminder",
        reminderBody:
          "Requests must be filed by the concerned individual or an immediate family member residing in the same household, and supporting documents must be complete upon submission.",
        requirementsTitle: "Requirements",
        requirements: [
          {
            id: "pl",
            title: "Personal Letter",
            details:
              "A letter addressed to Mayor Jennifer Austria-Barzaga stating the specific assistance being requested.",
          },
          {
            id: "voter",
            title: "Applicant's Voters ID/ Certificate",
            details:
              "Applicant must be a legitimate registered voter of the City of Dasmariñas.",
          },
          {
            id: "endorse",
            title: "Endorsement & Indigency Certificate",
            details:
              "Endorsement and Certificate of Indigency issued by the Barangay Captain.",
          },
          {
            id: "validid",
            title: "Valid ID",
            details:
              "Valid ID or Birth Certificate of the applicant and requestor (if representative).",
          },
        ],
        applyLabel: "Apply Now",
      },

      "burial-money": {
        headerTitle: "Financial Assistance",
        serviceTitle: "Monetary Burial Aid",
        serviceDesc:
          "Urgent monetary aid for immediate burial service expenses.",
        about:
          "The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.",
        who: [
          "Immediate family members of the deceased with inadequate resources.",
        ],
        reminderTitle: "Reminder",
        reminderBody:
          "For burial assistance, the request must be processed by an immediate family member, and documents must be consistent with the deceased's records.",
        requirementsTitle: "",
        requirements: [],
        applyLabel: "Apply Now",
      },

      "burial-site": {
        headerTitle: "Burial Assistance",
        serviceTitle: "Burial Site Assistance",
        serviceDesc: "Urgent aid for securing funeral burial plots.",
        about:
          "The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.",
        who: ["Individuals and families with inadequate resources."],
        reminderTitle: "Reminder",
        reminderBody:
          "Requests must be filed by an immediate family member and documents must be complete upon submission.",
        requirementsTitle: "",
        requirements: [],
        applyLabel: "Apply Now",
      },

      cremation: {
        headerTitle: "Burial Assistance",
        serviceTitle: "Cremation Assistance",
        serviceDesc:
          "Urgent aid for immediate and essential cremation services.",
        about:
          "The City Social Welfare and Development Office (CSWDO) provide emergency financial assistance or referrals for free service to individuals and families who are in extremely difficult situations and have inadequate resources.",
        who: ["Immediate family members with inadequate resources."],
        reminderTitle: "Reminder",
        reminderBody:
          "Requests must be filed by an immediate family member and documents must be complete upon submission.",
        requirementsTitle: "",
        requirements: [],
        applyLabel: "Apply Now",
      },

      colombarium: {
        headerTitle: "Burial Assistance",
        serviceTitle: "Columbarium Allocation",
        serviceDesc:
          "Urgent aid for securing essential columbarium niche space.",
        about:
          "Panteon de Dasmariñas Public Cemetery\n\nProvides essential burial and cremation services for city residents. It offers a dignified public cemetery for families seeking a final resting place. This facility ensures accessible and organized options for those in need of assistance.",
        who: ["Immediate family members with inadequate resources."],
        reminderTitle: "Reminder",
        reminderBody:
          "Requests must be filed by an immediate family member and documents must be complete upon submission.",
        requirementsTitle: "",
        requirements: [],
        applyLabel: "Apply Now",
      },
    }),
    []
  );

  useEffect(() => {
    (async () => {
      // Load from cache first (instant)
      const cached = await AsyncStorage.getItem(CACHE_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.first_name) setDisplayName(parsed.first_name);
        if (typeof parsed.verified === "boolean") setVerified(parsed.verified);
        if (parsed.avatar_url) {
          setAvatarUrl(parsed.avatar_url);
          ExpoImage.prefetch(parsed.avatar_url);
        }
      }

      // Fetch fresh data from Supabase in background
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("users")
          .select("first_name, middle_name, last_name, contact_number, email, verified, avatar_url")
          .eq("id", user.id)
          .single();
        
        if (data) {
          if (data.first_name) setDisplayName(data.first_name);
          setVerified(data.verified === true);
          if (data.avatar_url) {
            setAvatarUrl(data.avatar_url);
            ExpoImage.prefetch(data.avatar_url);
          } else {
            setAvatarUrl(null);
          }
          // Update cache (preserve all fields for Verify-acc)
          await AsyncStorage.setItem(CACHE_USER, JSON.stringify(data));
        }
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (params?.verified === "1" && !successHandledOnce.current) {
        successHandledOnce.current = true;

        // Refresh verified status from database
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("users")
            .select("verified")
            .eq("id", user.id)
            .single();
          if (data?.verified) {
            setVerified(true);
            // Update cache
            const cached = await AsyncStorage.getItem(CACHE_USER);
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.verified = true;
              await AsyncStorage.setItem(CACHE_USER, JSON.stringify(parsed));
            }
          }
        }

        // Handle any pending navigation target
        const target = pendingTarget.current;
        pendingTarget.current = null;

        if (target) {
          setTimeout(() => {
            if (target.type === "route") {
              router.push(target.path as any);
            } else if (target.type === "service") {
              openDetails(target.serviceId);
            }
          }, 300);
        }
      }
    })();
  }, [params?.verified]);

  const requireVerify = (target?: GateTarget) => {
    if (target) pendingTarget.current = target;
    setShowVerifyModal(true);
  };

  const guardedNavigate = (path: string) => {
    if (!verified) return requireVerify({ type: "route", path });
    router.push(path as any);
  };

  // Check if user has an existing draft for a service type
  const checkForDraft = async (serviceId: string): Promise<string | null> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return null;

      // Determine table to check for drafts based on serviceId
      const tableMap: Record<string, string> = {
        hospital: "hospitalization_requests",
        treatment: "treatment_requests",
        operations: "medical_requests",
        "emergency-finance": "financial_requests",
        "burial-money": "monetary_requests",
        "burial-site": "burial_requests",
        cremation: "cremation_requests",
        colombarium: "columbarium_requests",
      };

      const table = tableMap[serviceId];
      if (!table) return null;

      const { data, error } = await supabase
        .from(table)
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("status", "draft")
        .limit(1);

      if (error || !data || data.length === 0) return null;
      return data[0]?.id?.toString() || null;
    } catch {
      return null;
    }
  };

  const guardedOpenService = async (serviceId: string) => {
    if (!verified) return requireVerify({ type: "service", serviceId });

    if (serviceId === "cremation") {
      const draftId = await checkForDraft(serviceId);
      if (draftId) {
        setPendingServiceId(serviceId);
        setPendingDraftId(draftId);
        setShowDraftDialog(true);
        return;
      }

      router.push({
        pathname: "/Home/Cremation/CremationDetails",
        params: { serviceId: "cremation" },
      } as any);
      return;
    }

    // Check for existing draft for hospital, treatment, operations, emergency-finance, burial-money, burial-site, or colombarium
    if (
      serviceId === "hospital" ||
      serviceId === "treatment" ||
      serviceId === "operations" ||
      serviceId === "emergency-finance" ||
      serviceId === "burial-money" ||
      serviceId === "burial-site" ||
      serviceId === "colombarium"
    ) {
      const draftId = await checkForDraft(serviceId);
      if (draftId) {
        setPendingServiceId(serviceId);
        setPendingDraftId(draftId);
        setShowDraftDialog(true);
        return;
      }
    }

    if (serviceId === "burial-site") {
      router.push({
        pathname: "/Home/Burial/BurialDetails",
        params: { serviceId: "burial-site" },
      } as any);
      return;
    }

    openDetails(serviceId);
  };

  const handleDraftDialogContinue = () => {
    // User doesn't want to make another request - just close dialog
    setShowDraftDialog(false);
    setPendingServiceId(null);
    setPendingDraftId(null);
  };

  const handleDraftDialogNew = () => {
    // User wants to make another request - open the service details
    setShowDraftDialog(false);
    if (pendingServiceId) {
      openDetails(pendingServiceId);
    }
    setPendingServiceId(null);
    setPendingDraftId(null);
  };

  const stripe = (a: Accent) =>
    a === "blue" ? GRAD.blue : a === "yellow" ? GRAD.yellow : GRAD.purple;

  const openDetails = (id: string) => {
    setOpenDetailsId(id);
    setOpenReq((prev) => ({ ...prev, [id]: prev[id] || {} }));
  };

  const toggleReq = (serviceId: string, reqId: string) => {
    setOpenReq((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        [reqId]: !(prev[serviceId]?.[reqId] || false),
      },
    }));
  };

  const current = openDetailsId ? detailsMap[openDetailsId] : null;
  const currentService = openDetailsId
    ? services.find((s) => s.id === openDetailsId)
    : null;

  const getDetailsStrokeGrad = (): [string, string] => {
    if (!currentService) return GRAD.blue;
    return stripe(currentService.accent);
  };

  const getCategory = (serviceId: string): ChipKey => {
    if (
      serviceId === "hospital" ||
      serviceId === "treatment" ||
      serviceId === "operations"
    )
      return "medical";
    if (serviceId === "emergency-finance" || serviceId === "burial-money")
      return "financial";
    return "burial";
  };

  const goRequestInfo = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    const category = getCategory(serviceId);

    router.push({
      pathname: ROUTE_REQUEST,
      params: {
        serviceId,
        serviceTitle: svc?.title ?? detailsMap[serviceId]?.serviceTitle ?? "",
        category,
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.searchPill}>
            <TextInput
              placeholder="Search"
              placeholderTextColor="#9AA6A6"
              style={styles.searchInput}
            />
          </View>
          <Pressable
            style={styles.approvedBtn}
            onPress={() => guardedNavigate(ROUTE_APPROVED)}
          >
            <Image
              source={APPROVED_ICON_PNG}
              style={styles.approvedIcon}
              resizeMode="contain"
            />
          </Pressable>
        </View>

        <View style={styles.greetRow}>
          <View style={styles.profileCircle}>
            {avatarUrl ? (
              <ExpoImage
                source={{ uri: avatarUrl }}
                style={styles.profileFullImg}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={avatarUrl}
              />
            ) : (
              <Image
                source={PROFILE_PNG}
                style={styles.profileImg}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hiText}>
              Hi, <Text style={styles.hiName}>{displayName}</Text>
            </Text>
            <Text style={styles.hiSubText}>
              {verified ? "Account verified" : "Verify your account"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={[styles.title, { paddingHorizontal: 16 }]}>Popular Services</Text>
        <Text style={[styles.subtitle, { paddingHorizontal: 16 }]}>
          Avail city benefits and services in just a few taps.
        </Text>

        <View style={[styles.chipsRow, { paddingHorizontal: 16 }]}>
          <ChipGradient
            label="All Services"
            active={chip === "all"}
            onPress={() => setChip("all")}
          />
          <ChipGradient
            label="Medical"
            active={chip === "medical"}
            onPress={() => setChip("medical")}
          />
          <ChipGradient
            label="Financial"
            active={chip === "financial"}
            onPress={() => setChip("financial")}
          />
          <ChipGradient
            label="Burial"
            active={chip === "burial"}
            onPress={() => setChip("burial")}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.gridScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {filtered.map((s) => (
              <Pressable
                key={s.id}
                style={styles.cardWrap}
                onPress={() => guardedOpenService(s.id)}
              >
                {({ pressed }) => (
                  <View style={[styles.card, pressed && styles.cardPressed]}>
                    <LinearGradient
                      colors={stripe(s.accent)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.cardTopLine}
                    />
                    <View style={styles.cardInner}>
                      <View style={styles.cardIconRow}>
                        <Image
                          source={s.icon}
                          style={styles.servicePng}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={styles.cardTitle}>{s.title}</Text>
                      <Text style={styles.cardDesc}>{s.desc}</Text>
                    </View>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <BottomNavBar 
        activeTab="home" 
        maskColor="transparent"
        onBeforeNavigate={(tabKey: TabKey) => {
          if (tabKey === "home" || tabKey === "account") return true;
          if (!verified) {
            requireVerify({ type: "route", path: "" });
            return false;
          }
          return true;
        }}
      />

      <VerifyModal
        visible={showVerifyModal}
        onClose={() => {
          pendingTarget.current = null;
          setShowVerifyModal(false);
        }}
      />

      {/* Draft Confirmation Dialog */}
      <Modal
        visible={showDraftDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDraftDialog(false)}
      >
        <View style={styles.draftOverlay}>
          <View style={styles.draftDialog}>
            <Text style={styles.draftTitle}>Existing Draft Found</Text>
            <Text style={styles.draftMessage}>
              You already have a draft for this service. Would you like to make another request?
            </Text>
            <Text style={styles.draftNote}>Your draft is in the Status tab</Text>
            <View style={styles.draftButtons}>
              <Pressable
                style={[styles.draftBtn, styles.draftBtnSecondary]}
                onPress={handleDraftDialogContinue}
              >
                <Text style={styles.draftBtnSecondaryText}>No</Text>
              </Pressable>
              <Pressable
                style={[styles.draftBtn, styles.draftBtnPrimary]}
                onPress={handleDraftDialogNew}
              >
                <Text style={styles.draftBtnPrimaryText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!openDetailsId}
        animationType="slide"
        onRequestClose={() => setOpenDetailsId(null)}
      >
        <SafeAreaView style={styles.detailsSafe}>
          <View style={styles.detailsTopBar}>
            <Pressable
              onPress={() => setOpenDetailsId(null)}
              style={({ pressed }) => [
                styles.detailsBackBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
            </Pressable>
            <Text style={styles.detailsTopTitle}>
              {current?.headerTitle || ""}
            </Text>
            <View style={styles.detailsTopRightSpacer} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.detailsContent}
          >
            <View style={styles.detailsCardShadow}>
              <View style={styles.detailsCard}>
                <LinearGradient
                  colors={getDetailsStrokeGrad()}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.detailsCardTopStroke}
                />
                <View style={styles.detailsServiceRow}>
                  <View style={styles.detailsIconWrap}>
                    {currentService ? (
                      <Image
                        source={currentService.icon}
                        style={styles.detailsPng}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={styles.detailsIconFallback} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailsServiceTitle}>
                      {current?.serviceTitle || ""}
                    </Text>
                    <Text style={styles.detailsServiceDesc}>
                      {current?.serviceDesc || ""}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={styles.detailsSectionTitle}>About Service</Text>
            <Text style={styles.detailsBodyText}>{current?.about || ""}</Text>

            <Text style={[styles.detailsSectionTitle, { marginTop: 14 }]}>
              Who may Avail
            </Text>
            <View style={styles.detailsBullets}>
              {(current?.who || []).map((w, idx) => (
                <View key={idx} style={styles.detailsBulletRow}>
                  <View style={styles.detailsBulletDot} />
                  <Text style={styles.detailsBulletText}>{w}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.detailsReminderTitle}>
              {current?.reminderTitle || "Reminder"}
            </Text>
            <View style={styles.detailsReminderBox}>
              <Text style={styles.detailsReminderText}>
                {current?.reminderBody || ""}
              </Text>
            </View>

            {/* content spacer -- Apply button moved to footer */}
            <View style={{ height: 22 }} />
          </ScrollView>
          {/* Fixed footer with Apply button */}
          <View style={{ padding: 16, backgroundColor: "#FFFFFF" }}>
            <Pressable
              style={({ pressed }) => [
                styles.applyBtn,
                pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
              ]}
              onPress={() => {
                if (!openDetailsId) return;
                setOpenDetailsId(null);
                goRequestInfo(openDetailsId);
              }}
            >
              <Text style={styles.applyBtnText}>{current?.applyLabel || "Apply Now"}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ChipGradient({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.chipShadow}>
      {({ pressed }) =>
        active ? (
          <LinearGradient
            colors={GRAD.chip}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.chipBase,
              styles.chipBaseActive,
              pressed && { opacity: 0.92 },
            ]}
          >
            <Text style={[styles.chipText, { color: "#FFFFFF" }]}>{label}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.chipBase, { backgroundColor: "#FFFFFF" }]}>
            <Text style={[styles.chipText, { color: "#5D6B6B" }]}>{label}</Text>
          </View>
        )
      }
    </Pressable>
  );
}

const CARD_GAP = 10;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: TEAL },
  header: {
    backgroundColor: TEAL,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 10 : 0,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  searchPill: {
    flex: 1,
    height: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 16,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchInput: {
    fontSize: 14,
    color: "#2F3B3B",
    paddingVertical: 0,
    fontFamily: FONT,
    fontWeight: "600",
  },
  approvedBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  approvedIcon: {
    width: 28,
    height: 28,
  },
  greetRow: {
    paddingVertical: 12.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  profileImg: { width: 36, height: 36 },
  profileFullImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  hiText: {
    color: "#EAFBFB",
    fontSize: 16,
    fontFamily: FONT,
    fontWeight: "600",
  },
  hiName: { fontFamily: FONT, fontWeight: "700" },
  hiSubText: {
    marginTop: 2,
    color: "#D4F3F2",
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: "600",
  },
  panel: {
    flex: 1,
    backgroundColor: PANEL_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingTop: 15,
  },
  gridScrollContent: { paddingBottom: NAV_TOTAL_HEIGHT + 26, paddingHorizontal: 16 },
  title: {
    fontSize: 22,
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: "600",
    color: TEXT_MUTED,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 10,
    justifyContent: "space-between",
  },

  chipShadow: {
    flex: 1,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  
  chipBase: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chipBaseActive: {
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  chipText: { fontSize: 12, fontFamily: FONT, fontWeight: "700", textAlign: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -CARD_GAP / 2,
  },
  cardWrap: {
    width: "50%",
    paddingHorizontal: CARD_GAP / 2,
    marginBottom: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.96 },
  cardTopLine: { height: 4, width: "100%" },
  cardInner: { padding: 14, minHeight: 166 },
  cardIconRow: { height: 38, justifyContent: "center", marginBottom: 12 },
  servicePng: { width: 34, height: 34 },
  cardTitle: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
    marginTop: 2,
  },
  cardDesc: {
    marginTop: 8,
    fontSize: 11,
    fontFamily: FONT,
    fontWeight: "600",
    color: TEXT_MUTED,
    lineHeight: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  verifyCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
  },
  warningImg: { width: 70, height: 70, marginBottom: 10 },
  verifyTitle: {
    fontSize: 20,
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  verifySub: {marginTop: 6,
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: "600",
    color: TEXT_MUTED,
    textAlign: "center",
  },
  verifyBtn: {
    marginTop: 16,
    width: "100%",
    height: 48,
    borderRadius: 24,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyBtnText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
  },
  cancelBtnModal: {
    marginTop: 10,
    width: "100%",
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDEDED",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: TEXT_DARK,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
  },
  detailsSafe: { flex: 1, backgroundColor: "#FFFFFF" },
  detailsTopBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EDED",
    backgroundColor: "#FFFFFF",
  },
  detailsBackBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  detailsTopTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
    fontSize: 16,
  },
  detailsTopRightSpacer: { width: 44, height: 44 },
  detailsContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 18 },
  detailsCardShadow: {
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginBottom: 12,
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E7EEEE",
  },
  detailsCardTopStroke: { height: 4 },
  detailsServiceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  detailsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F2FBFD",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D8F3F8",
  },
  detailsPng: { width: 28, height: 28 },
  detailsIconFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EEF2F2",
  },
  detailsServiceTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
    fontSize: 13,
    lineHeight: 16,
  },
  detailsServiceDesc: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "600",
    color: "#6B7A7A",
    fontSize: 10.5,
    lineHeight: 13,
  },
  detailsSectionTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
    fontSize: 12.5,
    marginTop: 6,
  },
  detailsBodyText: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "600",
    color: "#6B7A7A",
    fontSize: 10.5,
    lineHeight: 15,
  },
  detailsBullets: { marginTop: 6 },
  detailsBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 6,
  },
  detailsBulletDot: {
    marginTop: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#6B7A7A",
  },
  detailsBulletText: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "600",
    color: "#6B7A7A",
    fontSize: 10.5,
    lineHeight: 15,
  },
  detailsReminderTitle: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "600",
    color: "#E45454",
    fontSize: 24,
    letterSpacing: 0.2,
  },
  detailsReminderBox: {
    marginTop: 8,
    backgroundColor: "#FBE1E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailsReminderText: {
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    color: "#D94B4B",
    fontSize: 10.5,
    lineHeight: 14.5,
  },
  reqWrapShadow: {
    marginTop: 12,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  reqWrap: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EEEE",
  },
  reqHeader: {
    backgroundColor: "#7CCB5B",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  reqHeaderText: {
    fontFamily: FONT,
    fontWeight: "800",
    color: "#FFFFFF",
    fontSize: 16,
  },
  reqBody: { paddingVertical: 6 },
  reqRowWrap: { backgroundColor: "#FFFFFF" },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reqLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  reqTitle: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "700",
    color: "#2E3A3A",
    fontSize: 11,
  },
  reqDetails: { paddingHorizontal: 42, paddingBottom: 12, marginTop: -4 },
  reqDetailsText: {
    fontFamily: FONT,
    fontWeight: "400",
    color: "#6B7A7A",
    fontSize: 14,
    lineHeight: 18,
  },
  reqDivider: {
    height: 1,
    backgroundColor: "#E9EEEE",
    marginLeft: 14,
    marginRight: 14,
  },
  applyBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 26,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  applyBtnText: {
    fontFamily: FONT,
    fontWeight: "800",
    color: "#FFFFFF",
    fontSize: 14,
  },

  // Draft dialog styles
  draftOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  draftDialog: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  draftTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 18,
    color: TEXT_DARK,
    textAlign: "center",
    marginBottom: 12,
  },
  draftMessage: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  draftNote: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: TEAL,
    textAlign: "center",
    marginBottom: 20,
  },
  draftButtons: {
    flexDirection: "row",
    gap: 12,
  },
  draftBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  draftBtnPrimary: {
    backgroundColor: TEAL,
  },
  draftBtnPrimaryText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: "#FFFFFF",
  },
  draftBtnSecondary: {
    backgroundColor: "#F0F0F0",
  },
  draftBtnSecondaryText: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
});
