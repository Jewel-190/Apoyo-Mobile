/**
 * CMS rich-text typography — mirrors ApoyoAdmin `editorFonts` + `cms_metadata`.
 */

import { Platform } from "react-native";

export type CmsServiceFonts = {
  descriptionFontFamily: string;
  aboutFontFamily: string;
  reminderFontFamily: string;
};

/** Admin `defaultEditorFont` / `editorFonts[0].value`. */
export const CMS_DEFAULT_FONT_STACK =
  "Inter, ui-sans-serif, system-ui, sans-serif";

export function parseCmsMetadata(raw: unknown): CmsServiceFonts {
  const meta =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const pick = (key: keyof CmsServiceFonts) => {
    const v = meta[key];
    return typeof v === "string" && v.trim() ? v.trim() : CMS_DEFAULT_FONT_STACK;
  };
  return {
    descriptionFontFamily: pick("descriptionFontFamily"),
    aboutFontFamily: pick("aboutFontFamily"),
    reminderFontFamily: pick("reminderFontFamily"),
  };
}

function primaryFontKey(stack: string): string {
  const first = stack.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  return first.toLowerCase();
}

const REGULAR: Record<string, string> = {
  inter: "Inter_400Regular",
  arial: Platform.select({ ios: "Arial", android: "sans-serif" }) ?? "Arial",
  georgia: "Georgia",
  "times new roman": Platform.select({ ios: "Times New Roman", android: "serif" }) ?? "serif",
  "courier new": Platform.select({ ios: "Courier New", android: "monospace" }) ?? "monospace",
};

const BOLD: Record<string, string> = {
  inter: "Inter_700Bold",
  arial: Platform.select({ ios: "Arial-BoldMT", android: "sans-serif-medium" }) ?? "Arial",
  georgia: Platform.select({ ios: "Georgia-Bold", android: "serif" }) ?? "Georgia",
  "times new roman": Platform.select({
    ios: "TimesNewRomanPS-BoldMT",
    android: "serif",
  }) ?? "serif",
  "courier new": Platform.select({ ios: "Courier-Bold", android: "monospace" }) ?? "monospace",
};

const ITALIC: Record<string, string> = {
  inter: "Inter_400Regular_Italic",
  arial: Platform.select({ ios: "Arial-ItalicMT", android: "sans-serif" }) ?? "Arial",
  georgia: Platform.select({ ios: "Georgia-Italic", android: "serif" }) ?? "Georgia",
  "times new roman": Platform.select({
    ios: "TimesNewRomanPS-ItalicMT",
    android: "serif",
  }) ?? "serif",
  "courier new": Platform.select({ ios: "Courier-Oblique", android: "monospace" }) ?? "monospace",
};

const FALLBACK_REGULAR =
  Platform.select({ ios: "System", android: "sans-serif" }) ?? "sans-serif";

export function resolveNativeFontFamily(stack?: string | null): string {
  const key = primaryFontKey(stack || CMS_DEFAULT_FONT_STACK);
  return REGULAR[key] ?? FALLBACK_REGULAR;
}

export function resolveNativeBoldFontFamily(stack?: string | null): string {
  const key = primaryFontKey(stack || CMS_DEFAULT_FONT_STACK);
  return BOLD[key] ?? resolveNativeFontFamily(stack);
}

export function resolveNativeItalicFontFamily(stack?: string | null): string {
  const key = primaryFontKey(stack || CMS_DEFAULT_FONT_STACK);
  return ITALIC[key] ?? resolveNativeFontFamily(stack);
}

/** Font names registered with expo-font + platform faces for RenderHTML inline CSS. */
export function cmsRegisteredSystemFonts(): string[] {
  return [
    "Inter_400Regular",
    "Inter_400Regular_Italic",
    "Inter_600SemiBold",
    "Inter_700Bold",
    "Arial",
    "Arial-BoldMT",
    "Arial-ItalicMT",
    "Georgia",
    "Georgia-Bold",
    "Georgia-Italic",
    "Times New Roman",
    "TimesNewRomanPS-BoldMT",
    "TimesNewRomanPS-ItalicMT",
    "Courier New",
    "Courier-Bold",
    "Courier-Oblique",
    "System",
    "sans-serif",
    "sans-serif-medium",
    "serif",
    "monospace",
  ];
}
