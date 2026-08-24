/**
 * Official contact channels from Superadmin CMS
 * (Content Management → Web → About → Official channels).
 *
 * Source of truth: `web_content.about.channels`, served only through the
 * public `web` edge function (`public.get`) so the app sees the same
 * canonical payload as ApoyoWeb.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";
import { cmsHtmlPlainText, hasVisibleCmsContent } from "./CmsRichText";
import { supabase } from "./SupabaseClient";

export const CHANNEL_KINDS = ["text", "phone", "email", "link", "route"] as const;
export const CHANNEL_STYLES = ["card", "primary", "secondary"] as const;

export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export type ChannelStyle = (typeof CHANNEL_STYLES)[number];

export type OfficialChannelEntry = {
  kind: ChannelKind;
  label: string;
  body: string;
  href: string;
  style: ChannelStyle;
};

export type OfficialChannelGroup = {
  title: string;
  entries: OfficialChannelEntry[];
};

export type OfficialChannelsContent = {
  heading: string;
  intro: string;
  groups: OfficialChannelGroup[];
};

const CHANNELS_TTL_MS = 2 * 60 * 1000;

let channelsMemory: OfficialChannelsContent | null = null;
let channelsFetchedAtMs = 0;
let channelsInflight: Promise<OfficialChannelsContent> | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function isQuickLinksGroup(group: Record<string, unknown>): boolean {
  if (group.id === "quickLinks") return true;
  return /^quick\s*links$/i.test(str(group.title).trim());
}

function normalizeKind(value: unknown): ChannelKind {
  const kind = str(value);
  return (CHANNEL_KINDS as readonly string[]).includes(kind)
    ? (kind as ChannelKind)
    : "text";
}

function normalizeStyle(value: unknown): ChannelStyle {
  const style = str(value);
  return (CHANNEL_STYLES as readonly string[]).includes(style)
    ? (style as ChannelStyle)
    : "card";
}

function channelEntry(entry: unknown): OfficialChannelEntry {
  const rawObj = asRecord(entry);
  const raw = isPlainObject(rawObj.jsonb_build_object)
    ? asRecord(rawObj.jsonb_build_object)
    : rawObj;
  return {
    kind: normalizeKind(raw.kind),
    label: str(raw.label),
    body: str(raw.body),
    href: str(raw.href),
    style: normalizeStyle(raw.style),
  };
}

function entryHasContent(entry: OfficialChannelEntry): boolean {
  return Boolean(
    entry.label.trim() ||
      hasVisibleCmsContent(entry.body) ||
      entry.href.trim()
  );
}

function normalizeChannelGroup(group: unknown): OfficialChannelGroup | null {
  const src = asRecord(group);
  if (isQuickLinksGroup(src)) return null;
  const entries = (Array.isArray(src.entries) ? src.entries : [])
    .map(channelEntry)
    .filter(entryHasContent);
  const title = str(src.title).trim();
  if (!title && !entries.length) return null;
  return { title, entries };
}

export function normalizeOfficialChannels(raw: unknown): OfficialChannelsContent {
  const ch = asRecord(raw);
  const groups = (Array.isArray(ch.groups) ? ch.groups : [])
    .map(normalizeChannelGroup)
    .filter((group): group is OfficialChannelGroup => Boolean(group));
  return {
    heading: str(ch.heading),
    intro: str(ch.intro),
    groups,
  };
}

export function officialChannelsHasContent(
  value: OfficialChannelsContent | null | undefined
): boolean {
  if (!value) return false;
  return Boolean(
    hasVisibleCmsContent(value.heading) ||
      hasVisibleCmsContent(value.intro) ||
      value.groups.length > 0
  );
}

export function channelDisplayText(entry: OfficialChannelEntry): string {
  const body = cmsHtmlPlainText(entry.body);
  const label = entry.label.trim();
  const href = entry.href.trim();
  if (entry.style === "primary" || entry.style === "secondary") {
    return label || body || href;
  }
  return body || href || label;
}

function digitsTel(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function asHttpUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return "";
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) return `https://${raw}`;
  return raw;
}

/** Action URL for Linking, or null when the row is display-only. */
export function channelActionUrl(entry: OfficialChannelEntry): string | null {
  const href = entry.href.trim();
  const body = cmsHtmlPlainText(entry.body);
  if (entry.kind === "phone") {
    const tel = digitsTel(body || href);
    return tel ? `tel:${tel}` : null;
  }
  if (entry.kind === "email") {
    const email = (body || href).trim();
    if (!email) return null;
    return email.includes(":") ? email : `mailto:${email}`;
  }
  if (entry.kind === "link") {
    const url = asHttpUrl(href || body);
    return url || null;
  }
  if (entry.kind === "route") return null;
  return null;
}

async function readCachedChannels(
  now: number,
  opts?: { allowStale?: boolean }
): Promise<OfficialChannelsContent | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.officialChannelsCache);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      value?: unknown;
      fetchedAtMs?: number;
    };
    if (
      !opts?.allowStale &&
      (typeof parsed.fetchedAtMs !== "number" ||
        now - parsed.fetchedAtMs >= CHANNELS_TTL_MS)
    ) {
      return null;
    }
    return normalizeOfficialChannels(parsed.value);
  } catch {
    return null;
  }
}

async function fetchOfficialChannelsNetwork(): Promise<OfficialChannelsContent> {
  const { data, error } = await supabase.functions.invoke("web", {
    body: { action: "public.get" },
  });
  if (error) throw error;
  const payload = asRecord(data);
  if (payload.success === false) {
    throw new Error(str(payload.error) || "Failed to load official channels.");
  }
  const pages = asRecord(payload.pages);
  const about = asRecord(pages.about);
  return normalizeOfficialChannels(about.channels);
}

export async function fetchOfficialChannels(options?: {
  force?: boolean;
}): Promise<OfficialChannelsContent> {
  const force = options?.force === true;
  const now = Date.now();

  if (
    !force &&
    channelsMemory &&
    now - channelsFetchedAtMs < CHANNELS_TTL_MS
  ) {
    return channelsMemory;
  }

  if (channelsInflight) return channelsInflight;

  channelsInflight = (async () => {
    if (!force) {
      const cached = await readCachedChannels(now);
      if (cached) {
        channelsMemory = cached;
        channelsFetchedAtMs = now;
        return cached;
      }
    }

    const value = await fetchOfficialChannelsNetwork().catch(async (err) => {
      const stale = await readCachedChannels(now, { allowStale: true });
      if (stale && officialChannelsHasContent(stale)) {
        channelsMemory = stale;
        channelsFetchedAtMs = now;
        return stale;
      }
      throw err;
    });
    channelsMemory = value;
    channelsFetchedAtMs = Date.now();
    await AsyncStorage.setItem(
      STORAGE_KEYS.officialChannelsCache,
      JSON.stringify({
        value: {
          heading: value.heading,
          intro: value.intro,
          groups: value.groups,
        },
        fetchedAtMs: channelsFetchedAtMs,
      })
    );
    return value;
  })();

  try {
    return await channelsInflight;
  } finally {
    channelsInflight = null;
  }
}
