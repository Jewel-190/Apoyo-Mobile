// app/Home/RequestInfo.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase";
import {
  Animated,
  Easing,
  Image,
  Keyboard,
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
  ActivityIndicator,
} from "react-native";

const FONT = "SF Pro Rounded";
const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const DANGER = "#E45454";

const FIELD_BG = "#EAFBFB";
const FIELD_BORDER = "#0B8F8B";

const DASMA_LOGO = require("../../assets/images/Dasma.png");

type FormState = {
  name: string;
  countryCode: string;
  phone: string;
  email: string;
  address: string;
};

type Category = "medical" | "financial" | "burial" | "all" | string;

function getHeaderTitle(serviceId: string, category?: Category) {
  const cat = (category || "").toLowerCase();
  if (cat === "medical") return "Medical Assistance";
  if (cat === "financial") return "Financial Assistance";
  if (cat === "burial") return "Burial Assistance";

  const id = (serviceId || "").toLowerCase();
  const medical = new Set(["hospital", "treatment", "operations"]);
  const financial = new Set(["emergency-finance", "burial-money"]);
  const burial = new Set(["burial-site", "cremation", "colombarium"]);

  if (medical.has(id)) return "Medical Assistance";
  if (financial.has(id)) return "Financial Assistance";
  if (burial.has(id)) return "Burial Assistance";
  return "Assistance";
}

function getReqRoute(serviceId: string) {
  const id = (serviceId || "").toLowerCase();

  const routeMap: Record<string, string> = {
    // ================= MEDICAL =================
    hospital: "/Home/Hospitalization/HospitalizationReq",
    treatment: "/Home/Treatment/TreatmentReq",
    operations: "/Home/Medical/MedicalReq",

    // ================= FINANCIAL =================
    "emergency-finance": "/Home/Financial/FinancialReq",
    "burial-money": "/Home/Monetary/MonetaryReq",

    // ================= BURIAL =================
    "burial-site": "/Home/Burial/BurialReq",
    cremation: "/Home/Cremation/CremationReq",
    colombarium: "/Home/Columbarium/ColumbariumReq",
  };

  return routeMap[id] || "/Home/Hospitalization/HospitalizationReq";
}

function getRequestTable(serviceId: string) {
  const id = (serviceId || "").toLowerCase();
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
  return tableMap[id] || "";
}

function onlyDigits(s: string) {
  return (s || "").replace(/[^\d]/g, "");
}

