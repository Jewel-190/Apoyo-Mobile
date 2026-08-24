import { Platform } from "react-native";

/**
 * Centralized design tokens for the Apoyo app.
 *
 * Existing screens still reference these colors via local constants
 * (e.g. `const TEAL = "#0B8F8B"`). New screens should import from this
 * module so the app has a single source of truth for branding.
 *
 * Hex values below match the values currently used across the app and
 * MUST stay aligned with them to preserve the existing look.
 */

export const COLORS = {
  /** Primary brand teal used across most screens (Home, Status, Account, etc.). */
  teal: "#0B8F8B",
  /** Slightly darker teal used in the global StatusBar and Android nav bar. */
  tealDark: "#008E8A",
  /** Splash / index background teal. */
  tealSplash: "#008B88",
  /** Bottom nav bar background teal. */
  tealNav: "#07807C",
  /** Active pill color in the bottom nav bar. */
  tealActivePill: "#6FB8B5",
  /** Inactive icon/label color in the bottom nav bar. */
  tealInactive: "#BFE0DE",

  panel: "#F5F6F6",
  textDark: "#2B2B2B",
  textMuted: "#7B7B7B",

  white: "#FFFFFF",
  black: "#000000",

  danger: "#E13B3B",
} as const;

/** Standard primary gradient (used in Account / Settings / etc.). */
export const PRIMARY_GRADIENT: [string, string, string] = [
  "#0B8F8B",
  "#6FB8B5",
  "#D4F3F2",
];

/**
 * Default font family.
 *
 * iOS uses "SF Pro Rounded" (system rounded), Android falls back to its
 * platform default. Most existing screens still hardcode "SF Pro Rounded";
 * new code should prefer this helper so Android renders correctly.
 */
export const FONT_FAMILY: string = Platform.select({
  ios: "SF Pro Rounded",
  android: "System",
  default: "System",
}) as string;

/** Legacy iOS-only family for screens that explicitly want SF Pro Rounded. */
export const FONT_FAMILY_ROUNDED = "SF Pro Rounded";

/** Minimum readable body/UI text size. Do not use a smaller `fontSize` in screens. */
export const FONT_SIZE_MIN = 14;
