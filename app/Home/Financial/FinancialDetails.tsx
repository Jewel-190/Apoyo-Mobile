// app/Home/Financial/FinancialDetails.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import {
  getHomeRequirements,
  getHomeRequirementTips,
  type HomeRequirementItem,
  type RequirementTipItem,
} from "../../../lib/serviceRequirements";

const FONT = "SF Pro Rounded";
const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const DANGER = "#E45454";
const FIELD_BG = "#EAFBFB";
const FIELD_BORDER = "#0B8F8B";
const DISABLED_BG = "#DDEEEE";
const DISABLED_TEXT = "#B8CACA";

const ICON_FINANCIAL = require("../../../assets/images/Financial.png");

const SERVICE_ID = "emergency-finance" as const;

/** Stored verbatim in `financial_requests.financial_request_type`. */
export const FINANCIAL_ASSISTANCE_TYPES = [
  "Emergency Need",
  "Housing/ Property Impact",
  "Events/Competition/Participation",
  "Burial Support",
  "Other",
] as const;

export type FinancialAssistanceType = (typeof FINANCIAL_ASSISTANCE_TYPES)[number];

export default function FinancialDetails() {
  const router = useRouter();

  const requirements = useMemo(() => getHomeRequirements(SERVICE_ID), []);

  const requirementTipsById = useMemo(() => {
    const map: Record<string, RequirementTipItem[]> = {};
    requirements.forEach((req) => {
      const tips = getHomeRequirementTips({
        serviceId: SERVICE_ID,
        requirementId: req.id,
      });
      if (tips.length) map[req.id] = tips;
    });
    return map;
  }, [requirements]);

  const [openReq, setOpenReq] = useState<Record<string, boolean>>({});
  const [openTipId, setOpenTipId] = useState<string | null>(null);

  const [financialType, setFinancialType] = useState<FinancialAssistanceType | "">("");
  const [typeModalOpen, setTypeModalOpen] = useState(false);

  const toggleReq = (id: string) => {
    setOpenReq((p) => ({ ...p, [id]: !p[id] }));
  };

  const canApply = !!financialType;

  const goApply = () => {
    if (!canApply || !financialType) return;
    router.push({
      pathname: "/Home/RequestInfo",
      params: {
        serviceId: SERVICE_ID,
        serviceTitle: "Emergency Financial Relief",
        category: "financial",
        financialRequestType: financialType,
      },
    } as any);
  };

  const renderRequirementRow = (r: HomeRequirementItem, idx: number, total: number) => {
    const tipItems = requirementTipsById[r.id] || [];
    const hasTipItems = tipItems.length > 0;
    const hasDropdown = !!r.details || hasTipItems;
    const expanded = !!openReq[r.id];

    return (
      <View key={r.id} style={styles.reqRowWrap}>
        <Pressable
          disabled={!hasDropdown}
          onPress={() => hasDropdown && toggleReq(r.id)}
          style={({ pressed }) => [styles.reqRow, hasDropdown && pressed && { opacity: 0.92 }]}
        >
          <View style={styles.reqLeft}>
            <Ionicons name="checkmark" size={18} color="#2FA44F" style={{ marginRight: 10 }} />
            <Text style={styles.reqTitle}>{r.title}</Text>
          </View>
          {hasDropdown ? (
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#A0A7A7" />
          ) : (
            <View style={{ width: 18, height: 18 }} />
          )}
        </Pressable>

        {hasDropdown && expanded && (
          <View style={styles.reqDetails}>
            {!!r.details && <Text style={styles.reqDetailsText}>{r.details}</Text>}
            {hasTipItems && (
              <View style={styles.reqTipsGroup}>
                {tipItems.map((tip: RequirementTipItem) => {
                  const tipScopedId = `${SERVICE_ID}-${r.id}-${tip.id}`;
                  const tipExpanded = openTipId === tipScopedId;
                  return (
                    <View key={tipScopedId} style={styles.reqTipCard}>
                      <Pressable
                        onPress={() =>
                          setOpenTipId((prev) => (prev === tipScopedId ? null : tipScopedId))
                        }
                        style={({ pressed }) => [styles.reqTipHead, pressed && { opacity: 0.9 }]}
                      >
                        <Text style={styles.reqTipTitle}>{tip.title}</Text>
                        <Ionicons
                          name={tipExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#9AA6A6"
                        />
                      </Pressable>
                      {tipExpanded && (
                        <>
                          {!!tip.details && <Text style={styles.reqTipText}>{tip.details}</Text>}
                          {!!tip.image && (
                            <Image source={tip.image} style={styles.reqTipImage} resizeMode="contain" />
                          )}
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
        {idx !== total - 1 && <View style={styles.reqDivider} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.65 }]}
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
        </Pressable>
        <Text style={styles.topTitle}>Financial Assistance</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.detailsCardShadow}>
          <View style={styles.detailsCard}>
            <LinearGradient
              colors={["#F6D34D", "#F2B600"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.detailsCardTopStroke}
            />
            <View style={styles.detailsServiceRow}>
              <View style={styles.detailsIconWrap}>
                <Image source={ICON_FINANCIAL} style={styles.detailsPng} resizeMode="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailsServiceTitle}>Emergency Financial Relief</Text>
                <Text style={styles.detailsServiceDesc}>
                  Urgent monetary aid for critical and immediate financial crises.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.detailsSectionTitle}>About Service</Text>
        <Text style={styles.detailsBodyText}>
          The City Social Welfare and Development Office (CSWDO) provide emergency financial
          assistance or referrals for free service to individuals and families who are in extremely
          difficult situations and have inadequate resources.
        </Text>

        <Text style={[styles.detailsSectionTitle, { marginTop: 14 }]}>Who may Avail</Text>
        <View style={styles.detailsBullets}>
          <View style={styles.detailsBulletRow}>
            <View style={styles.detailsBulletDot} />
            <Text style={styles.detailsBulletText}>Individuals and families with inadequate resources.</Text>
          </View>
        </View>

        <Text style={styles.detailsReminderTitle}>Reminder</Text>
        <View style={styles.detailsReminderBox}>
          <Text style={styles.detailsReminderText}>
            Requests must be filed by the concerned individual or an immediate family member residing
            in the same household, and supporting documents must be complete upon submission.
          </Text>
        </View>

        {requirements.length > 0 && (
          <View style={styles.reqWrapShadow}>
            <View style={styles.reqWrap}>
              <View style={styles.reqHeader}>
                <Text style={styles.reqHeaderText}>Requirements</Text>
              </View>
              <View style={styles.reqBody}>
                {requirements.map((r, idx) => renderRequirementRow(r, idx, requirements.length))}
              </View>
            </View>
          </View>
        )}

        <Text style={[styles.detailsSectionTitle, { marginTop: 14 }]}>
          Choose type of Financial Assistance
        </Text>
        <Pressable
          onPress={() => setTypeModalOpen(true)}
          style={({ pressed }) => [styles.typeField, pressed && { opacity: 0.92 }]}
        >
          <Text style={[styles.typeFieldText, !financialType && styles.typeFieldPlaceholder]}>
            {financialType || "Select type"}
          </Text>
          <Ionicons name="chevron-down" size={20} color={TEAL} />
        </Pressable>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          onPress={goApply}
          disabled={!canApply}
          style={({ pressed }) => [
            styles.applyBtn,
            !canApply && styles.applyBtnDisabled,
            pressed && canApply && { opacity: 0.94 },
          ]}
        >
          <Text style={[styles.applyBtnText, !canApply && styles.applyBtnTextDisabled]}>Apply Now</Text>
        </Pressable>
      </View>

      <Modal visible={typeModalOpen} transparent animationType="fade" onRequestClose={() => setTypeModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setTypeModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Choose type of Financial Assistance</Text>
              <Pressable
                onPress={() => setTypeModalOpen(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.75 }]}
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {FINANCIAL_ASSISTANCE_TYPES.map((opt, i) => (
                <Pressable
                  key={opt}
                  onPress={() => {
                    setFinancialType(opt);
                    setTypeModalOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.radioRow,
                    i === FINANCIAL_ASSISTANCE_TYPES.length - 1 && styles.radioRowLast,
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <View style={[styles.radioOuter, financialType === opt && styles.radioOuterActive]}>
                    {financialType === opt ? <View style={styles.radioInner} /> : null}
                  </View>
                  <Text style={styles.radioLabel}>{opt}</Text>
                </Pressable>
              ))}
            </ScrollView>
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
  reqDivider: {
    height: 1,
    backgroundColor: "#E9EEEE",
    marginLeft: 14,
    marginRight: 14,
  },
  reqDetails: { paddingHorizontal: 42, paddingBottom: 12, marginTop: -4 },
  reqDetailsText: {
    fontFamily: FONT,
    fontWeight: "400",
    color: "#6B7A7A",
    fontSize: 14,
    lineHeight: 18,
  },
  reqTipsGroup: {
    marginTop: 10,
    gap: 8,
  },
  reqTipCard: {
    borderWidth: 1,
    borderColor: "#E7EEEE",
    borderRadius: 10,
    backgroundColor: "#FAFCFC",
    overflow: "hidden",
  },
  reqTipHead: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  reqTipTitle: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 11,
    color: "#3E4E4E",
  },
  reqTipText: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 10.5,
    lineHeight: 15,
    color: "#5F6F6F",
  },
  reqTipImage: {
    width: "100%",
    height: 180,
    borderTopWidth: 1,
    borderTopColor: "#E7EEEE",
    backgroundColor: "#FFFFFF",
  },

  typeField: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: FIELD_BG,
    borderWidth: 1.2,
    borderColor: FIELD_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  typeFieldText: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: TEXT_DARK,
  },
  typeFieldPlaceholder: {
    color: "#9AA6A6",
    fontWeight: "500",
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
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 14,
    color: "#FFFFFF",
  },
  applyBtnTextDisabled: {
    color: DISABLED_TEXT,
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
    maxHeight: "80%",
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
    gap: 10,
  },
  modalTitle: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DANGER,
  },
  modalScroll: {
    maxHeight: 360,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E9EDED",
  },
  radioRowLast: {
    borderBottomWidth: 0,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CFCFCF",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: TEAL,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: TEAL,
  },
  radioLabel: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 13,
    color: TEXT_DARK,
  },
});
