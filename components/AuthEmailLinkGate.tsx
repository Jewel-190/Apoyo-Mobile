import * as Linking from "expo-linking";
import { useEffect } from "react";

import { createSessionFromAuthUrl } from "@/AppCore/RegistrationAuth";

/**
 * Listens for confirmation / recovery deep links while the app is open.
 */
export function AuthEmailLinkGate() {
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      void createSessionFromAuthUrl(url);
    };

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });

    return () => sub.remove();
  }, []);

  return null;
}
