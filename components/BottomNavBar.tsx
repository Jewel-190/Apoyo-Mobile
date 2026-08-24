import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, usePathname } from "expo-router";
import React, { useCallback, useRef } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSingleFlight } from "@/AppCore/UseInteractionGuard";
import { useNotifications } from "@/AppCore/NotificationsContext";

const TEAL_DARK = "#07807C";
const ACTIVE_PILL = "#6FB8B5";
const TAB_INACTIVE = "#BFE0DE";
const FONT = "SF Pro Rounded";

const ROUTE_HOME = "/Home/Home";
const ROUTE_STATUS = "/Status/Status";
const ROUTE_NOTIF = "/Notification/Notifications";
const ROUTE_ACCOUNT = "/Account/Account";

export const NAV_BAR_HEIGHT = 64;
export const IOS_SAFE_EXTRA = Platform.OS === "ios" ? 18 : 0;
export const NAV_TOTAL_HEIGHT = NAV_BAR_HEIGHT + IOS_SAFE_EXTRA;

export type TabKey = "home" | "status" | "notification" | "account";

export function isMainTabPath(pathname: string): boolean {
  const current = normalizePath(pathname);
  return TABS.some((t) => normalizePath(t.route) === current);
}

export function tabMaskColor(pathname: string): string {
  return normalizePath(pathname) === normalizePath(ROUTE_ACCOUNT)
    ? "#FFFFFF"
    : "transparent";
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "").trim().toLowerCase() || "/";
}

/** True when the user is already on this tab's root screen. */
function isTabRouteActive(pathname: string, route: string): boolean {
  const current = normalizePath(pathname);
  const target = normalizePath(route);
  if (current === target) return true;
  const leaf = target.split("/").filter(Boolean).pop();
  if (!leaf) return false;
  return current.endsWith(`/${leaf}`) || current === `/${leaf}`;
}

const TABS: {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}[] = [
  { key: "home", label: "HOME", icon: "home", route: ROUTE_HOME },
  { key: "status", label: "STATUS", icon: "stats-chart", route: ROUTE_STATUS },
  { key: "notification", label: "NOTIFICATION", icon: "notifications", route: ROUTE_NOTIF },
  { key: "account", label: "ACCOUNT", icon: "person", route: ROUTE_ACCOUNT },
];

type Props = {
  /** Which tab is currently active (optional - auto-detected from pathname if not provided) */
  activeTab?: TabKey;
  /** Optional callback before navigation - return false to prevent navigation */
  onBeforeNavigate?: (tabKey: TabKey, route: string) => boolean;
  /** Background color for the mask (defaults to #FFFFFF) */
  maskColor?: string;
};

export default React.memo(function BottomNavBar({
  activeTab,
  onBeforeNavigate,
  maskColor = "#FFFFFF",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const lastNavAtRef = useRef(0);
  const { inFlight: tabNavBusy, run: runTabNav } = useSingleFlight();
  const { hasUnread } = useNotifications();

  const currentTab =
    activeTab ??
    TABS.find((t) => isTabRouteActive(pathname, t.route))?.key ??
    "home";

  const handlePress = useCallback(
    (tab: (typeof TABS)[number]) => {
      if (tabNavBusy) return;
      if (isTabRouteActive(pathname, tab.route)) return;

      const now = Date.now();
      if (now - lastNavAtRef.current < 400) return;
      lastNavAtRef.current = now;

      void runTabNav(async () => {
        if (onBeforeNavigate && !onBeforeNavigate(tab.key, tab.route)) {
          return;
        }
        if (isTabRouteActive(pathname, tab.route)) return;
        router.replace(tab.route as never);
      });
    },
    [onBeforeNavigate, pathname, router, runTabNav, tabNavBusy]
  );

  const showNotificationBadge = hasUnread && currentTab !== "notification";

  return (
    <>
      <View pointerEvents="none" style={[styles.bottomMask, { backgroundColor: maskColor }]} />
      <View style={styles.bottomWrap}>
        <View style={styles.bottomBar}>
          {TABS.map((tab) => (
            <TabButton
              key={tab.key}
              label={tab.label}
              icon={tab.icon}
              active={currentTab === tab.key}
              disabled={tabNavBusy}
              showUnreadBadge={tab.key === "notification" && showNotificationBadge}
              onPress={() => handlePress(tab)}
            />
          ))}
        </View>
      </View>
    </>
  );
});

function TabButton({
  label,
  icon,
  active,
  disabled,
  showUnreadBadge,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  disabled?: boolean;
  showUnreadBadge?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.tabBtn, disabled && styles.tabBtnDisabled]}
    >
      {({ pressed }) => (
        <>
          {showUnreadBadge ? (
            <View style={styles.tabUnreadBadge}>
              <Text style={styles.tabUnreadBadgeText}>!</Text>
            </View>
          ) : null}

          {active ? (
            <View
              style={[
                styles.tabActivePillBig,
                pressed && styles.tabActivePillPressed,
              ]}
            >
              <LinearGradient
                colors={["rgba(255,255,255,0.26)", "rgba(255,255,255,0.10)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.glassFill}
              />
              <LinearGradient
                colors={["rgba(255,255,255,0.42)", "rgba(255,255,255,0.00)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.glassSheen}
              />
              <Ionicons name={icon} size={20} color="#FFFFFF" />
              <Text numberOfLines={1} style={styles.tabTextInsidePill}>{label}</Text>
            </View>
          ) : (
            <>
              <Ionicons
                name={icon}
                size={22}
                color={pressed ? "rgba(191,224,222,0.75)" : TAB_INACTIVE}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  styles.tabTextInactive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {label}
              </Text>
            </>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bottomMask: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: NAV_TOTAL_HEIGHT + 40,
    // backgroundColor is set dynamically via maskColor prop
  },
  bottomWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    paddingHorizontal: 10,
    paddingBottom: IOS_SAFE_EXTRA,
  },
  bottomBar: {
    height: NAV_BAR_HEIGHT,
    backgroundColor: TEAL_DARK,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 58,
  },
  tabBtnDisabled: {
    opacity: 0.65,
  },
  tabUnreadBadge: {
    position: "absolute",
    top: 2,
    left: 10,
    width: 20,
    height: 20,
    borderRadius: 99,
    backgroundColor: "#E13B3B",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  tabUnreadBadgeText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontWeight: "800",
    fontSize: 14,
    lineHeight: 16,
  },
  tabActivePillBig: {
    alignSelf: "stretch",
    marginHorizontal: 2,
    height: 52,
    borderRadius: 12,
    backgroundColor: ACTIVE_PILL,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    gap: 2,
  },
  tabActivePillPressed: { transform: [{ scale: 0.98 }], opacity: 0.95 },
  glassFill: { ...StyleSheet.absoluteFillObject, borderRadius: 12 },
  glassSheen: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 20,
    borderRadius: 12,
  },
  tabTextInsidePill: {
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  tabText: { fontSize: 14, fontFamily: FONT, fontWeight: "700", letterSpacing: -0.3 },
  tabTextInactive: { color: TAB_INACTIVE },
});
