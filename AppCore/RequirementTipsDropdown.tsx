/**
 * Collapsible requirement tips — shared by RequestFields and ActionRequiredDetails.
 * Renders CMS tip HTML and optional sample document (RequestInfo parity).
 */

import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CmsRichText,
  hasVisibleCmsContent,
} from "./CmsRichText";
import type { RequirementTipItem } from "./ServiceRequirementFieldTypes";
import { COLORS, FONT_FAMILY_ROUNDED } from "./Theme";

export type RequirementTipsDropdownProps = {
  tips: RequirementTipItem[];
  sampleDocumentImage?: string;
  /** Label for the sample row (RequestInfo uses "Sample document"). */
  sampleDocumentTitle?: string;
  onOpenSample?: (uri: string, title: string) => void;
};

export function RequirementTipsDropdown({
  tips,
  sampleDocumentImage,
  sampleDocumentTitle = "Sample document",
  onOpenSample,
}: RequirementTipsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [openTipId, setOpenTipId] = useState<string | null>(null);

  const sampleUri = (sampleDocumentImage || "").trim();
  const hasSample = !!sampleUri;
  const hasTips = tips.length > 0;

  if (!hasTips && !hasSample) return null;

  const sampleTipId = "__sample-document__";

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => [styles.head, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityLabel="Show requirement tips"
        >
          <Text style={styles.headText}>Tips for this requirement</Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color="#A0A7A7"
          />
        </Pressable>

        {open ? (
          <View style={styles.body}>
            {tips.map((tip, idx) => {
              const sid = tip.id || `${tip.title}-${idx}`;
              const expanded = openTipId === sid;
              const bodyHtml = (tip.detailsHtml || tip.details || "").trim();

              return (
                <View key={sid} style={styles.tipCard}>
                  <Pressable
                    onPress={() => setOpenTipId((x) => (x === sid ? null : sid))}
                    style={styles.tipHead}
                  >
                    <Text style={styles.tipTitle}>{tip.title}</Text>
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#9AA6A6"
                    />
                  </Pressable>
                  {expanded &&
                    (hasVisibleCmsContent(bodyHtml) ? (
                      <CmsRichText
                        html={bodyHtml}
                        baseStyle={styles.tipTxt}
                        textAlign="left"
                      />
                    ) : tip.details ? (
                      <Text style={styles.tipTxt}>{tip.details}</Text>
                    ) : null)}
                </View>
              );
            })}

            {hasSample ? (
              <View style={styles.tipCard}>
                <Pressable
                  onPress={() =>
                    setOpenTipId((x) => (x === sampleTipId ? null : sampleTipId))
                  }
                  style={styles.tipHead}
                >
                  <Text style={styles.tipTitle}>{sampleDocumentTitle}</Text>
                  <Ionicons
                    name={openTipId === sampleTipId ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#9AA6A6"
                  />
                </Pressable>
                {openTipId === sampleTipId ? (
                  <Pressable
                    onPress={() => onOpenSample?.(sampleUri, sampleDocumentTitle)}
                    disabled={!onOpenSample}
                    style={({ pressed }) => pressed && { opacity: 0.92 }}
                  >
                    <ExpoImage
                      source={{ uri: sampleUri }}
                      style={styles.tipImg}
                      contentFit="contain"
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 0,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7EEEE",
    overflow: "hidden",
    backgroundColor: COLORS.white,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 11,
    backgroundColor: COLORS.white,
  },
  headText: {
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  body: {
    paddingHorizontal: 11,
    paddingBottom: 10,
    backgroundColor: "#FAFAFA",
  },
  tipCard: {
    marginTop: 8,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4ECEC",
    padding: 10,
  },
  tipHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tipTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  tipTxt: {
    marginTop: 8,
    fontFamily: FONT_FAMILY_ROUNDED,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textMuted,
  },
  tipImg: {
    marginTop: 8,
    width: "100%",
    height: 160,
    borderRadius: 8,
    backgroundColor: "#E8F4F4",
  },
});
