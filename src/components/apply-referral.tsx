import { useEffect, useRef } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { growthAttribution, growthLoopsEnabled } from "@/lib/growth-loops";
import { capturePostHogEvent } from "@/lib/posthog";
import { clearReferralCode, readReferralCode } from "@/lib/referrals";

/** After sign-in, attach a stored friend code. No credit is granted. */
export function ApplyReferral() {
  const { user, isPending } = useCurrentUserState();
  const ran = useRef(false);

  useEffect(() => {
    if (isPending || !user || ran.current) return;
    const code = readReferralCode();
    if (!code) return;
    ran.current = true;
    void fetch("/api/referrals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim", code }),
    })
      .then(async (res) => {
        if (!res.ok) {
          ran.current = false;
          return;
        }
        const body = (await res.json()) as { ok?: boolean; joined?: boolean };
        if (body.ok) clearReferralCode();
        if (body.joined) {
          const hit = growthAttribution({ enabled: growthLoopsEnabled(), event: "referral_joined", code });
          if (hit) capturePostHogEvent(hit.event, hit.properties);
        }
        else ran.current = false;
      })
      .catch(() => {
        ran.current = false;
      });
  }, [user, isPending]);

  return null;
}
