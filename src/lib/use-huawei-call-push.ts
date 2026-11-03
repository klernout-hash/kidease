import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { readClientStoreChannel } from "@/lib/native-entitlements";
import { isNative } from "@/lib/native";

/**
 * Huawei shell only. Asks the server if FEATURE_CALL_PUSH is on before
 * touching HMS. The flag defaults off, so this returns without a token
 * and without a notification prompt.
 */
export function useHuaweiCallPushRegistration(): void {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (isPending || !user?.id) return;
    if (typeof window === "undefined" || !isNative()) return;
    if (readClientStoreChannel() !== "huawei") return;

    let cancelled = false;
    void import("@/lib/server/call-ring-fns")
      .then(async ({ getCallPushStatus }) => {
        const status = await getCallPushStatus();
        if (cancelled || !status.enabled) return;
        const { registerHuaweiCallToken } = await import("@/lib/call-push-client");
        await registerHuaweiCallToken();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user?.id, isPending]);
}
