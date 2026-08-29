/**
 * Push notification plumbing (primed, dependency-free).
 *
 * The database side is ready today: `public.user_push_token` stores device tokens
 * and `upsert_user_push_token` / `disable_user_push_token` manage them under RLS.
 * A future background worker (edge function / DB webhook) can read enabled tokens
 * for a `user_notification` INSERT and deliver via Expo Push / FCM / APNs.
 *
 * The client half intentionally avoids adding `expo-notifications` until push is
 * actually turned on. To enable push later:
 *   1. `npx expo install expo-notifications expo-device`
 *   2. Implement `getExpoPushTokenAsync()` below (see the TODO) to request perms
 *      and fetch the Expo push token.
 *   3. Call `registerForPushNotificationsAsync()` after login.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./SupabaseClient";
import { STORAGE_KEYS } from "./ClientStorageKeys";

export type PushPlatform = "ios" | "android" | "web";

function currentPlatform(): PushPlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

/** Persists (or refreshes) a device push token for the signed-in user. */
export async function savePushToken(
  token: string,
  options?: { platform?: PushPlatform; deviceId?: string; enabled?: boolean }
): Promise<boolean> {
  if (!token) return false;
  const { error } = await supabase.rpc("upsert_user_push_token", {
    p_token: token,
    p_platform: options?.platform ?? currentPlatform(),
    p_device_id: options?.deviceId ?? null,
    p_enabled: options?.enabled ?? true,
  });
  return !error;
}

/** Disables a device push token (e.g. user turned push off or logged out). */
export async function disablePushToken(token: string): Promise<boolean> {
  if (!token) return false;
  const { error } = await supabase.rpc("disable_user_push_token", {
    p_token: token,
  });
  return !error;
}

export async function getPushPreference(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.pushEnabled);
  // Default ON so a future push rollout reaches users who never opened settings.
  return raw === null ? true : raw === "1";
}

export async function setPushPreference(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.pushEnabled, enabled ? "1" : "0");
}

export async function getInAppPreference(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.inAppEnabled);
  return raw === null ? true : raw === "1";
}

export async function setInAppPreference(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.inAppEnabled, enabled ? "1" : "0");
}

/**
 * Requests permission + fetches the device push token, then stores it.
 *
 * No-op until `expo-notifications` is installed and wired (see file header).
 * Returns the token on success, or null when push is unavailable/declined.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const enabled = await getPushPreference();
  if (!enabled) return null;

  // TODO(push): enable once `expo-notifications` + `expo-device` are installed.
  //
  //   import * as Notifications from "expo-notifications";
  //   import * as Device from "expo-device";
  //
  //   if (!Device.isDevice) return null;
  //   const { status: existing } = await Notifications.getPermissionsAsync();
  //   let status = existing;
  //   if (existing !== "granted") {
  //     status = (await Notifications.requestPermissionsAsync()).status;
  //   }
  //   if (status !== "granted") return null;
  //   const projectId =
  //     Constants.expoConfig?.extra?.eas?.projectId ??
  //     Constants.easConfig?.projectId;
  //   const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  //   await savePushToken(token);
  //   return token;

  return null;
}