function formatPHPhone(digits: string) {
  const d = onlyDigits(digits).slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `${a} ${b}`;
  return `${a} ${b} ${c}`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

function normalizeSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function isValidFullName(name: string) {
  const n = normalizeSpaces(name);
  const parts = n.split(" ").filter(Boolean);
  if (parts.length < 2) return false;
  if (!/^[A-Za-z.\-'\s]+$/.test(n)) return false;
  if (parts.some((p) => p.replace(/[^A-Za-z]/g, "").length < 2)) return false;
  return true;
}

function isValidPHMobile10(digits10: string) {
  const d = onlyDigits(digits10);
  return d.length === 10 && d.startsWith("9");
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

export default function RequestInfo() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    serviceId?: string;
    serviceTitle?: string;
    category?: string;
    coverage?: string;
    funeralAid?: string;
  }>();

  const serviceId = (params?.serviceId || "unknown").toString();
  const serviceTitle = (params?.serviceTitle || "").toString();
  const category = (params?.category || "").toString();
  const coverage = (params?.coverage || params?.funeralAid || "").toString();

  const topTitle = useMemo(
    () => getHeaderTitle(serviceId, category),
    [serviceId, category]
  );

  const [form, setForm] = useState<FormState>({
    name: "",
    countryCode: "+63",
    phone: "",
    email: "",
    address: "",
  });

  // If true, requester fields are populated from verified `users` profile and locked
  const [profileLocked, setProfileLocked] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string>("");

  const [touched, setTouched] = useState({
    name: false,
    phone: false,
    email: false,
    address: false,
  });

  const [showAgreement, setShowAgreement] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const nameOk = isValidFullName(form.name);
  const phoneOk = isValidPHMobile10(form.phone);
  const emailOk = isValidEmail(form.email);
  const addressOk = normalizeSpaces(form.address).length >= 10;

  const canNext = useMemo(
    () => nameOk && phoneOk && emailOk && addressOk,
    [nameOk, phoneOk, emailOk, addressOk]
  );

  const showNameErr = touched.name && !nameOk;
  const showPhoneErr = touched.phone && !phoneOk;
  const showEmailErr = touched.email && !emailOk;
  const showAddressErr = touched.address && !addressOk;

  const openAgreement = () => {
    Keyboard.dismiss();
    setTouched({ name: true, phone: true, email: true, address: true });
    if (!canNext) return;
    setAgreed(false);
    setShowAgreement(true);
  };

  // On mount, try to load users profile and lock requester fields
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        console.log("RequestInfo: supabase.auth.getUser() ->", user);
        if (!user) return;
        setAuthUserId(user.id);

        const requestTable = getRequestTable(serviceId);
        let profile: any = null;

        if (requestTable) {
          const { data: joinedRequest, error: joinedError } = await supabase
            .from(requestTable)
            .select(
              "user_id, users(first_name,middle_name,last_name,suffix,contact_number,email,address)"
            )
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          console.log("RequestInfo: request-user join query ->", {
            requestTable,
            joinedRequest,
            joinedError,
          });

          const joinedUser = (joinedRequest as any)?.users;
          if (!joinedError && joinedUser) {
            profile = Array.isArray(joinedUser) ? joinedUser[0] : joinedUser;
          }
        }

        if (!profile) {
          const { data: directProfile, error } = await supabase
            .from("users")
            .select(
              "first_name,middle_name,last_name,suffix,contact_number,email,address"
            )
            .eq("id", user.id)
            .single();

          console.log("RequestInfo: direct profile query ->", {
            directProfile,
            error,
          });

          if (error || !directProfile) {
            setProfileLoadError(error?.message || "No profile returned");
            return;
          }

          profile = directProfile;
        }

        // Build display name
        const parts = [profile.first_name, profile.middle_name, profile.last_name].filter(
          Boolean
        );
        const name = `${parts.join(" ")}${profile.suffix ? " " + profile.suffix : ""}`.trim();

        // Parse contact number: extract digits, use last 10 as local phone, prefix as country code
        const digits = (profile.contact_number || "")
          .replace(/[^0-9]/g, "")
          .slice(-13); // keep reasonable length
        const localPhone = digits.slice(-10);
        const countryPrefix = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : "+63";

        if (!mounted) return;
        setForm((p) => ({
          ...p,
          name: name || p.name,
          countryCode: countryPrefix || p.countryCode,
          phone: localPhone || p.phone,
          email: profile.email || p.email,
          address: profile.address || p.address,
        }));
        setProfileLocked(true);
      } catch (e) {
        console.log("Failed to load profile:", e);
        if (mounted) setProfileLoadError(String(e));
      } finally {
        if (mounted) setIsProfileLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [serviceId]);

  const proceed = async () => {
    if (!agreed) return;

    const payload = {
      user_id: authUserId || null,
      serviceId,
      serviceTitle,
      category,
      coverage,
    };

    await AsyncStorage.setItem(
      `apoyo_requestinfo_${serviceId}`,
      JSON.stringify(payload)
    );

    setShowAgreement(false);

    const nextRoute = getReqRoute(serviceId);

    if (!nextRoute) return;

    router.push({
      pathname: nextRoute as any,
      params: { serviceId, serviceTitle, category, coverage },
    } as any);
  };

  const nextAnim = usePressScale();
  const modalNextAnim = usePressScale();

  const commonInputProps = {
    returnKeyType: "default" as const,
    blurOnSubmit: true,
    onSubmitEditing: () => Keyboard.dismiss(),
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.65 },
          ]}
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
        </Pressable>

        <Text style={styles.topTitle}>{topTitle}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoRow}>
            <Image
              source={DASMA_LOGO}
              style={styles.logoImg}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.header}>Requester Information</Text>

          

          <Text style={styles.label}>Name of requesting party</Text>
          <TextInput
                    value={form.name}
                    onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
                    style={[styles.input, showNameErr && styles.inputErr, profileLocked && { opacity: 0.8 }]}
                    editable={false}
            placeholder="Juan Dela Cruz"
            placeholderTextColor="#9AA6A6"
            selectTextOnFocus={false}
            onBlur={() => setTouched((p) => ({ ...p, name: true }))}
            {...commonInputProps}
          />
          {showNameErr && (
            <Text style={styles.errText}>
              Enter your full name (first + last). Letters only.
            </Text>
          )}

          <Text style={styles.label}>Contact Number</Text>
          <View style={styles.phoneRow}>
            <TextInput
              value={form.countryCode}
              onChangeText={(t) => setForm((p) => ({ ...p, countryCode: t }))}
              style={[styles.input, styles.ccInput, profileLocked && { opacity: 0.8 }]}
              editable={false}
              placeholder="+63"
              placeholderTextColor="#9AA6A6"
              selectTextOnFocus={false}
              {...commonInputProps}
            />

            <TextInput
              value={formatPHPhone(form.phone)}
              onChangeText={(t) =>
                setForm((p) => ({ ...p, phone: onlyDigits(t) }))
              }
              style={[
                styles.input,
                styles.phoneInput,
                showPhoneErr && styles.inputErr,
                profileLocked && { opacity: 0.8 },
              ]}
              editable={false}
              selectTextOnFocus={false}
              keyboardType="number-pad"
              placeholder="912 321 8853"
              placeholderTextColor="#9AA6A6"
              onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
              maxLength={12}
              {...commonInputProps}
            />
          </View>
          {showPhoneErr && (
            <Text style={styles.errText}>
              Enter a valid PH mobile: 10 digits starting with 9 (e.g.
              912xxxxxxx).
            </Text>
          )}

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            value={form.email}
            onChangeText={(t) => setForm((p) => ({ ...p, email: t }))}
            style={[styles.input, showEmailErr && styles.inputErr, profileLocked && { opacity: 0.8 }]}
            editable={false}
            selectTextOnFocus={false}
            keyboardType="email-address"
            placeholder="juandelacruz@gmail.com"
            placeholderTextColor="#9AA6A6"
            autoCapitalize="none"
            onBlur={() => setTouched((p) => ({ ...p, email: true }))}
            {...commonInputProps}
          />
          {showEmailErr && (
            <Text style={styles.errText}>
              Please enter a valid email address.
            </Text>
          )}

          <Text style={styles.label}>
            Present Address <Text style={{ color: DANGER }}>*</Text>
          </Text>
          <TextInput
            value={form.address}
            onChangeText={(t) => setForm((p) => ({ ...p, address: t }))}
            style={[styles.input, showAddressErr && styles.inputErr, profileLocked && { opacity: 0.8 }]}
            editable={false}
            selectTextOnFocus={false}
            placeholder="e.g. Brgy. Burol-2, Dasmariñas, Philippines"
            placeholderTextColor="#9AA6A6"
            onBlur={() => setTouched((p) => ({ ...p, address: true }))}
            {...commonInputProps}
          />
          {isProfileLoading && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <ActivityIndicator size="small" color={TEAL} style={{ marginRight: 8 }} />
              <Text style={styles.loaderText}>Loading user info</Text>
            </View>
          )}
          {!isProfileLoading && profileLoadError && (
            <Text style={{ marginTop: 6, color: DANGER, fontSize: 12 }}>{profileLoadError}</Text>
          )}
          {showAddressErr && (
            <Text style={styles.errText}>
              Please provide a complete address (at least 10 characters).
            </Text>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={openAgreement}
            disabled={!canNext}
            onPressIn={canNext ? nextAnim.pressIn : undefined}
            onPressOut={canNext ? nextAnim.pressOut : undefined}
            style={({ pressed }) => [
              { opacity: !canNext ? 0.45 : 1 },
              pressed && canNext && { opacity: 0.98 },
            ]}
          >
            <Animated.View
              style={[
                styles.nextBtnBottom,
                { transform: [{ scale: nextAnim.scale }] },
              ]}
            >
              <Text style={styles.nextBtnText}>Next</Text>
            </Animated.View>
          </Pressable>
        </View>

        <Modal transparent visible={showAgreement} animationType="fade">
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowAgreement(false)}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.modalTopRow}>
                <Text style={styles.modalTitle}>
                  Acknowledgment And Agreement
                </Text>
                <Pressable
                  onPress={() => setShowAgreement(false)}
                  style={({ pressed }) => [
                    styles.closeBtn,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </Pressable>
              </View>

              <Text style={styles.modalBody}>
                I Hereby Acknowledge That I Have Read And Understood The
                Coverage Details Regarding Assistance For Expenses. Furthermore,
                I Recognize That The Processing Of This Assistance Is Subject To
                The Submission Of Specific Required Documents.
                {"\n\n"}I Affirm That All Records Provided Will Be Original,
                Authentic, And Untampered, And I Understand That Any Evidence Of
                Alteration Or Falsification May Result In The Immediate Denial
                Of My Claim.
              </Text>

              <Pressable
                onPress={() => setAgreed((v) => !v)}
                style={({ pressed }) => [
                  styles.checkboxRow,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View
                  style={[styles.checkbox, agreed && styles.checkboxChecked]}
                >
                  {agreed ? (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  ) : null}
                </View>
                <Text style={styles.checkboxText}>
                  I confirm that the information provided is accurate and agree
                  to the processing of my data to complete this request.
                </Text>
              </Pressable>

              <Pressable
                onPress={proceed}
                disabled={!agreed}
                onPressIn={agreed ? modalNextAnim.pressIn : undefined}
                onPressOut={agreed ? modalNextAnim.pressOut : undefined}
                style={({ pressed }) => [
                  { opacity: !agreed ? 0.45 : 1 },
                  pressed && agreed && { opacity: 0.98 },
                ]}
              >
                <Animated.View
                  style={[
                    styles.modalNextBtn,
                    { transform: [{ scale: modalNextAnim.scale }] },
                  ]}
                >
                  <Text style={styles.modalNextText}>Next</Text>
                </Animated.View>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },

  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EDED",
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
    fontSize: 16,
  },

  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },

  logoRow: { alignItems: "center", marginTop: 6, marginBottom: 6 },
  logoImg: { width: 170, height: 60 },

  header: {
    marginTop: 8,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 18,
    color: TEXT_DARK,
  },

  label: {
    marginTop: 12,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12,
    color: TEXT_DARK,
  },

  input: {
    marginTop: 6,
    height: 44,
    borderRadius: 10,
    backgroundColor: FIELD_BG,
    borderWidth: 1.2,
    borderColor: FIELD_BORDER,
    paddingHorizontal: 12,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: TEXT_DARK,
  },
  inputErr: { borderColor: DANGER, backgroundColor: "#FFF1F1" },
  errText: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 11.5,
    color: DANGER,
  },

  phoneRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  ccInput: { width: 72, textAlign: "center" },
  phoneInput: { flex: 1 },

  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 14 : 12,
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
  },
  nextBtnBottom: {
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
  nextBtnText: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 14,
    color: "#FFFFFF",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
    paddingRight: 10,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DANGER,
  },
  modalBody: {
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12.5,
    color: "#2E3A3A",
    lineHeight: 18,
  },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: TEAL,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: TEAL },
  checkboxText: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 12.5,
    color: "#2E3A3A",
    lineHeight: 18,
  },

  modalNextBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  modalNextText: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 14,
    color: "#FFFFFF",
  },
  loaderText: {
    fontFamily: FONT,
    fontSize: 12,
    color: "#9AA6A6",
  },
});
