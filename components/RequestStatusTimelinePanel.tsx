import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ServiceStatus } from "@/AppCore/AppUiDomainTypes";
import { ASSISTANCE_REQUESTS_TABLE } from "@/AppCore/AssistanceRequestSql";
import {
  formatTimelineDate,
  formatTimelineTime,
  type RequestTimelineStep,
} from "@/AppCore/RequestStatusTimeline";
import {
  STATUS_TIMELINE_PROGRESS_ACCENT,
  statusTimelineActionLinkTheme,
  statusTimelineDotTheme,
} from "@/AppCore/RequestStatusPresentation";
import { COLORS, FONT_FAMILY_ROUNDED } from "@/AppCore/Theme";

const FONT = FONT_FAMILY_ROUNDED;
const TEXT_DARK = COLORS.textDark;
const TEXT_MUTED = COLORS.textMuted;

export function RequestStatusTimelinePanel({
  steps,
  showActionRequiredLink,
  actionRequiredParams,
}: {
  steps: RequestTimelineStep[];
  showActionRequiredLink?: boolean;
  actionRequiredParams?: {
    requestId: string;
    title?: string;
    service?: string;
    requestCode?: string;
  };
}) {
  const router = useRouter();
  const timelineActionLink = statusTimelineActionLinkTheme();
  const currentStepIndex = 0;

  return (
    <View style={styles.progressPanel}>
      {steps.map((step, index) => {
        const isCurrent = index === currentStepIndex;
        const isCompleted = index > currentStepIndex;
        const stepTheme = statusTimelineDotTheme(step.title as ServiceStatus);

        return (
          <View key={step.key} style={styles.progressRow}>
            <View style={styles.progressTrackCol}>
              <View
                style={[
                  styles.progressDot,
                  isCompleted && styles.progressDotActive,
                  isCurrent && {
                    borderColor: stepTheme.bg,
                    borderWidth: 6,
                    backgroundColor: "#FFFFFF",
                  },
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : isCurrent && step.statusRaw === "action required" ? (
                  <Ionicons name="alert" size={11} color={stepTheme.bg} />
                ) : null}
              </View>
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.progressLine,
                    index >= currentStepIndex && styles.progressLineActive,
                  ]}
                />
              ) : null}
            </View>

            <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>{step.title}</Text>
              <Text style={styles.progressDesc}>{step.description}</Text>
              <Text style={styles.progressTime}>
                {step.timestamp
                  ? `${formatTimelineDate(step.timestamp)} • ${formatTimelineTime(step.timestamp)}`
                  : "Waiting for update"}
              </Text>

              {showActionRequiredLink &&
              isCurrent &&
              step.statusRaw === "action required" &&
              actionRequiredParams?.requestId ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/Status/ActionRequiredDetails",
                      params: {
                        id: actionRequiredParams.requestId,
                        requestTable: ASSISTANCE_REQUESTS_TABLE,
                        title: actionRequiredParams.title || "",
                        service: actionRequiredParams.service || "",
                        requestCode: actionRequiredParams.requestCode || "",
                      },
                    } as never)
                  }
                  style={({ pressed }) => [
                    styles.timelineActionLinkWrap,
                    {
                      borderColor: timelineActionLink.border,
                      backgroundColor: timelineActionLink.background,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[
                      styles.timelineActionLink,
                      { color: timelineActionLink.text },
                    ]}
                  >
                    View Details
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={timelineActionLink.icon}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  progressPanel: {
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EEEE",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: "row",
    gap: 10,
  },
  progressTrackCol: {
    width: 24,
    alignItems: "center",
  },
  progressDot: {
    width: 18,
    height: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    backgroundColor: "#F7F7F7",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotActive: {
    borderColor: STATUS_TIMELINE_PROGRESS_ACCENT.completedDot,
    backgroundColor: STATUS_TIMELINE_PROGRESS_ACCENT.completedDot,
  },
  progressLine: {
    width: 2,
    flex: 1,
    minHeight: 30,
    backgroundColor: "#DADADA",
    marginTop: 4,
    marginBottom: 4,
  },
  progressLineActive: {
    backgroundColor: STATUS_TIMELINE_PROGRESS_ACCENT.completedLine,
  },
  progressCard: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#EEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  progressTitle: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
    color: TEXT_DARK,
  },
  progressDesc: {
    marginTop: 4,
    fontFamily: FONT,
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_MUTED,
  },
  progressTime: {
    marginTop: 6,
    fontFamily: FONT,
    fontWeight: "600",
    fontSize: 14,
    color: TEXT_DARK,
  },
  timelineActionLinkWrap: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  timelineActionLink: {
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 14,
  },
});
