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

function isUsableCatalogBundle(
  b: AssistanceCatalogBundle | null | undefined
): b is AssistanceCatalogBundle {
  return !!(b?.services?.length && b.runtime);
}

function rememberCatalogBundle(b: AssistanceCatalogBundle | null): void {
  catalogBundleMemory = isUsableCatalogBundle(b) ? b : null;
}

/** Restore catalog runtime + bundle memory before first navigation (Status / deep links). */
export async function hydrateCatalogRuntimeFromCache(): Promise<void> {
  try {
    const cachedRaw = await AsyncStorage.getItem(ASSISTANCE_CATALOG_CACHE_KEY);
    if (!cachedRaw) return;
    const parsed = JSON.parse(cachedRaw) as AssistanceCatalogBundle;
    if (!isUsableCatalogBundle(parsed)) return;
    rememberCatalogBundle(parsed);
    setCatalogLookupRuntime(parsed.runtime);
  } catch {
    /* ignore */
  }
}

export function useAssistanceCatalog() {
  const [bundle, setBundle] = useState<AssistanceCatalogBundle | null>(
    () => catalogBundleMemory
  );
  const [loading, setLoading] = useState(
    () => !isUsableCatalogBundle(catalogBundleMemory)
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let usable = isUsableCatalogBundle(catalogBundleMemory);

    if (usable) {
      setCatalogLookupRuntime(catalogBundleMemory!.runtime);
      setBundle(catalogBundleMemory);
      setLoading(false);
    }

    let cachedRaw: string | null = null;

    try {
      cachedRaw = await AsyncStorage.getItem(ASSISTANCE_CATALOG_CACHE_KEY);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw) as AssistanceCatalogBundle;
          if (isUsableCatalogBundle(parsed)) {
            rememberCatalogBundle(parsed);
            setCatalogLookupRuntime(parsed.runtime);
            setBundle(parsed);
            usable = true;
            setLoading(false);
          }
        } catch {
          /* ignore corrupt cache */
        }
      }

      if (!usable) setLoading(true);

      const { bundle: fresh, error: fetchErr } = await fetchAssistanceCatalog();

      if (isUsableCatalogBundle(fresh)) {
        rememberCatalogBundle(fresh);
        setCatalogLookupRuntime(fresh.runtime);
        setBundle(fresh);
        await AsyncStorage.setItem(
          ASSISTANCE_CATALOG_CACHE_KEY,
          JSON.stringify(fresh)
        );
      } else if (!usable && !cachedRaw) {
        setError(fetchErr || "catalog_unavailable");
      } else if (!usable && cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw) as AssistanceCatalogBundle;
          if (parsed?.runtime) {
            setCatalogLookupRuntime(parsed.runtime);
          }
          if (parsed?.services?.length) {
            setBundle(parsed);
          }
        } catch {
          setError(fetchErr || "catalog_cache_corrupt");
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "catalog_error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { bundle, loading, error, reload: load };
}
