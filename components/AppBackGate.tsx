import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform } from "react-native";

import { resolveAppBackAction } from "@/AppCore/AppBackNavigation";
import { signOutLocalSession } from "@/AppCore/AppLogout";
import { ROUTES } from "@/AppCore/AppRoutePaths";
import { AccountConfirmModal } from "@/components/AccountUi";

/**
 * Android system back: pop nested screens, return other tabs to Home,
 * confirm logout on Home. Screen-level BackHandlers (request draft, PIN
 * recovery) still win because they register later.
 */
export function AppBackGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutOpenRef = useRef(false);
  logoutOpenRef.current = logoutOpen;

  const handleLogout = useCallback(() => {
    setLogoutOpen(false);
    setLoggingOut(true);
    setTimeout(() => {
      void (async () => {
        try {
          await signOutLocalSession();
        } finally {
          setLoggingOut(false);
          router.replace(ROUTES.login);
        }
      })();
    }, 1000);
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (logoutOpenRef.current || loggingOut) {
        if (logoutOpenRef.current && !loggingOut) {
          setLogoutOpen(false);
        }
        return true;
      }

      const action = resolveAppBackAction(pathname, router.canGoBack());
      if (action === "pop") {
        router.back();
        return true;
      }
      if (action === "home") {
        router.replace(ROUTES.home);
        return true;
      }
      if (action === "logout") {
        setLogoutOpen(true);
        return true;
      }
      return false;
    });

    return () => sub.remove();
  }, [pathname, router, loggingOut]);

  if (Platform.OS !== "android") return null;

  return (
    <AccountConfirmModal
      visible={logoutOpen || loggingOut}
      title="Do you want to Log out?"
      busy={loggingOut}
      busyText="Logging out please wait..."
      onConfirm={handleLogout}
      onCancel={() => setLogoutOpen(false)}
    />
  );
}
