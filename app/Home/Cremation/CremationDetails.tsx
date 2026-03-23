import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const FONT_REGULAR = "SF Pro Rounded";
const FONT_MEDIUM = "SF Pro Rounded";

const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const MUTED = "#7B7B7B";
const DANGER = "#E45454";
const DISABLED_BG = "#DDEEEE";
const DISABLED_TEXT = "#B8CACA";
const CANCEL_BG = "#BDBDBD";

const CARD_BORDER = "#BFE8E6";
const ICON_BG = "#EAFBFB";
const ICON_BORDER = "#D8F1F1";

const ICON_CREMATION = require("../../../assets/images/Cremation.png");
const TRASHCAN_PNG = require("../../../assets/images/Trashcan.png");

type FuneralAnswer = "yes" | "no" | null;
type NicheAnswer = "yes" | "no" | null;

function mapFuneralCoverage(answer: FuneralAnswer): "Add Funeral Aid" | "Service Only" | null {
  if (answer === "yes") return "Add Funeral Aid";
  if (answer === "no") return "Service Only";
  return null;
}

function mapNicheCoverage(answer: NicheAnswer): "Add Niche Allocation" | "Not at this time" | null {
  if (answer === "yes") return "Add Niche Allocation";
  if (answer === "no") return "Not at this time";
  return null;
}

const REQUIREMENTS = [
  "Death Certificate",
  "Valid ID of Deceased",
  "Barangay Endorsement of the Deceased",
  "Indigency Certificate of the Deceased",
];

