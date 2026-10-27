import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isStoreReviewerEmail } from "@/lib/reviewer-accounts";
import {
  identifyPostHogUser,
  quietPostHogForStoreReviewer,
  resetPostHogIdentity,
  resumePostHogAfterReviewer,
  startPostHog,
} from "@/lib/posthog";
import { captureRetentionTouch } from "@/lib/retention";

/**
 * Mount once in the root shell. Initializes PostHog on the client only after
 * Allow, including inside Capacitor. Pageviews, autocapture, privacy-masked
 * web session replay, feature flags. Identifies the Better Auth user by
 * account id when a real session is present.
 * Missing VITE_PUBLIC_POSTHOG_KEY is a no-op: the app still boots.
 */
export function PostHogBoot() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    // Granted visitors must init on mount. Deferring until the browser is
    // idle dropped the landing pageview when they left first.
    // startPostHog still no-ops until Allow.
    startPostHog();
    captureRetentionTouch();
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (user && isStoreReviewerEmail(user.primaryEmail)) {
      quietPostHogForStoreReviewer();
      return;
    }
    resumePostHogAfterReviewer();
    if (user && !user.isDevFallback) identifyPostHogUser(user.id);
    else resetPostHogIdentity();
  }, [user, isPending]);

  return null;
}
