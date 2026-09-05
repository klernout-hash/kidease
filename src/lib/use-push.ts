import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isNative } from "@/lib/native";
import { registerPushDevice } from "@/lib/push-client";

/**
 * Native-only, flag-gated token registration.
 * www never prompts. Unsigned visitors never prompt.
 * FEATURE_PUSH must be on (server env) before Capacitor is touched.
 */
export function usePushRegistration(): void {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (isPending || !user) return;
    if (typeof window === "undefined" || !isNative()) return;

    let cancelled = false;
    void import("@/lib/server/push-api")
      .then(async ({ getPushClientStatus }) => {
        const status = await getPushClientStatus();
        if (cancelled || !status.enabled) return;
        await registerPushDevice({ enabled: true });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user, isPending]);
}
