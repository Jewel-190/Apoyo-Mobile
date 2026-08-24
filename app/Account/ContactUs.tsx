import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { CmsRichText } from "@/AppCore/CmsRichText";
import {
  channelActionUrl,
  channelDisplayText,
  fetchOfficialChannels,
  officialChannelsHasContent,
  type OfficialChannelEntry,
  type OfficialChannelsContent,
} from "@/AppCore/OfficialChannels";
import {
  ACCOUNT_BORDER,
  ACCOUNT_FONT,
  ACCOUNT_MUTED,
  ACCOUNT_TEAL,
  ACCOUNT_TEXT,
  AccountPillButton,
  AccountSectionLabel,
  AccountSubpage,
  AccountSurface,
} from "@/components/AccountUi";

function iconForEntry(entry: OfficialChannelEntry): keyof typeof Ionicons.glyphMap {
  if (entry.kind === "phone") return "call-outline";
  if (entry.kind === "email") return "mail-outline";
  if (entry.kind === "link") {
    const dest = `${entry.href} ${entry.body}`.toLowerCase();
    if (dest.includes("facebook")) return "logo-facebook";
    return "globe-outline";
  }
  if (entry.kind === "route") return "map-outline";
  return "location-outline";
}

async function openChannel(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("Can't open this link", url);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't open this link", url);
  }
}

function ChannelCard({
  entry,
  contentWidth,
}: {
  entry: OfficialChannelEntry;
  contentWidth: number;
}) {
  const actionUrl = channelActionUrl(entry);
  const display = channelDisplayText(entry);
  const label = entry.label.trim();
  const useRichBody = entry.kind === "text" && Boolean(entry.body.trim());

  if (!display && !actionUrl) return null;

  if (entry.style === "primary" || entry.style === "secondary") {
    return (
      <View style={styles.pillWrap}>
        <AccountPillButton
          label={display || label}
          variant={entry.style === "primary" ? "primary" : "secondary"}
          block
          onPress={actionUrl ? () => void openChannel(actionUrl) : undefined}
        />
      </View>
    );
  }

  const inner = (
    <>
      <View style={styles.iconBubble}>
        <Ionicons name={iconForEntry(entry)} size={20} color={ACCOUNT_TEAL} />
      </View>
      <View style={styles.copy}>
        {label ? <Text style={styles.rowLabel}>{label}</Text> : null}
        {useRichBody ? (
          <CmsRichText
            html={entry.body}
            textAlign="left"
            contentWidth={contentWidth}
            baseStyle={styles.rowValue}
          />
        ) : (
          <Text style={styles.rowValue}>{display}</Text>
        )}
      </View>
      {actionUrl ? (
        <Ionicons name="chevron-forward" size={18} color="#B0BABA" />
      ) : null}
    </>
  );

  if (!actionUrl) {
    return <View style={styles.row}>{inner}</View>;
  }

  return (
    <Pressable
      onPress={() => void openChannel(actionUrl)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="link"
    >
      {inner}
    </Pressable>
  );
}

export default function ContactUs() {
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.max(screenWidth - 88, 220);

  const [channels, setChannels] = useState<OfficialChannelsContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const value = await fetchOfficialChannels({ force });
      setChannels(value);
    } catch {
      setError(
        "Unable to load official channels. Check your connection and try again."
      );
      setChannels(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const hasContent = officialChannelsHasContent(channels);

  return (
    <AccountSubpage
      title="Contact Us"
      scroll
      contentContainerStyle={styles.pagePad}
    >
      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={ACCOUNT_TEAL} size="large" />
          <Text style={styles.stateBody}>Loading official channels…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Could not load contacts</Text>
          <Text style={styles.stateBody}>{error}</Text>
          <Pressable
            onPress={() => void load(true)}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : !hasContent ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateTitle}>Not published yet</Text>
          <Text style={styles.stateBody}>
            Official channels have not been published in the CMS yet. Please try
            again later.
          </Text>
          <Pressable
            onPress={() => void load(true)}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {channels?.heading ? (
            <View style={styles.headingWrap}>
              <CmsRichText
                html={channels.heading}
                textAlign="left"
                contentWidth={contentWidth}
                baseStyle={styles.heading}
              />
            </View>
          ) : null}
          {channels?.intro ? (
            <View style={styles.introWrap}>
              <CmsRichText
                html={channels.intro}
                textAlign="left"
                contentWidth={contentWidth}
                baseStyle={styles.intro}
              />
            </View>
          ) : null}

          {channels?.groups.map((group, gi) => (
            <View key={`${group.title}-${gi}`}>
              {group.title ? (
                <AccountSectionLabel>{group.title.toUpperCase()}</AccountSectionLabel>
              ) : (
                <View style={styles.untitledGap} />
              )}
              <AccountSurface style={styles.group}>
                {group.entries.map((entry, ei) => (
                  <View
                    key={`${entry.kind}-${entry.label}-${ei}`}
                    style={ei > 0 ? styles.rowDivider : undefined}
                  >
                    <ChannelCard entry={entry} contentWidth={contentWidth} />
                  </View>
                ))}
              </AccountSurface>
            </View>
          ))}
        </>
      )}
    </AccountSubpage>
  );
}

const styles = StyleSheet.create({
  pagePad: {
    paddingHorizontal: 20,
    paddingTop: 5,
  },
  headingWrap: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  heading: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 24,
    color: ACCOUNT_TEXT,
  },
  introWrap: {
    marginTop: 8,
    marginBottom: 4,
  },
  intro: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20,
    color: ACCOUNT_MUTED,
  },
  untitledGap: {
    height: 16,
  },
  group: {
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    minHeight: 62,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: ACCOUNT_BORDER,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DFF3F2",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  rowLabel: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  rowValue: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_TEXT,
    lineHeight: 20,
  },
  pillWrap: {
    paddingVertical: 10,
  },
  stateWrap: {
    paddingTop: 48,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  stateTitle: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 16,
    color: ACCOUNT_TEXT,
    textAlign: "center",
  },
  stateBody: {
    marginTop: 8,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
    color: ACCOUNT_MUTED,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 16,
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: ACCOUNT_TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: ACCOUNT_TEAL,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 14,
  },
});
