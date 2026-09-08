import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { identifyPostHogUser, resetPostHogIdentity, startPostHog } from "@/lib/posthog";

/**
 * Mount once in the root shell. Initializes PostHog on the client (pageviews,
 * autocapture, privacy-masked web session replay, feature flags) and identifies
 * the Better Auth user by account id when a real session is present.
 * Missing VITE_PUBLIC_POSTHOG_KEY is a no-op — the app still boots.
 */
export function PostHogBoot() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    startPostHog();
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (user && !user.isDevFallback) identifyPostHogUser(user.id);
    else resetPostHogIdentity();
  }, [user, isPending]);

  return null;
}
