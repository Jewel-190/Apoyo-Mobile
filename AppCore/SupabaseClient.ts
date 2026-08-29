/**
 * Typed Supabase client for the mobile app (`@/AppCore/SupabaseClient`).
 *
 * The generic parameter `Database` gives every `.from(...)` call full
 * type safety: row shapes, insert/update payloads, and column names
 * are all checked at compile time.
 */

import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

import type { Database } from "./DatabaseTypes";
import { authStorage } from "./SecureAuthStorage";

type SupabaseExtras = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extras = (Constants.expoConfig?.extra ?? {}) as SupabaseExtras;

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || extras.supabaseUrl || "";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extras.supabaseAnonKey || "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase configuration missing. Set `expo.extra.supabaseUrl` and " +
      "`expo.extra.supabaseAnonKey` in app.json (or EXPO_PUBLIC_SUPABASE_URL " +
      "/ EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables)."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type SupabaseClient = typeof supabase;
