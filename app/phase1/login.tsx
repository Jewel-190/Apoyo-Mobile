import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "@/AppCore/SupabaseClient";
import { ROUTES } from "@/AppCore/AppRoutePaths";
import { legalPageRoute } from "@/AppCore/LegalSettings";

const { width: SCREEN_W } = Dimensions.get("window");
const SCREEN = Dimensions.get("screen");

const TEAL = "#008E8A";
const BORDER = "#CFCFCF";
const SUB = "#8B8B8B";
const DARK = "#2B2B2B";
const RED = "#E23B3B";

const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;

export default function Login() {
  const params = useLocalSearchParams<{ email?: string }>();
  // step: 0=email/mobile entry, 1=enter PIN
  const [step, setStep] = useState(0);
  const [useMobile, setUseMobile] = useState(true);
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  
  const pinInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    const fromParam = String(params.email ?? "").trim();
    if (!fromParam) return;
    setEmail(fromParam);
    setUseMobile(false);
    setStep(1);
    setPin("");
    setLoginError("");
  }, [params.email]);

  useEffect(() => {
    if (Platform.OS !== "android" || step !== 1) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep(0);
      setPin("");
      setLoginError("");
      return true;
    });
    return () => sub.remove();
  }, [step]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (__DEV__) {
        console.log("[auth]", event, session?.user?.id ?? "no-session");
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const mobileError = useMemo(() => {
    const t = mobile.trim();
    if (!t) return "";
    if (!/^\d+$/.test(t)) return "Numbers only";
    if (t.length !== 10) return "Enter 10 digits (e.g. 9XXXXXXXXX)";
    if (!t.startsWith("9")) return "Must start with 9";
    return "";
  }, [mobile]);

  const emailError = useMemo(() => {
    const t = email.trim();
    if (!t) return "";
    if (!t.includes("@")) return "Email must contain @";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t))
      return "Enter a valid email";
    return "";
  }, [email]);

  const canProceed = useMemo(() => {
    if (useMobile) return mobile.trim().length > 0 && !mobileError;
    return email.trim().length > 0 && !emailError;
  }, [useMobile, mobile, email, mobileError, emailError]);

  const canLogin = useMemo(() => pin.length === 6, [pin]);

  const onToggle = () => {
    setUseMobile((v) => !v);
    setLoginError("");
  };

  const onNext = () => {
    if (!canProceed) return;
    if (useMobile) {
      setLoginError("Mobile login not yet implemented. Please use email.");
      return;
    }
    setLoginError("");
    setStep(1);
  };

  const onLogin = async () => {
    if (!canLogin || isLogging) return;
    setIsLogging(true);
    setLoginError("");

    try {
      // Use Supabase Auth to sign in with email + PIN
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pin, // PIN is used as password
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setLoginError("Invalid email or PIN. Please try again.");
        } else if (error.message.includes("Email not confirmed")) {
          setLoginError("Please verify your email before logging in.");
        } else {
          setLoginError(error.message);
        }
        setPin("");
        setIsLogging(false);
        return;
      }

      // Login successful - session is automatically managed by Supabase
      if (__DEV__) {
        console.log("Login successful, user:", data.user?.id);
      }

      // Cache user data for instant loading on Home/Account screens
      if (data.user?.id) {
        const { data: userData } = await supabase
          .from("users")
          .select(
            "first_name, middle_name, last_name, suffix, sex, birth_date, email, contact_number, address, barangay, voter_id_number, avatar_url, created_at, registered_voter_id"
          )
          .eq("id", data.user.id)
          .single();
        
        if (userData) {
          await AsyncStorage.setItem("apoyo_user_cache", JSON.stringify(userData));
        }
      }

      setIsLogging(false);
      router.replace("/Home/Home");
    } catch (err) {
      setLoginError("Login failed. Please try again.");
      setIsLogging(false);
    }
  };

  // Layout helpers for PIN boxes
  const H_PADDING = 22;
  const SPACING = 10;
  const available = SCREEN_W - H_PADDING * 2 - SPACING * 5;
  const boxSize = Math.max(44, Math.min(56, Math.floor(available / 6)));
  const dotSize = Math.max(20, Math.min(28, Math.floor(boxSize * 0.55)));

  return (
    <View style={styles.root}>
      <Image
        source={require("../../assets/images/City Hall.png")}
        style={styles.backdrop}
        resizeMode="cover"
      />
      <View style={styles.backdropScrim} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <View style={styles.container}>
          {/* --- Step 0: Email Entry --- */}
          {step === 0 && (
            <>
              <View style={styles.headerBrandRow}>
                <Image
                  source={require("../../assets/images/Dasmariñas Logo.png")}
                  style={styles.headerCityLogo}
                  resizeMode="contain"
                />
                <Image
                  source={require("../../assets/images/Dasmariñas Banner.png")}
                  style={styles.headerSeal}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.brand}>
                <Image
                  source={require("../../assets/images/apoyo2.png")}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.loginBottomBlock}>
                <Text style={styles.title}>Hello, Welcome!</Text>
                <Text style={styles.subtitle}>Login to Apoyo</Text>

                {useMobile ? (
                  <View style={{ marginTop: 18 }}>
                    <View style={styles.inputWrapMobile}>
                      <View style={styles.prefix}>
                        <Text style={styles.prefixText}>+63</Text>
                      </View>
                      <TextInput
                        value={mobile}
                        onChangeText={(v) => setMobile(v.replace(/[^\d]/g, "").slice(0, 10))}
                        keyboardType="number-pad"
                        placeholder="9XXXXXXXXX"
                        placeholderTextColor="#B3B3B3"
                        maxLength={10}
                        style={styles.inputMobile}
                      />
                    </View>
                    {!!mobileError && <Text style={styles.error}>{mobileError}</Text>}
                  </View>
                ) : (
                  <View style={{ marginTop: 18 }}>
                    <View style={styles.inputWrap}>
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholder="Email Address"
                        placeholderTextColor="#B3B3B3"
                        style={styles.inputFull}
                      />
                    </View>
                    {!!emailError && <Text style={styles.error}>{emailError}</Text>}
                  </View>
                )}

                {!!loginError && <Text style={styles.error}>{loginError}</Text>}

                <TouchableOpacity onPress={onToggle} style={{ marginTop: 14 }}>
                  <Text style={styles.toggleText}>
                    {useMobile ? "Login via Email" : "Login via Mobile Number"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onNext}
                  activeOpacity={0.85}
                  disabled={!canProceed}
                  style={[styles.loginBtn, !canProceed && styles.loginBtnDisabled]}
                >
                  <Text style={styles.loginBtnText}>Next</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <Text style={styles.bottomText}>Don't have Apoyo account yet?</Text>

                <TouchableOpacity
                  onPress={() => router.push(legalPageRoute("terms-and-conditions"))}
                  activeOpacity={0.85}
                  style={styles.createBtn}
                >
                  <Text style={styles.createBtnText}>Create account</Text>
                </TouchableOpacity>

                <View style={{ height: 10 }} />
              </View>
            </>
          )}

          {/* --- Step 1: Enter PIN --- */}
          {step === 1 && (
            <>
              <Text style={styles.title}>Enter your MPIN</Text>
              <Text style={styles.subtitle}>Enter your 6-digit MPIN to login.</Text>

              <View style={styles.rowTop}>
                <Text style={styles.label}>Enter MPIN</Text>
              </View>

              <TouchableOpacity activeOpacity={1} onPress={() => pinInputRef.current?.focus()} style={styles.pinContainer}>
                <TextInput
                  ref={pinInputRef}
                  value={pin}
                  onChangeText={(v) => setPin(v.replace(/[^\d]/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.hiddenInput}
                  autoFocus
                  caretHidden
                />
                <View style={styles.boxRowCenter} pointerEvents="none">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={[styles.pinBox, { width: boxSize, height: boxSize, marginRight: i < 5 ? SPACING : 0 }]}>
                      <Text style={[styles.pinText, { fontSize: dotSize }]}>{pin[i] ? "•" : ""}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>

              <View style={{ alignItems: "flex-end", marginTop: 8, paddingRight: 10 }}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setPin("")}>
                  <Text style={styles.clear}>Clear</Text>
                </TouchableOpacity>
              </View>

              {!!loginError && <Text style={styles.error}>{loginError}</Text>}

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setPin("");
                  setLoginError("");
                  router.push({
                    pathname: ROUTES.forgotPin,
                    params: { email: email.trim() },
                  });
                }}
                style={{ alignSelf: "flex-end", marginTop: 10, paddingRight: 4 }}
              >
                <Text style={styles.forgotLink}>Forgot MPIN?</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onLogin}
                disabled={!canLogin || isLogging}
                style={[styles.loginBtn, (!canLogin || isLogging) && styles.loginBtnDisabled]}
              >
                <Text style={styles.loginBtnText}>{isLogging ? "Logging in..." : "Login"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setStep(0); setPin(""); setLoginError(""); }}
                activeOpacity={0.85}
                style={[styles.createBtn, { marginTop: 16 }]}
              >
                <Text style={styles.createBtnText}>Back to email</Text>
              </TouchableOpacity>

              <View style={{ height: 10 }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", overflow: "hidden" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN.width,
    height: SCREEN.height,
  },
  backdropScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SCREEN.width,
    height: SCREEN.height,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  safe: { flex: 1, backgroundColor: "transparent" },
  container: { flex: 1, paddingHorizontal: 22, paddingTop: 12 },

  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 10,
    marginHorizontal: 20,
    paddingHorizontal: 8,
  },
  headerCityLogo: {
    width: 64,
    height: 64,
    marginRight: 12,
  },
  headerSeal: {
    width: SCREEN_W * 0.48,
    height: 36,
    marginLeft: 4,
  },

  brand: { alignSelf: "center" },
  brandLogo: { width: SCREEN_W * 0.42, height: 60, marginTop: 10, marginBottom: 8 },

  loginBottomBlock: {
    marginTop: "auto",
  },

  title: { marginTop: 22, fontSize: 32, color: DARK, fontFamily: FONT, fontWeight: "700" },
  subtitle: { marginTop: 6, fontSize: 16, color: SUB, fontFamily: FONT, fontWeight: "500" },

  inputWrap: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, height: 54, justifyContent: "center", paddingHorizontal: 14, backgroundColor: "#fff" },
  inputFull: { fontSize: 16, color: DARK, fontFamily: FONT, fontWeight: "500", paddingVertical: 0 },

  inputWrapMobile: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, height: 54, flexDirection: "row", alignItems: "center", overflow: "hidden", backgroundColor: "#fff" },
  prefix: { width: 70, height: "100%", alignItems: "center", justifyContent: "center" },
  prefixText: { fontSize: 15, color: "#4A4A4A", fontFamily: FONT, fontWeight: "700" },
  inputMobile: { flex: 1, fontSize: 16, paddingRight: 14, color: DARK, fontFamily: FONT, fontWeight: "500" },

  toggleText: { textAlign: "center", color: TEAL, fontSize: 15, fontFamily: FONT, fontWeight: "700" },

  error: { marginTop: 8, color: RED, fontFamily: FONT, fontWeight: "500" },

  loginBtn: { height: 54, borderRadius: 12, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", marginTop: 18 },
  loginBtnDisabled: { opacity: 0.35 },
  loginBtnText: { color: "#fff", fontSize: 16, fontFamily: FONT, fontWeight: "700" },

  divider: { height: 1, backgroundColor: "#E6E6E6", marginTop: 22 },
  bottomText: { marginTop: 18, textAlign: "center", color: "#7D7D7D", fontFamily: FONT, fontWeight: "500" },

  createBtn: { height: 54, borderRadius: 12, borderWidth: 1.5, borderColor: TEAL, alignItems: "center", justifyContent: "center", marginTop: 14 },
  createBtnText: { color: TEAL, fontSize: 16, fontFamily: FONT, fontWeight: "700" },

  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 34, marginBottom: 10 },
  label: { fontFamily: FONT, fontWeight: "700", color: DARK, fontSize: 15 },
  clear: { fontFamily: FONT, fontWeight: "700", color: "#7D7D7D", fontSize: 14 },
  forgotLink: { fontFamily: FONT, fontWeight: "700", color: TEAL, fontSize: 14 },

  hiddenInput: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },

  pinContainer: { position: "relative", alignItems: "center", justifyContent: "center" },
  boxRowCenter: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  pinBox: { borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  pinText: { fontFamily: FONT, fontWeight: "700", color: DARK, lineHeight: Platform.OS === "ios" ? undefined : 28 },
});
