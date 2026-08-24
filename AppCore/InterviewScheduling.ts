/**
 * Interview scheduling briefing from Superadmin CMS
 * (Service Settings → Interview Scheduling).
 *
 * Stored in `public.settings` as scope=admin, key=interview-scheduling.
 * Same shape as ApoyoAdmin `interviewScheduling.js`. Read-only on mobile.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";
import { supabase } from "./SupabaseClient";

export const INTERVIEW_SCHEDULING_SCOPE = "admin" as const;
export const INTERVIEW_SCHEDULING_KEY = "interview-scheduling" as const;
export const APPLICATION_NUMBER_STEP_ID = "application-number";
export const STEP_KIND_TEXT = "text" as const;
export const STEP_KIND_APPLICATION_NUMBER = "application_number" as const;

const MAX_STEPS = 10;
const MAX_TITLE = 80;
const MAX_SUBTITLE = 80;
const MAX_DAYS = 80;
const MAX_BODY = 400;
const CACHE_TTL_MS = 2 * 60 * 1000;

export type InterviewStepKind =
  | typeof STEP_KIND_TEXT
  | typeof STEP_KIND_APPLICATION_NUMBER;

export type InterviewSchedulingStep = {
  id: string;
  kind: InterviewStepKind;
  body: string;
};

export type InterviewOfficeHours = {
  days: string;
  start: string;
  end: string;
};

export type InterviewSchedulingValue = {
  title: string;
  subtitle: string;
  officeHours: InterviewOfficeHours;
  steps: InterviewSchedulingStep[];
};

export const INTERVIEW_SCHEDULING_DEFAULTS: InterviewSchedulingValue = {
  title: "Instructions",
  subtitle: "Applicant briefing",
  officeHours: {
    days: "Monday - Friday",
    start: "08:00",
    end: "17:00",
  },
  steps: [
    {
      id: "step-visit",
      kind: STEP_KIND_TEXT,
      body: "Visit the Socio-Economic and Multi-Purpose Building Barangay Burol Main, City of Dasmariñas, Cavite",
    },
    {
      id: APPLICATION_NUMBER_STEP_ID,
      kind: STEP_KIND_APPLICATION_NUMBER,
      body: "Present your Application Number:",
    },
    {
      id: "step-valid-id",
      kind: STEP_KIND_TEXT,
      body: "Bring one (1) Original Valid ID for verification.",
    },
  ],
};

let briefingMemory: InterviewSchedulingValue | null = null;
let briefingFetchedAtMs = 0;
let briefingInflight: Promise<InterviewSchedulingValue> | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clip(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clipBody(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function normalizeTimeHm(value: unknown): string {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTime12h(value: unknown): string {
  const hm = normalizeTimeHm(value);
  if (!hm) return "";
  const [hourRaw, minute] = hm.split(":").map(Number);
  const suffix = hourRaw >= 12 ? "PM" : "AM";
  const hour = hourRaw % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function defaultLockedStep(): InterviewSchedulingStep {
  return {
    id: APPLICATION_NUMBER_STEP_ID,
    kind: STEP_KIND_APPLICATION_NUMBER,
    body: INTERVIEW_SCHEDULING_DEFAULTS.steps[1].body,
  };
}

function normalizeStep(step: unknown): InterviewSchedulingStep {
  const src = isPlainObject(step) ? step : {};
  const kind =
    src.kind === STEP_KIND_APPLICATION_NUMBER || src.id === APPLICATION_NUMBER_STEP_ID
      ? STEP_KIND_APPLICATION_NUMBER
      : STEP_KIND_TEXT;
  if (kind === STEP_KIND_APPLICATION_NUMBER) {
    return {
      id: APPLICATION_NUMBER_STEP_ID,
      kind: STEP_KIND_APPLICATION_NUMBER,
      body: clipBody(src.body, MAX_BODY) || defaultLockedStep().body,
    };
  }
  return {
    id: String(src.id || "").trim() || `step-${Math.random().toString(36).slice(2, 10)}`,
    kind: STEP_KIND_TEXT,
    body: clipBody(src.body, MAX_BODY),
  };
}

function ensureApplicationNumberStep(
  steps: InterviewSchedulingStep[]
): InterviewSchedulingStep[] {
  const normalized: InterviewSchedulingStep[] = [];
  let locked: InterviewSchedulingStep | null = null;
  for (const step of steps) {
    if (step.kind === STEP_KIND_APPLICATION_NUMBER) {
      if (locked) continue;
      locked = step;
      normalized.push(step);
      continue;
    }
    normalized.push(step);
  }
  if (!locked) {
    const insertAt = Math.min(1, normalized.length);
    normalized.splice(insertAt, 0, defaultLockedStep());
  }
  while (normalized.length > MAX_STEPS) {
    const dropIndex = [...normalized]
      .map((step, index) => ({ step, index }))
      .reverse()
      .find((entry) => entry.step.kind === STEP_KIND_TEXT)?.index;
    if (dropIndex == null) break;
    normalized.splice(dropIndex, 1);
  }
  return normalized;
}

export function isApplicationNumberStep(step: InterviewSchedulingStep | null | undefined): boolean {
  return (
    step?.kind === STEP_KIND_APPLICATION_NUMBER ||
    step?.id === APPLICATION_NUMBER_STEP_ID
  );
}

export function normalizeInterviewScheduling(value: unknown): InterviewSchedulingValue {
  const src = isPlainObject(value) ? value : {};
  const hoursSrc = isPlainObject(src.officeHours) ? src.officeHours : {};
  const rawSteps = Array.isArray(src.steps)
    ? src.steps
    : INTERVIEW_SCHEDULING_DEFAULTS.steps;
  return {
    title: clip(src.title, MAX_TITLE) || INTERVIEW_SCHEDULING_DEFAULTS.title,
    subtitle: clip(src.subtitle, MAX_SUBTITLE) || INTERVIEW_SCHEDULING_DEFAULTS.subtitle,
    officeHours: {
      days:
        clip(hoursSrc.days, MAX_DAYS) || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.days,
      start:
        normalizeTimeHm(hoursSrc.start) || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.start,
      end: normalizeTimeHm(hoursSrc.end) || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.end,
    },
    steps: ensureApplicationNumberStep(rawSteps.map(normalizeStep)),
  };
}

export function formatOfficeHoursLabel(config: InterviewSchedulingValue): string {
  const hours = config.officeHours;
  const days = hours.days || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.days;
  const start =
    formatTime12h(hours.start) ||
    formatTime12h(INTERVIEW_SCHEDULING_DEFAULTS.officeHours.start);
  const end =
    formatTime12h(hours.end) ||
    formatTime12h(INTERVIEW_SCHEDULING_DEFAULTS.officeHours.end);
  return `Office Hours: ${days}, ${start} to ${end}.`;
}

async function readCachedBriefing(
  now: number
): Promise<InterviewSchedulingValue | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.interviewSchedulingCache);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      value?: unknown;
      fetchedAtMs?: number;
    };
    if (
      typeof parsed.fetchedAtMs !== "number" ||
      now - parsed.fetchedAtMs >= CACHE_TTL_MS
    ) {
      return null;
    }
    return normalizeInterviewScheduling(parsed.value);
  } catch {
    return null;
  }
}

export async function fetchInterviewScheduling(options?: {
  force?: boolean;
}): Promise<InterviewSchedulingValue> {
  const force = options?.force === true;
  const now = Date.now();

  if (
    !force &&
    briefingMemory &&
    now - briefingFetchedAtMs < CACHE_TTL_MS
  ) {
    return briefingMemory;
  }

  if (briefingInflight) return briefingInflight;

  briefingInflight = (async () => {
    if (!force) {
      const cached = await readCachedBriefing(now);
      if (cached) {
        briefingMemory = cached;
        briefingFetchedAtMs = now;
        return cached;
      }
    }

    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("scope", INTERVIEW_SCHEDULING_SCOPE)
      .eq("key", INTERVIEW_SCHEDULING_KEY)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    const value = normalizeInterviewScheduling(data?.value);
    briefingMemory = value;
    briefingFetchedAtMs = Date.now();
    await AsyncStorage.setItem(
      STORAGE_KEYS.interviewSchedulingCache,
      JSON.stringify({ value, fetchedAtMs: briefingFetchedAtMs })
    );
    return value;
  })();

  try {
    return await briefingInflight;
  } finally {
    briefingInflight = null;
  }
}
