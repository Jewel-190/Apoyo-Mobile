/**
 * `assistance_categories.theme_json` is a single `#RRGGBB` accent in the database.
 * Gradients are derived here so Home, Status, Notifications, and future modules stay consistent.
 * Legacy JSON objects are still accepted when parsing cached bundles or during rollout.
 */

export type AssistanceCategoryTheme = {
  homeCardStripeGradient: [string, string];
  statusCardHeaderGradient: [string, string];
  homeChipActiveGradient: [string, string];
};

function isHex6(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isHex6(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function adjustHsl(hex: string, dh: number, ds: number, dl: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const o = hslToRgb(h + dh, s + ds, l + dl);
  return rgbToHex(o.r, o.g, o.b);
}

function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return a;
  return rgbToHex(
    A.r + (B.r - A.r) * t,
    A.g + (B.g - A.g) * t,
    A.b + (B.b - A.b) * t
  );
}

/** Fallback accent when the DB value is missing or invalid. */
export function defaultAccentHexForSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (s === "medical") return "#12B4D8";
  if (s === "financial") return "#F6D34D";
  if (s === "burial") return "#7C3AED";
  return "#6B7280";
}

function legacyGradientFirstStop(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length < 1) return null;
  const a = String(raw[0] ?? "").trim();
  return isHex6(a) ? a : null;
}

function readLegacyAccent(obj: Record<string, unknown>): string | null {
  const home =
    legacyGradientFirstStop(obj.home_card_stripe_gradient) ??
    legacyGradientFirstStop(obj.homeCardStripeGradient);
  if (home) return home;
  return (
    legacyGradientFirstStop(obj.status_card_header_gradient) ??
    legacyGradientFirstStop(obj.statusCardHeaderGradient)
  );
}

/** ApoyoAdmin `theme_json` text column: `{ primary, accent, ring, ... }`. */
function readCmsThemeBundleAccent(obj: Record<string, unknown>): string | null {
  for (const key of ["primary", "accent", "ring", "secondary", "tertiary"] as const) {
    const v = String(obj[key] ?? "").trim();
    if (isHex6(v)) return v;
  }
  return readLegacyAccent(obj);
}

/**
 * Reads a single stored accent (`#RRGGBB`) or the first stop of a legacy gradient object.
 */
export function parseThemeAccentFromDb(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (isHex6(t)) return t;
    if (t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return readCmsThemeBundleAccent(parsed as Record<string, unknown>);
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return readCmsThemeBundleAccent(raw as Record<string, unknown>);
  }
  return null;
}

/**
 * Builds full UI gradients from one catalog accent (used by all modules via `categoryThemeBySlug`).
 */
export function buildAssistanceCategoryTheme(
  slug: string,
  accentHex: string
): AssistanceCategoryTheme {
  const base = isHex6(accentHex.trim())
    ? accentHex.trim()
    : defaultAccentHexForSlug(slug);

  const s = slug.trim().toLowerCase();
  const stripeEnd =
    s === "financial" ? adjustHsl(base, 0, 4, -9) : adjustHsl(base, 0, 6, 10);

  const stripe: [string, string] = [base, stripeEnd];

  const statusStripe: [string, string] =
    s === "burial"
      ? [mixHex(base, "#FF2DF7", 0.42), mixHex(base, "#7B61FF", 0.52)]
      : stripe;

  return {
    homeCardStripeGradient: stripe,
    statusCardHeaderGradient: statusStripe,
    homeChipActiveGradient: stripe,
  };
}

export function parseAssistanceCategoryTheme(
  slug: string,
  themeJson: unknown
): AssistanceCategoryTheme {
  const accent =
    parseThemeAccentFromDb(themeJson) ?? defaultAccentHexForSlug(slug);
  return buildAssistanceCategoryTheme(slug, accent);
}