export default function CremationDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{ serviceId?: string }>();
  const serviceId = params?.serviceId || "cremation";

  const [funeralAnswer, setFuneralAnswer] = useState<FuneralAnswer>(null);
  const [nicheAnswer, setNicheAnswer] = useState<NicheAnswer>(null);

  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<"funeral" | "niche" | null>(
    null
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | null>(null);

  const step1Done = funeralAnswer !== null;
  const step2Done = nicheAnswer !== null;
  const bothDone = step1Done && step2Done;

  const hasFuneralChip = funeralAnswer === "yes";
  const hasNicheChip = nicheAnswer === "yes";

  // Both declined = show full "Add Coverage +" button
  const bothDeclined = funeralAnswer === "no" && nicheAnswer === "no";
  // Only one declined = show small "+" icon
  const oneDeclined =
    (funeralAnswer === "no" && nicheAnswer === "yes") ||
    (funeralAnswer === "yes" && nicheAnswer === "no");
  const canShowAddButton = bothDeclined || oneDeclined;

  const funeralCoverage = mapFuneralCoverage(funeralAnswer);
  const nicheCoverage = mapNicheCoverage(nicheAnswer);
  const coverageSummary =
    funeralCoverage && nicheCoverage
      ? `Funeral: ${funeralCoverage} | Niche: ${nicheCoverage}`
      : "";

  const goApply = () => {
    if (!bothDone) return;
    router.push({
      pathname: "/Home/RequestInfo",
      params: {
        serviceId: "cremation",
        serviceTitle: "Cremation Assistance",
        category: "burial",
        coverage: coverageSummary,
        funeralAid: funeralCoverage || undefined,
        nicheAllocation: nicheCoverage || undefined,
      },
    } as any);
  };

  const openRemove = (target: "funeral" | "niche") => {
    setRemoveTarget(target);
    setShowRemoveModal(true);
  };

  const confirmRemove = () => {
    if (removeTarget === "funeral") setFuneralAnswer("no");
    if (removeTarget === "niche") setNicheAnswer("no");
    setShowRemoveModal(false);
    setRemoveTarget(null);
  };

  const removeLabel =
    removeTarget === "funeral"
      ? "Funeral Wake Services"
      : removeTarget === "niche"
      ? "Niche Allocation"
      : "";

  const openAddCoverage = () => {
    // If both declined, show first declined option
    if (funeralAnswer === "no") {
      setAddStep(1);
      setShowAddModal(true);
      return;
    }
    if (nicheAnswer === "no") {
      setAddStep(2);
      setShowAddModal(true);
      return;
    }
  };

  // ── STEP 1: Funeral not answered yet ──
  if (!step1Done) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <TopBar onBack={() => router.back()} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ServiceCard />
          <Reminder />

          <View style={styles.stepRow}>
            <Text style={styles.stepGreen}>Step 1 </Text>
            <Text style={styles.stepGray}>out of 2</Text>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionText}>
              Would you like to include funeral and wake{"\n"}services with your
              request?
            </Text>

            <Pressable
              onPress={() => setFuneralAnswer("yes")}
              style={({ pressed }) => [
                styles.optionRow,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={styles.optionText}>Yes, add Funeral Aid</Text>
              <View style={styles.optionPlusBox}>
                <Ionicons name="add" size={14} color="#FFFFFF" />
              </View>
            </Pressable>

            <Pressable
              onPress={() => setFuneralAnswer("no")}
              style={({ pressed }) => [
                styles.optionRow,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={styles.optionText}>No, Service only</Text>
              <View style={styles.optionPlusBox}>
                <Ionicons name="add" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <View style={[styles.applyBtn, styles.applyBtnDisabled]}>
            <Text style={[styles.applyBtnText, styles.applyBtnTextDisabled]}>
              Apply Now
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── STEP 2: Funeral done, Niche not answered yet ──
  if (!step2Done) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <TopBar onBack={() => router.back()} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ServiceCard />
          <Reminder />

          <Text style={styles.coverageHeader}>Burial Assistance Coverage</Text>
          <View style={styles.coverageRow}>
            {hasFuneralChip && (
              <LinearGradient
                colors={["#6BBF8A", "#4AA8A0"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.coverageChipGradient}
              >
                <Text style={styles.coverageChipText}>
                  Funeral Wake Services
                </Text>
                <Pressable
                  onPress={() => openRemove("funeral")}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                </Pressable>
              </LinearGradient>
            )}
          </View>

          <View style={styles.stepRow}>
            <Text style={styles.stepGreen}>Step 2 </Text>
            <Text style={styles.stepGray}>out of 2</Text>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionText}>
              Will the remains be placed in a{"\n"}columbarium niche?
            </Text>

            <Pressable
              onPress={() => setNicheAnswer("yes")}
              style={({ pressed }) => [
                styles.optionRow,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={styles.optionText}>Yes, add Niche Allocation</Text>
              <View style={styles.optionPlusBox}>
                <Ionicons name="add" size={14} color="#FFFFFF" />
              </View>
            </Pressable>

            <Pressable
              onPress={() => setNicheAnswer("no")}
              style={({ pressed }) => [
                styles.optionRow,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={styles.optionText}>Not at this time</Text>
              <View style={styles.optionPlusBox}>
                <Ionicons name="add" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <View style={[styles.applyBtn, styles.applyBtnDisabled]}>
            <Text style={[styles.applyBtnText, styles.applyBtnTextDisabled]}>
              Apply Now
            </Text>
          </View>
        </View>

        <Modal transparent visible={showRemoveModal} animationType="fade">
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              setShowRemoveModal(false);
              setRemoveTarget(null);
            }}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Image
                source={TRASHCAN_PNG}
                style={styles.trashImg}
                resizeMode="contain"
              />
              <Text style={styles.modalTitle}>
                Are you sure you want to remove this{"\n"}"{removeLabel}"?
              </Text>
              <View style={styles.modalBtns}>
                <Pressable
                  onPress={() => {
                    setShowRemoveModal(false);
                    setRemoveTarget(null);
                  }}
                  style={({ pressed }) => [
                    styles.cancelBtnModal,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmRemove}
                  style={({ pressed }) => [
                    styles.removeBtnModal,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── BOTH DONE: Final view ──
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <TopBar onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ServiceCard />

        <Text style={styles.sectionHeader}>About Service</Text>
        <Text style={styles.aboutSubtitle}>
          Panteon de Dasmariñas Public Cemetery
        </Text>
        <Text style={styles.aboutBody}>
          Provides essential burial and cremation services for city residents.
          It offers a dignified public cemetery for families seeking a final
          resting place. This facility ensures accessible and organized options
          for those in need of assistance.
        </Text>

        <Text style={styles.coverageHeader}>Burial Assistance Coverage</Text>
        <View style={styles.coverageRow}>
          {hasFuneralChip && (
            <LinearGradient
              colors={["#6BBF8A", "#4AA8A0"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.coverageChipGradient}
            >
              <Text style={styles.coverageChipText}>Funeral Wake Services</Text>
              <Pressable
                onPress={() => openRemove("funeral")}
                hitSlop={8}
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </Pressable>
            </LinearGradient>
          )}

          {hasNicheChip && (
            <LinearGradient
              colors={["#C4D94E", "#7CCB5B"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.coverageChipGradient}
            >
              <Text style={styles.coverageChipText}>Niche Allocation</Text>
              <Pressable
                onPress={() => openRemove("niche")}
                hitSlop={8}
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </Pressable>
            </LinearGradient>
          )}

          {/* Both declined = full "Add Coverage +" button with text */}
          {bothDeclined && (
            <Pressable
              onPress={openAddCoverage}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={["#5BC0A0", "#4AA8A0"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addCoverageBtnGrad}
              >
                <Text style={styles.addCoverageText}>Add Coverage</Text>
                <Ionicons name="add" size={14} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          )}

          {/* Only one declined = small "+" icon button */}
          {oneDeclined && (
            <Pressable
              onPress={openAddCoverage}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={["#5BC0A0", "#4AA8A0"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addCoverageSmall}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          )}
        </View>

        {/* Requirements removed */}
        <View style={{ height: 22 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          onPress={goApply}
          style={({ pressed }) => [
            styles.applyBtn,
            pressed && { opacity: 0.92 },
          ]}
        >
          <Text style={styles.applyBtnText}>Apply Now</Text>
        </Pressable>
      </View>

      {/* Remove Modal */}
      <Modal transparent visible={showRemoveModal} animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowRemoveModal(false);
            setRemoveTarget(null);
          }}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Image
              source={TRASHCAN_PNG}
              style={styles.trashImg}
              resizeMode="contain"
            />
            <Text style={styles.modalTitle}>
              Are you sure you want to remove this{"\n"}"{removeLabel}"?
            </Text>
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => {
                  setShowRemoveModal(false);
                  setRemoveTarget(null);
                }}
                style={({ pressed }) => [
                  styles.cancelBtnModal,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmRemove}
                style={({ pressed }) => [
                  styles.removeBtnModal,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Coverage Modal */}
      <Modal transparent visible={showAddModal} animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowAddModal(false);
            setAddStep(null);
          }}
        >
          <Pressable style={styles.addModalCard} onPress={() => {}}>
            {addStep === 1 && (
              <>
                <Text style={styles.addModalTitle}>
                  Would you like to include funeral and wake{"\n"}services with
                  your request?
                </Text>
                <Pressable
                  onPress={() => {
                    setFuneralAnswer("yes");
                    setShowAddModal(false);
                    setAddStep(null);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Text style={styles.optionText}>Yes, add Funeral Aid</Text>
                  <View style={styles.optionPlusBox}>
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowAddModal(false);
                    setAddStep(null);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Text style={styles.optionText}>No, Service only</Text>
                  <View style={styles.optionPlusBox}>
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              </>
            )}

            {addStep === 2 && (
              <>
                <Text style={styles.addModalTitle}>
                  Will the remains be placed in a{"\n"}columbarium niche?
                </Text>
                <Pressable
                  onPress={() => {
                    setNicheAnswer("yes");
                    setShowAddModal(false);
                    setAddStep(null);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Text style={styles.optionText}>
                    Yes, add Niche Allocation
                  </Text>
                  <View style={styles.optionPlusBox}>
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowAddModal(false);
                    setAddStep(null);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Text style={styles.optionText}>Not at this time</Text>
                  <View style={styles.optionPlusBox}>
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ── Reusable Components ── */
function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
      </Pressable>
      <Text style={styles.topTitle}>Burial Assistance</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

function ServiceCard() {
  return (
    <View style={styles.serviceCard}>
      <LinearGradient
        colors={["#7C3AED", "#EC4899"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardTopGradient}
      />
      <View style={styles.iconBox}>
        <Image
          source={ICON_CREMATION}
          style={styles.serviceIcon}
          resizeMode="contain"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.serviceName}>Cremation Assistance</Text>
        <Text style={styles.serviceDesc}>
          Urgent aid for immediate and essential cremation services.
        </Text>
      </View>
    </View>
  );
}

function Reminder() {
  return (
    <>
      <Text style={styles.reminderHeader}>Reminder</Text>
      <View style={styles.reminderBox}>
        <Text style={styles.reminderText}>
          Selecting Burial Assistance allows you to concurrently apply for
          Funeral Grant to cover both the plot and the service. Whether you
          choose burial, cremation, or a columbarium, you may combine these with
          funeral benefits for full coverage.
        </Text>
      </View>
    </>
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 16,
    color: TEXT_DARK,
  },

  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },

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
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 14,
    color: TEXT_DARK,
  },
  serviceDesc: {
    marginTop: 2,
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
    fontSize: 11.5,
    lineHeight: 15,
    color: MUTED,
  },

  reminderHeader: {
    marginTop: 22,
    textAlign: "center",
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    color: DANGER,
    fontSize: 24,
    letterSpacing: 0.3,
  },
  reminderBox: {
    marginTop: 10,
    backgroundColor: "#FBE1E1",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reminderText: {
    textAlign: "center",
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
    color: "#D94B4B",
    fontSize: 11,
    lineHeight: 16,
  },

  coverageHeader: {
    marginTop: 20,
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 20,
    color: TEXT_DARK,
    letterSpacing: 0.2,
  },

  stepRow: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "baseline",
  },
  stepGreen: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 16,
    color: "#2FA44F",
  },
  stepGray: {
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
    fontSize: 16,
    color: "#B0B0B0",
  },

  questionCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  questionText: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 13,
    color: TEXT_DARK,
    lineHeight: 19,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  optionText: {
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
    fontSize: 12.5,
    color: TEXT_DARK,
  },
  optionPlusBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#7CCB5B",
    alignItems: "center",
    justifyContent: "center",
  },

  sectionHeader: {
    marginTop: 16,
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 15,
    color: TEXT_DARK,
  },
  aboutSubtitle: {
    marginTop: 8,
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 12.5,
    color: TEXT_DARK,
  },
  aboutBody: {
    marginTop: 6,
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
    fontSize: 11.5,
    lineHeight: 17,
    color: MUTED,
  },

  coverageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  coverageChipGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  coverageChipText: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 12.5,
    color: "#FFFFFF",
  },

  /* Full "Add Coverage +" button (both declined) */
  addCoverageBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addCoverageText: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 12.5,
    color: "#FFFFFF",
  },

  /* Small "+" icon only button (one declined) */
  addCoverageSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  reqWrap: {
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EEEE",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  reqHeader: {
    backgroundColor: "#7CCB5B",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  reqHeaderText: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "700",
    color: "#FFFFFF",
    fontSize: 16,
  },
  reqBody: { paddingVertical: 6 },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reqTitle: {
    flex: 1,
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    color: "#2E3A3A",
    fontSize: 11,
  },
  reqDivider: {
    height: 1,
    backgroundColor: "#E9EEEE",
    marginLeft: 14,
    marginRight: 14,
  },

  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
    backgroundColor: "#FFFFFF",
  },
  applyBtn: {
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
  applyBtnDisabled: {
    backgroundColor: DISABLED_BG,
    shadowOpacity: 0,
    elevation: 0,
  },
  applyBtnText: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 14,
    color: "#FFFFFF",
  },
  applyBtnTextDisabled: { color: DISABLED_TEXT },

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
    fontFamily: FONT_REGULAR,
    fontWeight: "400",
    fontSize: 13,
    color: TEXT_DARK,
    textAlign: "center",
    lineHeight: 18,
  },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 14 },
  cancelBtnModal: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: CANCEL_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 12.5,
    color: "#FFFFFF",
  },
  removeBtnModal: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 12.5,
    color: "#FFFFFF",
  },

  addModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  addModalTitle: {
    fontFamily: FONT_MEDIUM,
    fontWeight: "600",
    fontSize: 13,
    color: TEXT_DARK,
    lineHeight: 19,
    marginBottom: 16,
  },
});
