/**
 * Account presentation primitives.
 * Lives in `components/` (UI), not AppCore (data/logic).
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ROUTES } from "@/AppCore/AppRoutePaths";

export const ACCOUNT_FONT = "SF Pro Rounded";
export const ACCOUNT_TEAL = "#0B8F8B";
export const ACCOUNT_TEXT = "#2B2B2B";
export const ACCOUNT_MUTED = "#6B7A7A";
export const ACCOUNT_SECTION = "#8A9A9A";
export const ACCOUNT_CHEVRON = "#B0BABA";
export const ACCOUNT_BORDER = "#E6EEEE";
export const ACCOUNT_SURFACE = "#FFFFFF";
export const ACCOUNT_GRADIENT = ["#0B8F8B", "#6FB8B5", "#D4F3F2"] as const;
export const ACCOUNT_CARD_RADIUS = 14;
export const ACCOUNT_CARD_HEIGHT = 62;
export const ACCOUNT_ICON_SIZE = 36;
export const ACCOUNT_PILL_HEIGHT = 48;
export const ACCOUNT_PILL_RADIUS = 24;
export const ACCOUNT_H_PAD = 16;

export function AccountGradient() {
  return (
    <LinearGradient
      colors={[...ACCOUNT_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.gradient}
    />
  );
}

export function AccountSectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export type AccountMenuCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  subtitle?: string;
  soon?: boolean;
  onPress?: () => void;
};

export function AccountMenuCard({
  icon,
  iconColor,
  iconBg,
  label,
  subtitle,
  soon,
  onPress,
}: AccountMenuCardProps) {
  const enabled = Boolean(onPress) && !soon;

  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={({ pressed }) => [
        styles.menuCard,
        subtitle ? styles.menuCardTall : null,
        pressed && enabled && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
    >
      <View style={styles.menuLeft}>
        <View style={[styles.iconBubble, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.menuCopy}>
          <Text style={styles.menuLabel}>{label}</Text>
          {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
        </View>
      </View>
      {soon ? (
        <View style={styles.soonPill}>
          <Text style={styles.soonText}>Soon</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={ACCOUNT_CHEVRON} />
      )}
    </Pressable>
  );
}

export function AccountSurface({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function AccountField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldDivider} />
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function AccountPillButton({
  label,
  variant = "primary",
  disabled,
  block,
  onPress,
}: {
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  block?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.pill,
        block ? styles.pillBlock : styles.pillFlex,
        variant === "primary" ? styles.pillPrimary : styles.pillSecondary,
        (disabled || !onPress) && { opacity: 0.45 },
        pressed && onPress && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text
        style={
          variant === "primary" ? styles.pillPrimaryText : styles.pillSecondaryText
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AccountConfirmModal({
  visible,
  title,
  busy,
  busyText = "Please wait...",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  busy?: boolean;
  busyText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {busy ? (
            <Text style={styles.busyText}>{busyText}</Text>
          ) : (
            <>
              <Text style={styles.modalTitle}>{title}</Text>
              <View style={styles.modalBtnRow}>
                <AccountPillButton label="Yes" onPress={onConfirm} />
                <AccountPillButton
                  label="No"
                  variant="secondary"
                  onPress={onCancel}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function AccountPlaceholderPanel({
  icon = "construct-outline",
  title,
  body,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <AccountSurface style={styles.placeholderPanel}>
      <View style={styles.placeholderIcon}>
        <Ionicons name={icon} size={28} color={ACCOUNT_TEAL} />
      </View>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderBody}>{body}</Text>
    </AccountSurface>
  );
}

type AccountSubpageProps = {
  title: string;
  children: React.ReactNode;
  showHome?: boolean;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onBack?: () => void;
};

export function AccountSubpage({
  title,
  children,
  showHome = false,
  scroll = false,
  contentContainerStyle,
  onBack,
}: AccountSubpageProps) {
  const router = useRouter();

  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.subpageScroll, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.subpageFill}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (onBack ? onBack() : router.back())}
          style={({ pressed }) => [styles.sideBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={ACCOUNT_TEXT} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        {showHome ? (
          <Pressable
            onPress={() => router.push(ROUTES.home)}
            style={({ pressed }) => [styles.sideBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Go to Home"
          >
            <Ionicons name="home" size={22} color={ACCOUNT_TEAL} />
          </Pressable>
        ) : (
          <View style={styles.sideBtn} />
        )}
      </View>
      <AccountGradient />
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  gradient: { height: 3, width: "100%" },
  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 18,
    color: ACCOUNT_TEXT,
  },
  subpageFill: { flex: 1 },
  subpageScroll: {
    paddingHorizontal: ACCOUNT_H_PAD,
    paddingBottom: 40,
  },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 14,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_SECTION,
    letterSpacing: 0.8,
  },
  menuCard: {
    height: ACCOUNT_CARD_HEIGHT,
    backgroundColor: ACCOUNT_SURFACE,
    borderRadius: ACCOUNT_CARD_RADIUS,
    borderWidth: 1,
    borderColor: ACCOUNT_BORDER,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  menuCardTall: {
    height: undefined,
    minHeight: ACCOUNT_CARD_HEIGHT,
    paddingVertical: 12,
  },
  menuLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingRight: 10,
  },
  iconBubble: {
    width: ACCOUNT_ICON_SIZE,
    height: ACCOUNT_ICON_SIZE,
    borderRadius: ACCOUNT_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  menuCopy: { flex: 1 },
  menuLabel: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_TEAL,
  },
  menuSub: {
    marginTop: 2,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    color: ACCOUNT_MUTED,
  },
  soonPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EEF2F2",
  },
  soonText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 14,
    color: ACCOUNT_SECTION,
  },
  surface: {
    backgroundColor: ACCOUNT_SURFACE,
    borderRadius: ACCOUNT_CARD_RADIUS,
    borderWidth: 1,
    borderColor: ACCOUNT_BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  field: { paddingHorizontal: 4 },
  fieldDivider: {
    height: 1,
    backgroundColor: ACCOUNT_BORDER,
    marginBottom: 12,
  },
  fieldLabel: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "400",
    fontSize: 14,
    color: ACCOUNT_SECTION,
    marginBottom: 6,
  },
  fieldValue: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 14,
    color: ACCOUNT_TEAL,
    marginBottom: 18,
  },
  pill: {
    height: ACCOUNT_PILL_HEIGHT,
    borderRadius: ACCOUNT_PILL_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  pillFlex: { flex: 1 },
  pillBlock: { width: "100%" },
  pillPrimary: { backgroundColor: ACCOUNT_TEAL },
  pillSecondary: { backgroundColor: "#EDEDED" },
  pillPrimaryText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 15,
    color: "#FFFFFF",
  },
  pillSecondaryText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 15,
    color: ACCOUNT_TEAL,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    height: 150,
    backgroundColor: ACCOUNT_SURFACE,
    borderRadius: ACCOUNT_CARD_RADIUS,
    borderWidth: 1,
    borderColor: ACCOUNT_BORDER,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  modalTitle: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 18,
    color: ACCOUNT_TEAL,
    textAlign: "center",
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  busyText: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "600",
    fontSize: 16,
    color: ACCOUNT_TEAL,
    textAlign: "center",
  },
  placeholderPanel: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: "center",
  },
  placeholderIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DFF3F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  placeholderTitle: {
    fontFamily: ACCOUNT_FONT,
    fontWeight: "700",
    fontSize: 16,
    color: ACCOUNT_TEAL,
    textAlign: "center",
  },
  placeholderBody: {
    marginTop: 8,
    fontFamily: ACCOUNT_FONT,
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 20,
    color: ACCOUNT_MUTED,
    textAlign: "center",
  },
});
