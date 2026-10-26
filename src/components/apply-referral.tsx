import { useEffect, useRef } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
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
        const body = (await res.json()) as { ok?: boolean };
        if (body.ok) clearReferralCode();
        else ran.current = false;
      })
      .catch(() => {
        ran.current = false;
      });
  }, [user, isPending]);

  return null;
}
