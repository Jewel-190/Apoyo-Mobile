/**
 * Clears local profile cache and ends the Supabase Auth session.
 * Navigation after this belongs to the caller.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./ClientStorageKeys";
import { supabase } from "./SupabaseClient";

export async function signOutLocalSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.userCache);
  const { error } = await supabase.auth.signOut();
  if (error) {
    await supabase.auth.signOut();
  }
}
