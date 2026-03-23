// app/Home/Verify-acc.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/* ========= THEME ========= */
const TEAL = "#0B8F8B";
const DARK = "#2B2B2B";
const SUB = "#7B7B7B";
const GRAY = "#D8D8D8";
const TEAL_SOFT = "#E6F6F5";
const FONT = "SF Pro Rounded";

/* ========= STORAGE KEYS ========= */
const STORAGE_VERIFIED = "apoyo_verified_v2"; // matches Home.tsx
const CACHE_USER = "apoyo_user_cache";

/* ========= ASSETS ========= */
const CONGRATS_PNG = require("../../assets/images/congrats.png");

/* ========= TYPES ========= */
type Sex = "male" | "female" | null;

/* ========= helpers ========= */
function sanitizeBirthDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 0) return "";
  let formatted = digits.slice(0, 2);
  if (digits.length > 2) formatted += "/" + digits.slice(2, 4);
  if (digits.length > 4) formatted += "/" + digits.slice(4, 8);
  return formatted;
}

function sanitizeMobile10(input: string) {
  return input.replace(/\D/g, "").slice(0, 10);
}

function normalizeFullMobile(digits10: string) {
  return `+63${digits10}`;
}

function Radio({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.radioItem} hitSlop={10}>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </Pressable>
  );
}

