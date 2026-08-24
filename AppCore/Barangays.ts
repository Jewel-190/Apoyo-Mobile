import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./SupabaseClient";
import { STORAGE_KEYS } from "./ClientStorageKeys";

export type BarangayOption = {
  id: string;
  name: string;
};

const BARANGAYS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let barangaysMemory: BarangayOption[] | null = null;
let barangaysFetchedAtMs = 0;
let barangaysInflight: Promise<BarangayOption[]> | null = null;

/**
 * Signup stores `{house}, {street}, {barangay}, Dasmariñas, Cavite`.
 * Do not use the second-to-last comma part — that is the city, not the barangay.
 */
export function barangayFromUserAddress(address: string | null | undefined): string {
  const parts = (address ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";

  const cityIdx = parts.findIndex((part) =>
    /^dasmari[ñn]as$/i.test(part)
  );
  if (cityIdx >= 1) return parts[cityIdx - 1] ?? "";
  if (parts.length >= 3) return parts[2] ?? "";
  return "";
}

/** Prefer `users.barangay` (admin/mobile snapshot); fall back to the address string. */
export function displayUserBarangay(row: {
  barangay?: string | null;
  address?: string | null;
}): string {
  const stored = (row.barangay ?? "").trim();
  if (stored) return stored;
  return barangayFromUserAddress(row.address);
}

/** Active barangays from `public.barangays` (id + name), ordered by name. */
export async function fetchBarangays(
  options?: { force?: boolean }
): Promise<BarangayOption[]> {
  const force = options?.force === true;
  const now = Date.now();

  if (
    !force &&
    barangaysMemory?.length &&
    now - barangaysFetchedAtMs < BARANGAYS_CACHE_TTL_MS
  ) {
    return barangaysMemory;
  }

  if (barangaysInflight) {
    return barangaysInflight;
  }

  barangaysInflight = (async () => {
    if (!force) {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.barangaysCache);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            rows?: BarangayOption[];
            fetchedAtMs?: number;
          };
          if (
            Array.isArray(parsed.rows) &&
            parsed.rows.length &&
            typeof parsed.fetchedAtMs === "number" &&
            now - parsed.fetchedAtMs < BARANGAYS_CACHE_TTL_MS
          ) {
            barangaysMemory = parsed.rows;
            barangaysFetchedAtMs = parsed.fetchedAtMs;
            return parsed.rows;
          }
        }
      } catch {
        /* ignore corrupt cache */
      }
    }

    const { data, error } = await supabase
      .from("barangays")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? "",
    }));

    barangaysMemory = rows;
    barangaysFetchedAtMs = Date.now();
    await AsyncStorage.setItem(
      STORAGE_KEYS.barangaysCache,
      JSON.stringify({ rows, fetchedAtMs: barangaysFetchedAtMs })
    );
    return rows;
  })();

  try {
    return await barangaysInflight;
  } finally {
    barangaysInflight = null;
  }
}
