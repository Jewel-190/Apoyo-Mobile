/**
 * Loads CMS copy for a service from `assistance_services` (P0 catalog).
 * Falls back silently when offline / empty — callers keep hardcoded titles.
 */

import { useEffect, useState } from "react";

import { resolveServiceId } from "./CatalogLookupRuntime";
import { supabase } from "./SupabaseClient";

export type AssistanceServiceCopy = {
  displayName: string | null;
  descriptionHtml: string | null;
  loading: boolean;
};

export function useAssistanceServiceCopy(
  serviceId: string | null | undefined
): AssistanceServiceCopy {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [descriptionHtml, setDescriptionHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sid = resolveServiceId((serviceId || "").trim());

    if (!sid) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("assistance_services" as never)
          .select("display_name, description_html")
          .eq("id" as never, sid as never)
          .eq("active" as never, true as never)
          .maybeSingle();

        if (cancelled || error) {
          if (!cancelled) {
            setDisplayName(null);
            setDescriptionHtml(null);
          }
          return;
        }

        const row = data as {
          display_name?: string | null;
          description_html?: string | null;
        } | null;

        if (!cancelled) {
          setDisplayName(row?.display_name?.trim() || null);
          setDescriptionHtml(row?.description_html?.trim() || null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  return { displayName, descriptionHtml, loading };
}
