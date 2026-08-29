import { Ionicons } from "@expo/vector-icons";
import { CommonActions } from "@react-navigation/native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CmsRichText } from "@/AppCore/CmsRichText";
import {
  readLegalAcceptance,
  recordLegalPageAcceptance,
} from "@/AppCore/LegalAcceptance";
import {
  LEGAL_PAGES,
  fetchLegalSettings,
  getLegalPage,
  getLegalPageSections,
  legalContentFingerprint,
  legalPageHasContent,
  peekLegalSettings,
  type LegalPageSlug,
  type LegalSection,
  type LegalSettingsValue,
} from "@/AppCore/LegalSettings";

const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;
const TEAL = "#008E8A";
const DARK = "#2B2B2B";
const SUB = "#8B8B8B";
const TEXT_BODY = "#2E3A3A";
const DANGER = "#E45454";
const EDGE_GAP = 8;

const SCROLL_END_PAD = 48;

function isAcceptMode(mode: string | string[] | undefined): boolean {
  const value = Array.isArray(mode) ? mode[0] : mode;
  return value !== "view";
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function nextLegalSlug(slug: LegalPageSlug): LegalPageSlug | null {
  const index = LEGAL_PAGES.findIndex((page) => page.slug === slug);
  if (index < 0 || index >= LEGAL_PAGES.length - 1) return null;
  return LEGAL_PAGES[index + 1].slug;
}

export default function LegalDocumentScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ slug?: string; mode?: string }>();
  const routePage = getLegalPage(firstParam(params.slug));
  const acceptMode = isAcceptMode(params.mode);
  const [activeSlug, setActiveSlug] = useState<LegalPageSlug | null>(
    () => routePage?.slug ?? null
  );
  const page = getLegalPage(activeSlug);
  const cachedLegal = peekLegalSettings();

  const [settings, setSettings] = useState<LegalSettingsValue | null>(
    () => cachedLegal
  );
  const [fingerprint, setFingerprint] = useState(
    () => (cachedLegal ? legalContentFingerprint(cachedLegal) : "")
  );
  const [loading, setLoading] = useState(() => !cachedLegal);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);

  const pageIndex = page
    ? LEGAL_PAGES.findIndex((entry) => entry.slug === page.slug)
    : -1;
  const sections: LegalSection[] = page && settings
    ? getLegalPageSections(settings, page.slug)
    : [];
  const hasContent = legalPageHasContent(sections);
  const contentFits =
    viewportH > 0 && contentH > 0 && contentH <= viewportH + SCROLL_END_PAD;
  const canCheck = hasContent && !loading && !error && (reachedEnd || contentFits);
  const canContinue = acceptMode && agreed && canCheck && hasContent && !submitting;

  const noteIfContentFits = useCallback((viewport: number, content: number) => {
    if (viewport > 0 && content > 0 && content <= viewport + SCROLL_END_PAD) {
      setReachedEnd(true);
    }
  }, []);

  const load = useCallback(async (force = false) => {
    if (!routePage) return;
    if (force || !peekLegalSettings()) setLoading(true);
    setError("");
    try {
      const value = await fetchLegalSettings({ force });
      setSettings(value);
      setFingerprint(legalContentFingerprint(value));
    } catch {
      setError("Unable to load this document. Check your connection and try again.");
      setSettings(null);
      setFingerprint("");
    } finally {
      setLoading(false);
    }
  }, [routePage]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (routePage?.slug) setActiveSlug(routePage.slug);
  }, [routePage?.slug]);

  useEffect(() => {
    let cancelled = false;
    setAgreed(false);
    setReachedEnd(false);
    setContentH(0);
    contentHRef.current = 0;
    if (!page || !fingerprint) return;
    void (async () => {
      const existing = await readLegalAcceptance();
      if (cancelled) return;
      if (existing?.fingerprint === fingerprint && existing.pages[page.slug]) {
        setReachedEnd(true);
        setAgreed(true);
      } else {
        noteIfContentFits(viewportHRef.current, contentHRef.current);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, fingerprint, noteIfContentFits]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const atEnd =
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - SCROLL_END_PAD;
    if (atEnd) setReachedEnd(true);
  };

  const goBack = () => {
    if (acceptMode && pageIndex > 0) {
      setActiveSlug(LEGAL_PAGES[pageIndex - 1].slug);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/phase1/login");
  };

  const goToRegister = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: "phase1/login" }, { name: "phase1/register" }],
      })
    );
  };

  const onContinue = async () => {
    if (!page || !canContinue) return;
    setSubmitting(true);
    try {
      await recordLegalPageAcceptance(page.slug, fingerprint);
      const next = nextLegalSlug(page.slug);
      if (next) {
        setActiveSlug(next);
        return;
      }
      goToRegister();
    } finally {
      setSubmitting(false);
    }
  };

  const overlayPadH = EDGE_GAP;
  const overlayPadTop = Math.max(insets.top, EDGE_GAP);
  const overlayPadBottom = Math.max(insets.bottom, EDGE_GAP);
  const contentWidth = Math.max(screenWidth - overlayPadH * 2 - 32, 240);

  const body = useMemo(() => {
    if (!page) {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Document not found</Text>
          <Text style={styles.stateBody}>
            This legal page is not available in the app.
          </Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={TEAL} size="large" />
          <Text style={styles.loaderText}>Loading {page.title}…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Could not load document</Text>
          <Text style={styles.stateBody}>{error}</Text>
          <Pressable
            onPress={() => void load(true)}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (!hasContent) {
      return (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Not published yet</Text>
          <Text style={styles.stateBody}>
            {page.title} has not been published in Settings yet. Please try again
            later.
          </Text>
          <Pressable
            onPress={() => void load(true)}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.doc}>
        {sections.map((section, index) => {
          if (!section.heading.trim() && !section.body.trim()) return null;
          return (
            <View
              key={`${page.slug}_${index}_${section.heading}`}
              style={styles.section}
            >
              {section.heading.trim() ? (
                <Text style={styles.sectionHeading}>{section.heading.trim()}</Text>
              ) : null}
              {section.body.trim() ? (
                <CmsRichText
                  html={section.body}
                  textAlign="left"
                  contentWidth={contentWidth}
                  baseStyle={styles.sectionBody}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }, [contentWidth, error, hasContent, load, loading, page, sections]);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: overlayPadTop,
            paddingBottom: overlayPadBottom,
            paddingHorizontal: overlayPadH,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {page?.title ?? "Legal"}
              </Text>
              <Pressable
                onPress={goBack}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </Pressable>
            </View>

            {acceptMode && pageIndex >= 0 ? (
              <View style={styles.progressRow}>
                {LEGAL_PAGES.map((entry, index) => {
                  const active = index === pageIndex;
                  const done = index < pageIndex;
                  return (
                    <View key={entry.slug} style={styles.progressItem}>
                      <View
                        style={[
                          styles.progressDot,
                          (active || done) && styles.progressDotOn,
                        ]}
                      />
                      <Text
                        style={[
                          styles.progressLabel,
                          active && styles.progressLabelOn,
                        ]}
                        numberOfLines={1}
                      >
                        {entry.title}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          <ScrollView
            key={page?.slug ?? "legal"}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            onScroll={onScroll}
            scrollEventThrottle={16}
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              viewportHRef.current = height;
              setViewportH(height);
              noteIfContentFits(height, contentHRef.current);
            }}
            onContentSizeChange={(_w, h) => {
              contentHRef.current = h;
              setContentH(h);
              noteIfContentFits(viewportHRef.current, h);
            }}
          >
            {body}
          </ScrollView>

          {acceptMode && page && hasContent && !loading && !error ? (
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  if (!canCheck) return;
                  setAgreed((value) => !value);
                }}
                disabled={!canCheck}
                style={({ pressed }) => [
                  styles.checkboxRow,
                  pressed && canCheck && { opacity: 0.9 },
                  !canCheck && { opacity: 0.45 },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed, disabled: !canCheck }}
              >
                <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                  {agreed ? (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  ) : null}
                </View>
                <Text style={styles.checkboxText}>{page.acceptLabel}</Text>
              </Pressable>
              {!canCheck ? (
                <Text style={styles.scrollHint}>Scroll to the end to continue.</Text>
              ) : null}

              <Pressable
                onPress={() => void onContinue()}
                disabled={!canContinue}
                style={({ pressed }) => [
                  styles.continueBtn,
                  !canContinue && styles.continueBtnDisabled,
                  pressed && canContinue && { opacity: 0.92 },
                ]}
              >
                <Text style={styles.continueText}>
                  {submitting ? "Saving..." : "Agree and continue"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footer} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  card: {
    flex: 1,
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EDED",
  },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 16,
    color: DARK,
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
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    gap: 12,
  },
  progressItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D5DEDE",
  },
  progressDotOn: {
    backgroundColor: TEAL,
  },
  progressLabel: {
    flex: 1,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: SUB,
  },
  progressLabelOn: {
    color: TEAL,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    flexGrow: 1,
  },
  doc: { gap: 18 },
  section: { gap: 8 },
  sectionHeading: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
    color: DARK,
    lineHeight: 21,
  },
  sectionBody: {
    color: TEXT_BODY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT,
    fontWeight: "400",
  },
  stateWrap: {
    paddingTop: 40,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  stateTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 16,
    color: DARK,
    textAlign: "center",
  },
  stateBody: {
    marginTop: 8,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
    color: SUB,
    textAlign: "center",
  },
  loaderText: {
    marginTop: 12,
    fontFamily: FONT,
    fontSize: 14,
    color: SUB,
  },
  retryBtn: {
    marginTop: 16,
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: TEAL,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
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
    color: TEXT_BODY,
    lineHeight: 18,
  },
  scrollHint: {
    marginTop: 8,
    fontFamily: FONT,
    fontWeight: "500",
    fontSize: 14,
    color: SUB,
  },
  continueBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: { opacity: 0.45 },
  continueText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "800",
  },
});
