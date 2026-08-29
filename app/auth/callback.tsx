import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect } from "react";

import { createSessionFromAuthUrl } from "@/AppCore/RegistrationAuth";
import { ROUTES } from "@/AppCore/AppRoutePaths";

/**
 * Completes signup confirmation when the email link opens the app.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        await createSessionFromAuthUrl(url);
      }
      if (!cancelled) {
        router.replace(ROUTES.register);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
