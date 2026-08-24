import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { ROUTES } from "@/AppCore/AppRoutePaths";
import {
  clearPinRecoveryPending,
  isForgotPinPath,
  readPinRecoveryPending,
} from "@/AppCore/ForgotPin";
import { supabase } from "@/AppCore/SupabaseClient";

/**
 * A recovery OTP session must not open Home until the new MPIN is saved.
 */
export function PinRecoveryGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const redirectIfPending = async () => {
      const pending = await readPinRecoveryPending();
      if (!active || !pending) return;
      if (isForgotPinPath(pathname)) return;
      router.replace({
        pathname: ROUTES.forgotPin,
        params: { email: pending.email, resume: "1" },
      });
    };

    void redirectIfPending();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void clearPinRecoveryPending();
        return;
      }
      if (event === "PASSWORD_RECOVERY") {
        void redirectIfPending();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
