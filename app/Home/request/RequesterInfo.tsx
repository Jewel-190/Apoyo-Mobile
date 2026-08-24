// app/Home/request/RequesterInfo.tsx — autofill + agreement before the document form.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getCatalogLookupRuntime,
  resolveServiceId,
} from "@/AppCore/CatalogLookupRuntime";
import {
  preflightSelectionsFromRouteParams,
  preflightSelectionsToRouteParams,
} from "@/AppCore/PreflightSelections";
import { supabase } from "@/AppCore/SupabaseClient";
import { getService } from "@/AppCore/AssistanceServiceDefinitions";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import {
  defaultServiceFormPath,
  requestFormPath,
} from "@/AppCore/RequestPipelineRoutes";
import type { Category as AssistanceCategory } from "@/AppCore/AppUiDomainTypes";
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
const DISABLED_BG = "#DDEEEE";
const DISABLED_TEXT = "#B8CACA";

const FIELD_BG = "#EAFBFB";
const FIELD_BORDER = "#0B8F8B";

const DASMA_CITY_LOGO = require("../../../assets/images/Dasmariñas Logo.png");
const DASMA_BANNER = require("../../../assets/images/Dasmariñas Banner.png");

type FormState = {
  name: string;
  countryCode: string;
  phone: string;
  email: string;
  address: string;
};

type RouteCategory = AssistanceCategory | "all" | string;

function getHeaderTitle(serviceId: string, category?: RouteCategory) {
  const rt = getCatalogLookupRuntime();
  const sid = resolveServiceId(serviceId);
  if (sid && rt?.byServiceId[sid]) {
    return rt.byServiceId[sid].categoryHeadline;
  }
  const slug = (category || "").toLowerCase();
  return rt?.categoryHeadlineBySlug[slug] ?? "Assistance";
}

