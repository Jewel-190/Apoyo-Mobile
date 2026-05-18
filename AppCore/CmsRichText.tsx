/**
 * Renders CMS-authored HTML in React Native.
 * Fonts from `cms_metadata` + inline styles from the Admin contentEditable toolbar.
 */

import React, { useMemo } from "react";
import {
  Linking,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  useWindowDimensions,
  View,
} from "react-native";
import RenderHTML, {
  defaultSystemFonts,
  type MixedStyleDeclaration,
} from "react-native-render-html";

import {
  CMS_DEFAULT_FONT_STACK,
  cmsRegisteredSystemFonts,
  resolveNativeBoldFontFamily,
  resolveNativeFontFamily,
  resolveNativeItalicFontFamily,
} from "./CmsTypography";

export function hasHtmlMarkup(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Admin `markdownToHtml`. */
function cmsMarkdownToHtml(text: string): string {
  return escapeHtmlText(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/`([^`]+)`/g, '<code class="cms-code">$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2">$1</a>'
    )
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

/** Admin `normalizeRichTextHtml`. */
export function coerceCmsHtml(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (hasHtmlMarkup(raw)) return raw;
  return cmsMarkdownToHtml(raw);
}

export function hasVisibleCmsContent(value: string | null | undefined): boolean {
  return !!coerceCmsHtml(value);
}

export function cmsHtmlPlainText(value: string | null | undefined): string {
  const html = coerceCmsHtml(value);
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type CmsRichTextProps = {
  html: string | null | undefined;
  /** CSS `font-family` stack from `cms_metadata` (e.g. Inter, Arial). */
  fontFamily?: string | null;
  baseStyle?: StyleProp<TextStyle>;
  textAlign?: "left" | "center" | "right" | "auto";
  contentWidth?: number;
};

export function CmsRichText({
  html,
  fontFamily,
  baseStyle,
  textAlign = "center",
  contentWidth: contentWidthProp,
}: CmsRichTextProps) {
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = contentWidthProp ?? Math.max(screenWidth - 48, 240);

  const markup = useMemo(() => coerceCmsHtml(html), [html]);

  const stack = fontFamily?.trim() || CMS_DEFAULT_FONT_STACK;
  const bodyFont = resolveNativeFontFamily(stack);
  const boldFont = resolveNativeBoldFontFamily(stack);
  const italicFont = resolveNativeItalicFontFamily(stack);
  const monoFont = resolveNativeFontFamily('"Courier New", monospace');

  const systemFonts = useMemo(
    () => [...new Set([...defaultSystemFonts, ...cmsRegisteredSystemFonts()])],
    []
  );

  const tagsStyles = useMemo((): Record<string, MixedStyleDeclaration> => {
    const base = StyleSheet.flatten(baseStyle) as TextStyle | undefined;
    const color = base?.color ?? "#D94B4B";
    const fontSize = base?.fontSize ?? 11;
    const lineHeight = base?.lineHeight ?? 16;

    const inherited: MixedStyleDeclaration = {
      color,
      fontSize,
      lineHeight,
      fontFamily: bodyFont,
      textAlign,
    };

    return {
      body: {
        margin: 0,
        padding: 0,
        ...inherited,
        fontWeight: base?.fontWeight,
      },
      div: { ...inherited, marginBottom: 8 },
      p: { marginTop: 0, marginBottom: 8, ...inherited },
      span: inherited,
      ul: { marginTop: 4, marginBottom: 8, paddingLeft: 18, ...inherited },
      ol: { marginTop: 4, marginBottom: 8, paddingLeft: 18, ...inherited },
      li: { marginBottom: 4, textAlign: "left", ...inherited },
      strong: { fontFamily: boldFont, fontWeight: "700", color, fontSize, lineHeight },
      b: { fontFamily: boldFont, fontWeight: "700", color, fontSize, lineHeight },
      em: { fontFamily: italicFont, fontStyle: "italic", color, fontSize, lineHeight },
      i: { fontFamily: italicFont, fontStyle: "italic", color, fontSize, lineHeight },
      s: { textDecorationLine: "line-through", ...inherited },
      strike: { textDecorationLine: "line-through", ...inherited },
      del: { textDecorationLine: "line-through", ...inherited },
      u: { textDecorationLine: "underline", ...inherited },
      code: {
        fontFamily: monoFont,
        backgroundColor: "#F0F2F2",
        paddingHorizontal: 4,
        borderRadius: 4,
        color,
        fontSize,
      },
      a: { color: "#0B8F8B", textDecorationLine: "underline", ...inherited },
      h1: { fontFamily: boldFont, fontWeight: "700", fontSize: (fontSize as number) + 6, lineHeight: lineHeight + 8, color, marginBottom: 8 },
      h2: { fontFamily: boldFont, fontWeight: "700", fontSize: (fontSize as number) + 4, lineHeight: lineHeight + 6, color, marginBottom: 8 },
      h3: { fontFamily: boldFont, fontWeight: "700", fontSize: (fontSize as number) + 2, lineHeight: lineHeight + 4, color, marginBottom: 6 },
    };
  }, [baseStyle, textAlign, bodyFont, boldFont, italicFont, monoFont]);

  const classesStyles = useMemo(
    (): Record<string, MixedStyleDeclaration> => ({
      "cms-code": {
        fontFamily: monoFont,
        backgroundColor: "#F0F2F2",
        paddingHorizontal: 4,
        borderRadius: 4,
      },
      "font-mono": { fontFamily: monoFont },
      "font-semibold": { fontFamily: boldFont, fontWeight: "700" },
      "text-teal-700": { color: "#0B8F8B" },
      underline: { textDecorationLine: "underline" },
      "bg-slate-100": { backgroundColor: "#F0F2F2" },
      rounded: { borderRadius: 4 },
    }),
    [boldFont, monoFont]
  );

  if (!markup) return null;

  return (
    <View>
      <RenderHTML
        contentWidth={contentWidth}
        source={{ html: markup }}
        tagsStyles={tagsStyles}
        classesStyles={classesStyles}
        systemFonts={systemFonts}
        enableCSSInlineProcessing
        defaultTextProps={{ selectable: true }}
        renderersProps={{
          a: {
            onPress: (_event, href) => {
              if (href) void Linking.openURL(href).catch(() => {});
            },
          },
        }}
      />
    </View>
  );
}