export default function VerifyAcc() {
  const router = useRouter();

  // Pre-filled fields (read-only, from database)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(""); // Full phone with +63
  const [email, setEmail] = useState("");

  // User-editable fields
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<Sex>(null);
  const [address, setAddress] = useState("");
  const [agree, setAgree] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(true);

  // ✅ local modal (so no “outside services” issues)
  const [showCongrats, setShowCongrats] = useState(false);

  // Load user data from Supabase (pre-fill read-only fields)
  useEffect(() => {
    const load = async () => {
      try {
        // Load from cache first (instant)
        const cached = await AsyncStorage.getItem(CACHE_USER);
        if (cached) {
          const parsed = JSON.parse(cached);
          const fullName = [parsed.first_name, parsed.middle_name, parsed.last_name]
            .filter(Boolean)
            .join(" ");
          if (fullName) setName(fullName);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.contact_number) setPhone(parsed.contact_number);
        }

        // Fetch fresh data from Supabase in background
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("users")
            .select("first_name, middle_name, last_name, email, contact_number")
            .eq("id", user.id)
            .single();
          
          if (data) {
            // Build full name
            const fullName = [data.first_name, data.middle_name, data.last_name]
              .filter(Boolean)
              .join(" ");
            setName(fullName);
            if (data.email) setEmail(data.email);
            if (data.contact_number) setPhone(data.contact_number);
            
            // Update cache
            await AsyncStorage.setItem(CACHE_USER, JSON.stringify({
              first_name: data.first_name,
              middle_name: data.middle_name,
              last_name: data.last_name,
              email: data.email,
              contact_number: data.contact_number,
            }));
          }
        }
      } catch (err) {
        console.log("VerifyAcc load error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  /* ========= validation (only for user-editable fields) ========= */
  // Pre-filled fields are read-only, no validation needed - they come from DB

  const birthError = useMemo(() => {
    const digits = birthDate.replace(/\D/g, "");
    if (!digits) return "Birth date is required";
    if (digits.length !== 8) return "Birth date must be MM/DD/YYYY";
    return "";
  }, [birthDate]);

  const sexError = useMemo(() => (!sex ? "Please select sex" : ""), [sex]);

  const addressError = useMemo(
    () => (!address.trim() ? "Address is required" : ""),
    [address]
  );

  const canSubmit = useMemo(() => {
    return (
      agree &&
      name && // Must have pre-filled data
      email &&
      phone &&
      !birthError &&
      !sexError &&
      !addressError
    );
  }, [
    agree,
    name,
    email,
    phone,
    birthError,
    sexError,
    addressError,
  ]);

  const onSubmit = async () => {
    setAttempted(true);

    const firstError =
      (!name ? "User data not loaded" : "") ||
      birthError ||
      sexError ||
      addressError ||
      (!agree ? "You must agree to continue" : "");

    if (firstError) {
      Alert.alert("Cannot submit", firstError);
      return;
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Error", "Please log in again.");
      return;
    }

    // Convert birth date from MM/DD/YYYY to YYYY-MM-DD for database
    const [mm, dd, yyyy] = birthDate.split("/");
    const birthDateISO = `${yyyy}-${mm}-${dd}`;

    // Update user record in database with verification data + set verified = true
    const { error: updateError } = await supabase
      .from("users")
      .update({
        address: address.trim(),
        birth_date: birthDateISO,
        sex: sex === "male" ? "M" : "F",
        verified: true,
      })
      .eq("id", user.id);

    if (updateError) {
      console.log("Verification update error:", updateError);
      Alert.alert("Error", "Could not save verification. Please try again.");
      return;
    }

    // ✅ Save verified flag (this is what Home.tsx checks)
    await AsyncStorage.setItem(STORAGE_VERIFIED, "1");

    // ✅ Show congrats modal here, then continue back to Home
    setShowCongrats(true);
  };

  const finishCongrats = () => {
    setShowCongrats(false);
    // ✅ triggers Assistance success + auto-open pending target
    router.replace("/Home/Home?verified=1");
  };

  const showFillIn = attempted && !canSubmit;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.outer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <View style={styles.topRow}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={12}
                style={styles.backBtn}
              >
                <Ionicons name="chevron-back" size={24} color={DARK} />
              </Pressable>
            </View>

            <Text style={styles.title}>Verify your account</Text>

            {showFillIn ? (
              <Text style={styles.topWarn}>*Fill in (check red warnings)</Text>
            ) : null}

            {/* Name (read-only from database) */}
            <Text style={styles.label}>Name</Text>
            <View style={[styles.inputWrap, styles.readOnlyField]}>
              <Text style={[styles.input, styles.readOnlyText]}>
                {name || "Loading..."}
              </Text>
            </View>

            {/* Contact Number (read-only from database) */}
            <Text style={[styles.label, styles.labelMargin]}>
              Contact Number
            </Text>
            <View style={[styles.inputWrap, styles.readOnlyField]}>
              <Text style={[styles.input, styles.readOnlyText]}>
                {phone || "Loading..."}
              </Text>
            </View>

            {/* Email (read-only from database) */}
            <Text style={styles.labelMargin}>Email Address</Text>
            <View style={[styles.inputWrap, styles.readOnlyField]}>
              <Text style={[styles.input, styles.readOnlyText]}>
                {email || "Loading..."}
              </Text>
            </View>

            {/* Birthdate + Sex */}
            <View style={styles.row2}>
              <View style={styles.birthCol}>
                <Text style={styles.label}>Birth Date</Text>
                <View
                  style={[
                    styles.inputWrap,
                    styles.grayField,
                    attempted && !!birthError && styles.inputErrorBorder,
                  ]}
                >
                  <TextInput
                    value={birthDate}
                    onChangeText={(t) => setBirthDate(sanitizeBirthDate(t))}
                    style={[styles.input, { color: DARK }]}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor="#B6B6B6"
                    keyboardType={
                      Platform.OS === "ios" ? "number-pad" : "numeric"
                    }
                    inputMode="numeric"
                    maxLength={10}
                    returnKeyType="next"
                  />
                </View>
                {attempted && !!birthError ? (
                  <Text style={styles.error}>{birthError}</Text>
                ) : null}
              </View>

              <View style={styles.sexCol}>
                <Text style={styles.label}>Sex</Text>
                <View style={styles.sexRow}>
                  <Radio
                    label="Male"
                    selected={sex === "male"}
                    onPress={() => setSex("male")}
                  />
                  <Radio
                    label="Female"
                    selected={sex === "female"}
                    onPress={() => setSex("female")}
                  />
                </View>
                {attempted && !!sexError ? (
                  <Text style={styles.error}>{sexError}</Text>
                ) : null}
              </View>
            </View>

            {/* Address */}
            <Text style={styles.labelMargin}>Address</Text>
            <View
              style={[
                styles.inputWrap,
                styles.grayField,
                styles.addressWrap,
                attempted && !!addressError && styles.inputErrorBorder,
              ]}
            >
              <TextInput
                value={address}
                onChangeText={setAddress}
                style={[styles.input, { color: DARK, flex: 1 }]}
                placeholder="e.g. Brgy. Burol-2, Dasmariñas, Philippines"
                placeholderTextColor="#B6B6B6"
                returnKeyType="done"
                multiline
              />
            </View>
            {attempted && !!addressError ? (
              <Text style={styles.error}>{addressError}</Text>
            ) : null}

            <View style={{ height: 10 }} />

            {/* Agreement checkbox */}
            <Pressable
              onPress={() => setAgree((v) => !v)}
              style={styles.agreeRow}
            >
              <View style={[styles.checkbox, agree && styles.checkboxChecked]}>
                {agree && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={styles.agreeText}>
                I confirm that the information provided is accurate and{"\n"}
                agree to the processing of my data to complete this request.
              </Text>
            </Pressable>

            {/* Submit */}
            <Pressable
              disabled={!canSubmit}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                (!canSubmit || pressed) && { opacity: canSubmit ? 0.92 : 0.55 },
              ]}
            >
              <Text style={styles.submitText}>Submit</Text>
            </Pressable>

            <View style={{ height: 12 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ✅ Congrats modal */}
      <Modal transparent visible={showCongrats} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={finishCongrats}>
          <Pressable style={styles.congratsWrap} onPress={() => {}}>
            <View style={styles.congratsCard}>
              <Image
                source={CONGRATS_PNG}
                style={styles.congratsImg}
                resizeMode="contain"
              />
              <Text style={styles.congratsTitle}>Congratulations,</Text>
              <Text style={styles.congratsName}>{name.trim() || "User"}!</Text>
              <Text style={styles.congratsSub}>You're all set!</Text>
              <Text style={styles.congratsBody}>
                Your account is now active and ready to help you access services
                support whenever you need it.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.congratsBtn,
                  pressed && { opacity: 0.92 },
                ]}
                onPress={finishCongrats}
              >
                <Text style={styles.congratsBtnText}>Continue</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  outer: {
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },

  container: {
    maxWidth: SCREEN_WIDTH > 420 ? 400 : SCREEN_WIDTH - 24,
    alignSelf: "center",
    width: "100%",
  },

  topRow: { height: 28, justifyContent: "center", marginTop: 2 },
  backBtn: {
    width: 36,
    height: 28,
    justifyContent: "center",
    alignItems: "flex-start",
  },

  title: {
    fontSize: SCREEN_WIDTH < 360 ? 22 : 24,
    fontFamily: FONT,
    fontWeight: "800",
    color: DARK,
    marginBottom: 8,
  },

  topWarn: {
    color: "#E23B3B",
    fontFamily: FONT,
    fontWeight: "700",
    marginBottom: 6,
    fontSize: 12.5,
  },

  label: {
    fontSize: 13.5,
    fontFamily: FONT,
    fontWeight: "700",
    color: DARK,
    marginBottom: 4,
  },
  labelMargin: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 13.5,
    fontFamily: FONT,
    fontWeight: "700",
    color: DARK,
  },

  inputWrap: {
    borderWidth: 1.5,
    borderColor: TEAL,
    backgroundColor: TEAL_SOFT,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    justifyContent: "center",
  },

  inputErrorBorder: { borderColor: "#E23B3B" },

  readOnlyField: {
    backgroundColor: "#E8EEEE",
    borderColor: "#C5CECE",
  },

  readOnlyText: {
    color: "#5A6666",
  },

  input: {
    fontSize: 13.5,
    fontFamily: FONT,
    fontWeight: "700",
    color: DARK,
    paddingVertical: 0,
  },

  error: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: "700",
    color: "#E23B3B",
  },

  phoneRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  phoneCodeWrap: { width: 56, paddingHorizontal: 0, alignItems: "center" },
  phoneCodeText: {
    fontSize: 13.5,
    fontFamily: FONT,
    fontWeight: "800",
    color: DARK,
  },
  phoneNumberWrap: { flex: 1 },

  row2: { flexDirection: "row", gap: 8, marginTop: 6 },
  birthCol: { flex: 1 },
  sexCol: { flex: 1 },

  grayField: {
    backgroundColor: "#FFFFFF",
    borderColor: GRAY,
    borderWidth: 1.5,
  },

  sexRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 4,
  },
  radioItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    maxWidth: 90,
  },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#B8B8B8",
    justifyContent: "center",
    alignItems: "center",
  },
  radioOuterSelected: { borderColor: TEAL },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: TEAL,
  },
  radioLabel: {
    marginLeft: 6,
    fontSize: 12.5,
    fontFamily: FONT,
    fontWeight: "700",
    color: "#9A9A9A",
  },

  addressWrap: { height: 56, paddingVertical: 8 },

  agreeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: TEAL,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: TEAL },
  agreeText: {
    flex: 1,
    color: SUB,
    fontSize: 12,
    fontFamily: FONT,
    fontWeight: "700",
    lineHeight: 16,
  },

  submitBtn: {
    height: 40,
    borderRadius: 10,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginTop: 4,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "800",
  },

  /* ===== MODAL ===== */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  congratsWrap: {
    width: "100%",
    maxWidth: 460,
    alignItems: "center",
  },
  congratsCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  congratsImg: { width: 110, height: 110, marginBottom: 6 },
  congratsTitle: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 22,
    color: "#2D2D2D",
    textAlign: "center",
  },
  congratsName: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 22,
    color: TEAL,
    textAlign: "center",
    marginTop: 2,
  },
  congratsSub: {
    marginTop: 2,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 15,
    color: "#4A4A4A",
    textAlign: "center",
  },
  congratsBody: {
    marginTop: 10,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 12.5,
    color: "#6B6B6B",
    textAlign: "center",
    lineHeight: 18,
  },
  congratsBtn: {
    marginTop: 16,
    width: "100%",
    height: 50,
    borderRadius: 25,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  congratsBtnText: {
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 16,
    color: "#FFFFFF",
  },
});