function getReqRoute(serviceId: string) {
  const sid = resolveServiceId(serviceId);
  return sid
    ? requestFormPath(sid)
    : getService(serviceId)?.requestRoute ?? defaultServiceFormPath();
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

export default function RequesterInfo() {
  const { bundle, loading: catalogLoading } = useAssistanceCatalog();
  const router = useRouter();

  const params = useLocalSearchParams();

  const serviceId = (params?.serviceId || "unknown").toString();
  const serviceTitle = (params?.serviceTitle || "").toString();
  const category = (params?.category || "").toString();

  const preflightRouteParams = useMemo(
    () =>
      preflightSelectionsToRouteParams(
        preflightSelectionsFromRouteParams(
          params as Record<string, string | string[] | undefined>
        )
      ),
    [params]
  );

  const topTitle = useMemo(
    () => getHeaderTitle(serviceId, category),
    [serviceId, category]
  );

  const catalogCopy = useMemo(() => {
    const sid = resolveServiceId((serviceId || "").trim());
    if (!sid) {
      return { displayName: null as string | null, loading: catalogLoading };
    }
    const detail = bundle?.detailsByServiceId[sid];
    const svc = bundle?.services.find((s) => s.id === sid);
    return {
      displayName: detail?.serviceTitle ?? svc?.title ?? null,
      loading: catalogLoading && !bundle,
    };
  }, [bundle, catalogLoading, serviceId]);
  const serviceHeadline = useMemo(() => {
    const fromParams = serviceTitle.trim();
    if (catalogCopy.loading) return fromParams || null;
    const fromDb = catalogCopy.displayName?.trim();
    return fromDb || fromParams || null;
  }, [
    catalogCopy.loading,
    catalogCopy.displayName,
    serviceTitle,
  ]);

  const [form, setForm] = useState<FormState>({
    name: "",
    countryCode: "+63",
    phone: "",
    email: "",
    address: "",
  });

  // If true, requester fields are populated from the signed-in `users` profile and locked
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
        console.log("RequesterInfo: supabase.auth.getUser() ->", user);
        if (!user) return;
        setAuthUserId(user.id);

        const sid = resolveServiceId(serviceId) ?? serviceId;
        let profile: any = null;

        if (sid) {
          const { data: joinedRows, error: joinedError } = await supabase
            .from("assistance_requests")
            .select(
              "user_id, users(first_name,middle_name,last_name,suffix,contact_number,email,address)"
            )
            .eq("user_id", user.id)
            .eq("service_id", sid)
            .order("updated_at", { ascending: false })
            .limit(1);

          const joinedRequest = Array.isArray(joinedRows) ? joinedRows[0] : null;

          console.log("RequesterInfo: request-user join query ->", {
            requestTable: "assistance_requests",
            joinedRequest,
            joinedError,
          });

          const joinedUser = (joinedRequest as any)?.users;
          if (!joinedError && joinedUser) {
            profile = Array.isArray(joinedUser) ? joinedUser[0] : joinedUser;
          }
        }

        if (!profile) {
          const { data: directRows, error } = await supabase
            .from("users")
            .select(
              "first_name,middle_name,last_name,suffix,contact_number,email,address"
            )
            .eq("id", user.id)
            .limit(1);

          const directProfile = Array.isArray(directRows) ? directRows[0] : null;

          console.log("RequesterInfo: direct profile query ->", {
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

    await AsyncStorage.setItem(
      `apoyo_requestinfo_${serviceId}`,
      JSON.stringify({
        user_id: authUserId || null,
        serviceId,
        serviceTitle,
        category,
        ...preflightRouteParams,
      })
    );

    setShowAgreement(false);

    const nextRoute = getReqRoute(serviceId);

    if (!nextRoute) return;

    router.push({
      pathname: nextRoute as any,
      params: {
        serviceId,
        serviceTitle,
        category,
        ...preflightRouteParams,
        ...(params.forceNewDraft === "1" ||
        String(params.forceNewDraft).toLowerCase() === "true"
          ? { forceNewDraft: "1" }
          : {}),
      },
    } as any);
  };

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
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoRow}>
            <Image
              source={DASMA_CITY_LOGO}
              style={styles.cityLogoImg}
              resizeMode="contain"
            />
            <Image
              source={DASMA_BANNER}
              style={styles.logoImg}
              resizeMode="contain"
            />
          </View>

          {!!serviceHeadline && (
            <Text style={styles.serviceHeadline}>{serviceHeadline}</Text>
          )}

          <Text style={styles.header}>Requester Information</Text>

          

          <Text style={styles.label}>Name of requesting party</Text>
          <TextInput
                    value={form.name}
                    onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
                    style={[styles.input, showNameErr && styles.inputErr, profileLocked && { opacity: 0.8 }]}
                    editable={false}
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
            <Text style={{ marginTop: 6, color: DANGER, fontSize: 14 }}>{profileLoadError}</Text>
          )}
          {showAddressErr && (
            <Text style={styles.errText}>
              Please provide a complete address (at least 10 characters).
            </Text>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.bottomBar}>
        <Pressable
          onPress={openAgreement}
          disabled={!canNext}
          style={({ pressed }) => [
            styles.applyBtn,
            !canNext && styles.applyBtnDisabled,
            pressed && canNext && { opacity: 0.92 },
          ]}
        >
          <Text style={[styles.applyBtnText, !canNext && styles.applyBtnTextDisabled]}>Next</Text>
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

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 6,
    gap: 8,
  },
  cityLogoImg: { width: 56, height: 56 },
  logoImg: { width: 172, height: 52 },

  serviceHeadline: {
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 17.5,
    color: "#075E5B",
    marginTop: 10,
    paddingHorizontal: 10,
    letterSpacing: 0.2,
  },

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
    fontSize: 14,
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
    fontSize: 14,
    color: TEXT_DARK,
  },
  inputErr: { borderColor: DANGER, backgroundColor: "#FFF1F1" },
  errText: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: DANGER,
  },

  phoneRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  ccInput: { width: 72, textAlign: "center" },
  phoneInput: { flex: 1 },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
    backgroundColor: "#FFFFFF",
  },
  applyBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: TEAL,
    borderWidth: 1,
    borderColor: "#0A7F7C",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  applyBtnDisabled: {
    backgroundColor: DISABLED_BG,
    borderColor: "#C9DEDD",
    shadowOpacity: 0,
    elevation: 0,
  },
  applyBtnText: {
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: "#FFFFFF",
  },
  applyBtnTextDisabled: { color: DISABLED_TEXT },

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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
    color: "#9AA6A6",
  },
});
