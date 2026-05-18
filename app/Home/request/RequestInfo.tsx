/**
 * First step when applying: About, Who may avail, Reminder, requirements,
 * and optional catalog preflight (radio steps). Next → RequesterInfo.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  Redirect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
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
  parseAssistanceCategoryTheme,
} from "@/AppCore/AssistanceCategoryTheme";
import { useAssistanceCatalog } from "@/AppCore/UseAssistanceCatalog";
import {
  stripHtml,
  type HomeDetailsPage,
} from "@/AppCore/AssistanceCatalogFromApi";
import {
  CmsRichText,
  coerceCmsHtml,
  hasVisibleCmsContent,
} from "@/AppCore/CmsRichText";
import type {
  HomeRequirementItem,
  RequirementTipItem,
} from "@/AppCore/ServiceRequirementFieldTypes";
import {
  getCatalogLookupRuntime,
  resolveServiceId,
} from "@/AppCore/CatalogLookupRuntime";
import { isAdditionalAttachmentSlot } from "@/AppCore/CatalogContentParse";
import { preflightSelectionsToRouteParams } from "@/AppCore/PreflightSelections";

const FONT = "SF Pro Rounded";
const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const TEXT_MUTED = "#6B7A7A";
const DANGER = "#E45454";

function tipImageIsRemoteUrl(image: unknown): image is string {
  return (
    typeof image === "string" &&
    /^https?:\/\//i.test((image as string).trim())
  );
}

type SamplePreview =
  | { kind: "remote"; uri: string }
  | { kind: "local"; source: ImageSourcePropType };

function coerceSamplePreview(image: unknown): SamplePreview | null {
  if (image == null) return null;
  if (tipImageIsRemoteUrl(image)) return { kind: "remote", uri: image.trim() };
  if (typeof image === "number") return { kind: "local", source: image };
  return null;
}

function buildRequesterParams(
  serviceId: string,
  displayName: string,
  category: string,
  selections: Record<string, string>
): Record<string, string> {
  return {
    serviceId,
    serviceTitle: displayName,
    category,
    ...preflightSelectionsToRouteParams(selections),
  };
}

export default function RequestInfo() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    serviceId?: string;
    serviceTitle?: string;
    category?: string;
    forceNewDraft?: string;
  }>();

  const serviceId = (params?.serviceId || "").toString().trim();
  const serviceTitleParam = (params?.serviceTitle || "").toString();
  const categoryParam = (params?.category || "").toString();

  const resolvedServiceId = useMemo(
    () => resolveServiceId(serviceId) ?? serviceId,
    [serviceId]
  );

  const { bundle, loading: catalogLoading } = useAssistanceCatalog();

  const catalogService = useMemo(
    () => getCatalogLookupRuntime()?.byServiceId[resolvedServiceId] ?? null,
    [bundle?.runtime, resolvedServiceId]
  );

  const details = useMemo(
    () => bundle?.detailsByServiceId?.[resolvedServiceId] ?? null,
    [bundle, resolvedServiceId]
  );

  const requirementTips = useMemo(() => {
    return bundle?.requirementTipsByServiceId?.[resolvedServiceId] ?? {};
  }, [bundle, resolvedServiceId]);

  const preflightConfig = catalogService?.preflightConfig ?? null;
  const steps = preflightConfig?.steps ?? [];

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [openReq, setOpenReq] = useState<Record<string, boolean>>({});
  const [openTipId, setOpenTipId] = useState<string | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [samplePreview, setSamplePreview] = useState<SamplePreview | null>(null);
  const [sampleTitle, setSampleTitle] = useState("");

  const canContinue = useMemo(() => {
    if (!steps.length) return true;
    return steps.every((s) => {
      const v = selections[s.id];
      return typeof v === "string" && v.trim().length > 0;
    });
  }, [steps, selections]);

  const topTitle =
    details?.headerTitle || catalogService?.categoryHeadline || "Assistance";

  const serviceTitle =
    details?.serviceTitle ||
    catalogService?.displayName ||
    serviceTitleParam ||
    "Assistance";

  const descriptionHtml =
    details?.descriptionHtml?.trim() ||
    catalogService?.descriptionHtml?.trim() ||
    "";
  const serviceDesc =
    details?.serviceDesc?.trim() || stripHtml(descriptionHtml) || "";
  const cmsFonts = details?.cmsFonts ?? catalogService?.cmsFonts ?? null;
  const descriptionFontFamily = cmsFonts?.descriptionFontFamily;
  const aboutFontFamily = cmsFonts?.aboutFontFamily;
  const reminderFontFamily = cmsFonts?.reminderFontFamily;
  const hasServiceDescRich = hasVisibleCmsContent(descriptionHtml);

  const aboutHtml =
    details?.aboutHtml?.trim() || details?.about?.trim() || "";
  const aboutPlain = stripHtml(aboutHtml) || details?.about?.trim() || "";

  const accentSlug =
    details?.categorySlug ||
    catalogService?.categorySlug ||
    categoryParam ||
    "uncategorized";

  const grad = useMemo((): [string, string] => {
    const slug = accentSlug.trim().toLowerCase();
    const fromTheme =
      bundle?.runtime?.categoryThemeBySlug[slug]?.homeCardStripeGradient;
    if (fromTheme) return fromTheme;
    return parseAssistanceCategoryTheme(slug, undefined).homeCardStripeGradient;
  }, [accentSlug, bundle?.runtime?.categoryThemeBySlug]);

  const serviceIconUrl = useMemo(() => {
    const fromBundle = bundle?.services
      ?.find((s) => s.id === resolvedServiceId)
      ?.iconUrl?.trim();
    if (fromBundle) return fromBundle;
    const fromRt = catalogService?.mobileImageUrl?.trim();
    if (fromRt) return fromRt;
    return null;
  }, [bundle, catalogService, resolvedServiceId]);

  const reminderHtml =
    details?.reminderHtml?.trim() ||
    preflightConfig?.reminder_html?.trim() ||
    "";
  const hasReminder = !!coerceCmsHtml(reminderHtml);

  const whoList = details?.who ?? [];

  const requirementsList: HomeRequirementItem[] = useMemo(() => {
    const list = details?.requirements ?? [];
    return list.filter((r) => !isAdditionalAttachmentSlot(r.id));
  }, [details?.requirements]);

  const forceNewDraftParam = useMemo(() => {
    const f = params.forceNewDraft;
    const v = Array.isArray(f) ? f[0] : f;
    return v === "1" || String(v).toLowerCase() === "true";
  }, [params.forceNewDraft]);

  const goNext = () => {
    if (!resolvedServiceId) return;
    const display = serviceTitle;
    const cat =
      details?.categorySlug ||
      catalogService?.categorySlug ||
      categoryParam ||
      "uncategorized";

    if (steps.length) {
      router.push({
        pathname: "/Home/request/RequesterInfo",
        params: {
          ...buildRequesterParams(resolvedServiceId, display, cat, selections),
          ...(forceNewDraftParam ? { forceNewDraft: "1" } : {}),
        },
      } as never);
      return;
    }

    router.push({
      pathname: "/Home/request/RequesterInfo",
      params: {
        serviceId: resolvedServiceId,
        serviceTitle: display,
        category: cat,
        ...(forceNewDraftParam ? { forceNewDraft: "1" } : {}),
      },
    } as never);
  };

  if (!serviceId) {
    return <Redirect href="/Home/Home" />;
  }

  if (!catalogLoading && !details && !steps.length) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <Text style={styles.err}>This service is not available in the catalog.</Text>
          <Pressable onPress={() => router.back()} style={styles.retry}>
            <Text style={styles.retryTxt}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const showMainSpinner = catalogLoading && !details && !catalogService;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={TEXT_DARK} />
        </Pressable>
        <Text style={styles.topTitle}>{topTitle}</Text>
        <View style={{ width: 44 }} />
      </View>

      {showMainSpinner ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <LinearGradient
                colors={grad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cardStripe}
              />
              <View style={styles.iconBox}>
                {serviceIconUrl ? (
                  <ExpoImage
                    source={{ uri: serviceIconUrl }}
                    style={styles.icon}
                    contentFit="contain"
                  />
                ) : (
                  <Ionicons
                    name="layers-outline"
                    size={28}
                    color="#9AA6A6"
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.svcTitle}>{serviceTitle}</Text>
                {hasServiceDescRich ? (
                  <CmsRichText
                    html={descriptionHtml}
                    fontFamily={descriptionFontFamily}
                    baseStyle={styles.svcDesc}
                    textAlign="left"
                  />
                ) : serviceDesc ? (
                  <Text style={styles.svcDesc}>{serviceDesc}</Text>
                ) : null}
              </View>
            </View>

            {hasVisibleCmsContent(aboutHtml) || !!aboutPlain ? (
              <>
                <Text style={styles.secTitle}>About Service</Text>
                {hasVisibleCmsContent(aboutHtml) ? (
                  <CmsRichText
                    html={aboutHtml}
                    fontFamily={aboutFontFamily}
                    baseStyle={styles.secBody}
                  />
                ) : (
                  <Text style={styles.secBody}>{aboutPlain}</Text>
                )}
              </>
            ) : null}

            {whoList.length > 0 && (
              <>
                <Text style={[styles.secTitle, { marginTop: 14 }]}>
                  Who may Avail
                </Text>
                {whoList.map((w, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletTxt}>{w}</Text>
                  </View>
                ))}
              </>
            )}

            {hasReminder ? (
              <>
                <Text style={styles.reminderHdr}>
                  {details?.reminderTitle || "Reminder"}
                </Text>
                <View style={styles.reminderBox}>
                  <CmsRichText
                    html={reminderHtml}
                    fontFamily={reminderFontFamily}
                    baseStyle={styles.reminderTxt}
                    textAlign="center"
                  />
                </View>
              </>
            ) : null}

            {requirementsList.length > 0 && (
              <View style={styles.reqShadow}>
                <View style={styles.reqWrap}>
                  <View style={styles.reqHead}>
                    <Text style={styles.reqHeadTxt}>
                      {details?.requirementsTitle || "Requirements"}
                    </Text>
                  </View>
                  {requirementsList.map((r, idx) => {
                    const tips: RequirementTipItem[] =
                      requirementTips[r.id] ?? [];
                    const hasTips = tips.length > 0;
                    const hasSample = !!r.sampleDocumentImage?.trim();
                    const sampleTipId = `${r.id}-sample`;
                    const sampleTipTitle = "Sample document";
                    const reqBodyHtml =
                      r.detailsHtml?.trim() || r.details?.trim() || "";
                    const hasDrop =
                      hasVisibleCmsContent(reqBodyHtml) ||
                      hasTips ||
                      hasSample;
                    const ex = !!openReq[r.id];
                    const hasReqBody =
                      hasVisibleCmsContent(reqBodyHtml) || !!r.details?.trim();
                    return (
                      <View key={r.id}>
                        <Pressable
                          disabled={!hasDrop}
                          onPress={() =>
                            hasDrop &&
                            setOpenReq((p) => ({ ...p, [r.id]: !p[r.id] }))
                          }
                          style={styles.reqRow}
                        >
                          <View style={styles.reqLeft}>
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color="#2FA44F"
                              style={{ marginRight: 10 }}
                            />
                            <Text style={styles.reqTitle}>{r.title}</Text>
                          </View>
                          {hasDrop ? (
                            <Ionicons
                              name={ex ? "chevron-up" : "chevron-down"}
                              size={18}
                              color="#A0A7A7"
                            />
                          ) : (
                            <View style={{ width: 18 }} />
                          )}
                        </Pressable>
                        {hasDrop && ex && (
                          <View style={styles.reqDet}>
                            {hasVisibleCmsContent(reqBodyHtml) ? (
                              <CmsRichText
                                html={reqBodyHtml}
                                baseStyle={styles.reqDetTxt}
                                textAlign="left"
                              />
                            ) : r.details ? (
                              <Text style={styles.reqDetTxt}>{r.details}</Text>
                            ) : null}
                            {(hasTips || hasSample) && (
                              <View
                                style={{
                                  marginTop: hasReqBody ? 8 : 0,
                                }}
                              >
                                {tips.map((tip) => {
                                  const sid = `${r.id}-${tip.id}`;
                                  const open = openTipId === sid;
                                  return (
                                    <View key={sid} style={styles.tipCard}>
                                      <Pressable
                                        onPress={() =>
                                          setOpenTipId((x) =>
                                            x === sid ? null : sid
                                          )
                                        }
                                        style={styles.tipHead}
                                      >
                                        <Text style={styles.tipTitle}>
                                          {tip.title}
                                        </Text>
                                        <Ionicons
                                          name={
                                            open ? "chevron-up" : "chevron-down"
                                          }
                                          size={16}
                                          color="#9AA6A6"
                                        />
                                      </Pressable>
                                      {open &&
                                        (hasVisibleCmsContent(
                                          tip.detailsHtml || tip.details
                                        ) ? (
                                          <CmsRichText
                                            html={
                                              tip.detailsHtml || tip.details
                                            }
                                            baseStyle={styles.tipTxt}
                                            textAlign="left"
                                          />
                                        ) : tip.details ? (
                                          <Text style={styles.tipTxt}>
                                            {tip.details}
                                          </Text>
                                        ) : null)}
                                    </View>
                                  );
                                })}
                                {hasSample && (
                                  <View style={styles.tipCard}>
                                    <Pressable
                                      onPress={() =>
                                        setOpenTipId((x) =>
                                          x === sampleTipId ? null : sampleTipId
                                        )
                                      }
                                      style={styles.tipHead}
                                    >
                                      <Text style={styles.tipTitle}>
                                        {sampleTipTitle}
                                      </Text>
                                      <Ionicons
                                        name={
                                          openTipId === sampleTipId
                                            ? "chevron-up"
                                            : "chevron-down"
                                        }
                                        size={16}
                                        color="#9AA6A6"
                                      />
                                    </Pressable>
                                    {openTipId === sampleTipId && (
                                      <Pressable
                                        onPress={() => {
                                          const uri =
                                            r.sampleDocumentImage!.trim();
                                          setSamplePreview({
                                            kind: "remote",
                                            uri,
                                          });
                                          setSampleTitle(sampleTipTitle);
                                          setSampleOpen(true);
                                        }}
                                      >
                                        <ExpoImage
                                          source={{
                                            uri: r.sampleDocumentImage!.trim(),
                                          }}
                                          style={styles.tipImg}
                                          contentFit="contain"
                                        />
                                      </Pressable>
                                    )}
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        )}
                        {idx < requirementsList.length - 1 && (
                          <View style={styles.divider} />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {steps.length > 0 && (
              <>
                {steps.map((step, si) => (
                  <View key={step.id} style={styles.stepCard}>
                    <Text style={styles.stepMeta}>
                      Step {si + 1} of {steps.length}
                    </Text>
                    <Text style={styles.prompt}>{step.prompt}</Text>
                    {step.options.map((opt, oi) => {
                      const sel = selections[step.id] === opt.value;
                      const last = oi === step.options.length - 1;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() =>
                            setSelections((p) => ({
                              ...p,
                              [step.id]: opt.value,
                            }))
                          }
                          style={[styles.radioRow, last && styles.radioLast]}
                        >
                          <View
                            style={[
                              styles.radioOut,
                              sel && styles.radioOutOn,
                            ]}
                          >
                            {sel ? <View style={styles.radioIn} /> : null}
                          </View>
                          <Text style={styles.radioLbl}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={goNext}
              disabled={!canContinue}
              style={[
                styles.apply,
                !canContinue && styles.applyOff,
              ]}
            >
              <Text style={[styles.applyTxt, !canContinue && styles.applyTxtOff]}>
                {details?.applyLabel || "Continue"}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <Modal visible={sampleOpen} transparent animationType="fade">
        <SafeAreaView style={styles.sampleOv}>
          <View style={styles.sampleHdr}>
            <Text style={styles.sampleHdrTxt} numberOfLines={1}>
              {sampleTitle}
            </Text>
            <Pressable
              onPress={() => {
                setSampleOpen(false);
                setSamplePreview(null);
              }}
              hitSlop={12}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </Pressable>
          </View>
          <Pressable
            style={styles.sampleBody}
            onPress={() => {
              setSampleOpen(false);
              setSamplePreview(null);
            }}
          >
            {samplePreview?.kind === "remote" ? (
              <ExpoImage
                source={{ uri: samplePreview.uri }}
                style={styles.sampleImg}
                contentFit="contain"
              />
            ) : samplePreview?.kind === "local" ? (
              <Image
                source={samplePreview.source}
                style={styles.sampleImg}
                resizeMode="contain"
              />
            ) : null}
          </Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFF" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  err: { fontFamily: FONT, color: TEXT_DARK, textAlign: "center" },
  retry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: TEAL, borderRadius: 20 },
  retryTxt: { color: "#FFF", fontWeight: "700" },
  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EDED",
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 16,
    color: TEXT_DARK,
  },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8F1F1",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  cardStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#EAFBFB",
    borderWidth: 1,
    borderColor: "#D8F1F1",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 28, height: 28 },
  svcTitle: { fontFamily: FONT, fontWeight: "700", fontSize: 14, color: TEXT_DARK },
  svcDesc: { marginTop: 2, fontFamily: FONT, fontSize: 11.5, color: TEXT_MUTED },
  secTitle: { marginTop: 16, fontFamily: FONT, fontWeight: "700", fontSize: 13, color: TEXT_DARK },
  secBody: { marginTop: 8, fontFamily: FONT, fontSize: 11, lineHeight: 16, color: TEXT_MUTED },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TEAL,
    marginTop: 6,
    marginRight: 10,
  },
  bulletTxt: { flex: 1, fontFamily: FONT, fontSize: 12, color: TEXT_DARK },
  reminderHdr: {
    marginTop: 18,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: "600",
    color: DANGER,
    fontSize: 20,
  },
  reminderBox: {
    marginTop: 10,
    backgroundColor: "#FBE1E1",
    borderRadius: 12,
    padding: 14,
  },
  reminderTxt: {
    textAlign: "center",
    fontFamily: FONT,
    fontSize: 11,
    lineHeight: 16,
    color: "#D94B4B",
  },
  reqShadow: { marginTop: 12, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  reqWrap: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    overflow: "hidden",
    backgroundColor: "#FFF",
  },
  reqHead: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#F6FEFE" },
  reqHeadTxt: { fontFamily: FONT, fontWeight: "800", fontSize: 13, color: TEXT_DARK },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reqLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  reqTitle: { fontFamily: FONT, fontWeight: "600", fontSize: 13, color: TEXT_DARK },
  reqDet: { paddingHorizontal: 14, paddingBottom: 12, backgroundColor: "#FAFAFA" },
  reqDetTxt: { fontFamily: FONT, fontSize: 12, color: TEXT_MUTED, lineHeight: 17 },
  tipCard: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4ECEC",
    padding: 10,
    backgroundColor: "#FFF",
  },
  tipHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tipTitle: { fontFamily: FONT, fontWeight: "700", fontSize: 12, color: TEXT_DARK },
  tipTxt: { marginTop: 6, fontFamily: FONT, fontSize: 11.5, color: TEXT_MUTED },
  tipImg: { marginTop: 8, width: "100%", height: 160 },
  divider: { height: 1, backgroundColor: "#EDF4F4", marginLeft: 14 },
  stepCard: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    padding: 14,
    backgroundColor: "#FFF",
  },
  stepMeta: { fontFamily: FONT, fontSize: 11, color: TEXT_MUTED, marginBottom: 6 },
  prompt: { fontFamily: FONT, fontWeight: "700", fontSize: 13, color: TEXT_DARK, marginBottom: 10 },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F4",
  },
  radioLast: { borderBottomWidth: 0 },
  radioOut: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#C5D5D5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioOutOn: { borderColor: TEAL },
  radioIn: { width: 10, height: 10, borderRadius: 5, backgroundColor: TEAL },
  radioLbl: { fontFamily: FONT, fontSize: 13, color: TEXT_DARK, flex: 1 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
    backgroundColor: "#FFF",
  },
  apply: {
    height: 50,
    borderRadius: 25,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  applyOff: { backgroundColor: "#DDEEEE" },
  applyTxt: { fontFamily: FONT, fontWeight: "700", fontSize: 15, color: "#FFF" },
  applyTxtOff: { color: "#B8CACA" },
  sampleOv: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  sampleHdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sampleHdrTxt: { flex: 1, color: "#FFF", fontWeight: "700", fontSize: 16 },
  sampleBody: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  sampleImg: {
    width: "100%",
    height: "100%",
  },
});
