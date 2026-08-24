import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CmsRichText } from "@/AppCore/CmsRichText";
import {
  fetchLegalSettings,
  getLegalPage,
  getLegalPageSections,
  legalPageHasContent,
  type LegalPageSlug,
  type LegalSection,
} from "@/AppCore/LegalSettings";

const FONT = Platform.select({ ios: "SF Pro Rounded", android: "System" })!;
const TEAL = "#008E8A";
const DARK = "#2B2B2B";
const SUB = "#8B8B8B";
const TEXT_BODY = "#2E3A3A";
const DANGER = "#E45454";
const EDGE_GAP = 8;

export function LegalReadOnlyModal({ slug }: { slug: LegalPageSlug }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const page = getLegalPage(slug);

  const [sections, setSections] = useState<LegalSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      try {
        const value = await fetchLegalSettings({ force });
        setSections(getLegalPageSections(value, slug));
      } catch {
        setError(
          "Unable to load this document. Check your connection and try again."
        );
        setSections([]);
      } finally {
        setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/Account/Account");
  };

  const overlayPadH = EDGE_GAP;
  const overlayPadTop = Math.max(insets.top, EDGE_GAP);
  const overlayPadBottom = Math.max(insets.bottom, EDGE_GAP);
  const contentWidth = Math.max(screenWidth - overlayPadH * 2 - 32, 240);
  const hasContent = legalPageHasContent(sections);
  const title = page?.title ?? "Legal";

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
              key={`${slug}_${index}_${section.heading}`}
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
  }, [contentWidth, error, hasContent, load, loading, page, sections, slug]);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          presentation: "transparentModal",
          animation: "fade",
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <StatusBar barStyle="light-content" />

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
                {title}
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
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            {body}
          </ScrollView>

          <View style={styles.footer} />
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#E9EDED",
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
});
