/**
 * Resolves the current Supabase user once and exposes a stable handle
 * to it. Mirrors the pattern several screens currently inline:
 * `await supabase.auth.getUser()` plus an optional read of the cached
 * `users` profile from AsyncStorage.
 */

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./SupabaseClient";
import type { UserRow } from "./DatabaseRowAliases";

export const USER_CACHE_KEY = "apoyo_user_cache";

export type AuthSession = {
  /** True until the first auth response comes back. */
  loading: boolean;
  /** The Supabase auth user id, null if not authenticated. */
  userId: string | null;
  /** The cached `users` row (best effort), or null. */
  profile: Partial<UserRow> | null;
};

export function useAuthSession(): AuthSession {
  const [state, setState] = useState<AuthSession>({
    loading: true,
    userId: null,
    profile: null,
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [{ data: sessionData }, cached] = await Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem(USER_CACHE_KEY),
        ]);

        const id = sessionData?.session?.user?.id ?? null;

        let profile: Partial<UserRow> | null = null;
        if (cached) {
          try {
            profile = JSON.parse(cached) as Partial<UserRow>;
          } catch {
            /* ignore cache parse errors */
          }
        }

        if (active) {
          setState({ loading: false, userId: id, profile });
        }
      } catch {
        if (active) {
          setState({ loading: false, userId: null, profile: null });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
