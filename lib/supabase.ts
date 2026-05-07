import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/**
 * The project URL and anon key are sourced (in priority order) from:
 *   1. `app.json` -> `expo.extra.supabaseUrl` / `supabaseAnonKey`
 *   2. `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars
 *
 * Keeping the values in `app.json` means a single config edit + EAS build
 * picks them up; the env-var path is mainly for local development.
 */
type SupabaseExtras = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extras = (Constants.expoConfig?.extra ?? {}) as SupabaseExtras;

const supabaseUrl =
  extras.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey =
  extras.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase configuration missing. Set `expo.extra.supabaseUrl` and " +
      "`expo.extra.supabaseAnonKey` in app.json (or EXPO_PUBLIC_SUPABASE_URL " +
      "/ EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
