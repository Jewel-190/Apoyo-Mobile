import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import {
  ASSISTANCE_CATALOG_CACHE_KEY,
  type AssistanceCatalogBundle,
  fetchAssistanceCatalog,
} from "./AssistanceCatalogFromApi";
import { setCatalogLookupRuntime } from "./CatalogLookupRuntime";

/** In-memory copy so remounting screens avoid an empty frame before AsyncStorage resolves. */
let catalogBundleMemory: AssistanceCatalogBundle | null = null;
/** When the in-memory / disk bundle was last fetched from Supabase. */
let catalogFetchedAtMs = 0;

/** Skip network catalog refresh when cache is younger than this (pull-to-refresh bypasses). */
export const CATALOG_NETWORK_TTL_MS = 24 * 60 * 60 * 1000;

let catalogLoadInflight: Promise<void> | null = null;

type CatalogHookState = {
  bundle: AssistanceCatalogBundle | null;
  loading: boolean;
  error: string | null;
};

type CatalogSubscriber = (state: CatalogHookState) => void;
const catalogSubscribers = new Set<CatalogSubscriber>();

function isUsableCatalogBundle(
  b: AssistanceCatalogBundle | null | undefined
): b is AssistanceCatalogBundle {
  return !!(b?.services?.length && b.runtime);
}

function rememberCatalogBundle(
  b: AssistanceCatalogBundle | null,
  fetchedAtMs?: number
): void {
  if (isUsableCatalogBundle(b)) {
    catalogBundleMemory = b;
    if (fetchedAtMs != null && fetchedAtMs > 0) {
      catalogFetchedAtMs = fetchedAtMs;
    } else if (b.cachedAt != null && b.cachedAt > 0) {
      catalogFetchedAtMs = b.cachedAt;
    }
  } else {
    catalogBundleMemory = null;
  }
}

function getCatalogHookState(): CatalogHookState {
  return {
    bundle: catalogBundleMemory,
    loading: !isUsableCatalogBundle(catalogBundleMemory),
    error: null,
  };
}

function notifyCatalogSubscribers(error: string | null = null): void {
  const state = getCatalogHookState();
  if (error) state.error = error;
  for (const sub of catalogSubscribers) {
    sub(state);
  }
}

function isCatalogCacheFresh(): boolean {
  if (!isUsableCatalogBundle(catalogBundleMemory)) return false;
  if (catalogFetchedAtMs <= 0) return false;
  return Date.now() - catalogFetchedAtMs < CATALOG_NETWORK_TTL_MS;
}

async function readCatalogFromDisk(): Promise<boolean> {
  try {
    const cachedRaw = await AsyncStorage.getItem(ASSISTANCE_CATALOG_CACHE_KEY);
    if (!cachedRaw) return false;
    const parsed = JSON.parse(cachedRaw) as AssistanceCatalogBundle;
    if (!isUsableCatalogBundle(parsed)) return false;
    rememberCatalogBundle(parsed);
    setCatalogLookupRuntime(parsed.runtime);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads catalog once per session (shared promise). Skips Supabase when cache is fresh
 * unless `force` is true (Home pull-to-refresh).
 */
export async function ensureAssistanceCatalogLoaded(
  force = false
): Promise<void> {
  if (!force && isCatalogCacheFresh()) {
    if (catalogBundleMemory) {
      setCatalogLookupRuntime(catalogBundleMemory.runtime);
    }
    notifyCatalogSubscribers();
    return;
  }

  if (catalogLoadInflight) {
    await catalogLoadInflight;
    return;
  }

  catalogLoadInflight = (async () => {
    let usable = isUsableCatalogBundle(catalogBundleMemory);

    if (usable && catalogBundleMemory) {
      setCatalogLookupRuntime(catalogBundleMemory.runtime);
      notifyCatalogSubscribers();
    }

    if (!usable) {
      usable = await readCatalogFromDisk();
      if (usable) notifyCatalogSubscribers();
    }

    if (!force && isCatalogCacheFresh()) return;

    if (!usable) notifyCatalogSubscribers();

    try {
      const { bundle: fresh, error: fetchErr } = await fetchAssistanceCatalog();
      const fetchedAt = Date.now();

      if (isUsableCatalogBundle(fresh)) {
        const stamped: AssistanceCatalogBundle = { ...fresh, cachedAt: fetchedAt };
        rememberCatalogBundle(stamped, fetchedAt);
        setCatalogLookupRuntime(stamped.runtime);
        notifyCatalogSubscribers();
        await AsyncStorage.setItem(
          ASSISTANCE_CATALOG_CACHE_KEY,
          JSON.stringify(stamped)
        );
      } else if (!usable) {
        notifyCatalogSubscribers(fetchErr || "catalog_unavailable");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "catalog_error";
      notifyCatalogSubscribers(msg);
    } finally {
      notifyCatalogSubscribers();
    }
  })();

  try {
    await catalogLoadInflight;
  } finally {
    catalogLoadInflight = null;
  }
}

/** Restore catalog runtime + bundle memory before first navigation (Status / deep links). */
export async function hydrateCatalogRuntimeFromCache(): Promise<void> {
  await readCatalogFromDisk();
}

export function useAssistanceCatalog() {
  const [state, setState] = useState<CatalogHookState>(() => getCatalogHookState());

  useEffect(() => {
    const sub: CatalogSubscriber = (next) => setState(next);
    catalogSubscribers.add(sub);
    void ensureAssistanceCatalogLoaded(false);
    return () => {
      catalogSubscribers.delete(sub);
    };
  }, []);

  const reload = useCallback(async () => {
    await ensureAssistanceCatalogLoaded(true);
  }, []);

  return { bundle: state.bundle, loading: state.loading, error: state.error, reload };
}
