import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/** Android SecureStore historically caps values near 2KB; session JSON is larger. */
const CHUNK_SIZE = 1800;

function canUseSecureStore() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

async function deleteChunked(key: string) {
  try {
    const header = await SecureStore.getItemAsync(key);
    if (header?.startsWith("chunked:")) {
      const count = Number(header.slice("chunked:".length));
      for (let i = 0; i < count; i += 1) {
        await SecureStore.deleteItemAsync(`${key}.__${i}`).catch(() => undefined);
      }
    }
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  } catch {
    // Ignore missing keys.
  }
}

/**
 * Supabase Auth storage: SecureStore on native, AsyncStorage on web.
 * Migrates any leftover AsyncStorage session on first read.
 */
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!canUseSecureStore()) {
      return AsyncStorage.getItem(key);
    }

    try {
      const header = await SecureStore.getItemAsync(key);
      if (header == null) {
        const legacy = await AsyncStorage.getItem(key);
        if (legacy) {
          await authStorage.setItem(key, legacy);
          await AsyncStorage.removeItem(key);
        }
        return legacy;
      }
      if (header.startsWith("chunked:")) {
        const count = Number(header.slice("chunked:".length));
        const parts: string[] = [];
        for (let i = 0; i < count; i += 1) {
          const part = await SecureStore.getItemAsync(`${key}.__${i}`);
          if (part == null) return null;
          parts.push(part);
        }
        return parts.join("");
      }
      return header;
    } catch {
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!canUseSecureStore()) {
      await AsyncStorage.setItem(key, value);
      return;
    }

    try {
      await deleteChunked(key);
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const chunks = Math.ceil(value.length / CHUNK_SIZE);
      await SecureStore.setItemAsync(key, `chunked:${chunks}`);
      for (let i = 0; i < chunks; i += 1) {
        await SecureStore.setItemAsync(
          `${key}.__${i}`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        );
      }
      await AsyncStorage.removeItem(key);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (canUseSecureStore()) {
      await deleteChunked(key);
    }
    await AsyncStorage.removeItem(key);
  },
};
