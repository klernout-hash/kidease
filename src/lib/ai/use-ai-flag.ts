import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { readAiFeatureFlags } from "@/lib/server/ai-flags";
import { aiBucket, type AiFlag } from "./flags.ts";
import { aiFeatureVisible } from "./flag-gate.ts";
import { getPostHog } from "../posthog.ts";

function anonId() {
  const key = "kidease-ai-id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return "0";
  }
}

/** Hidden until PostHog answers. A 0% flag stays hidden. 50% only if PostHog cannot be reached. */
export function useAiFeatureFlag(flag: AiFlag): boolean {
  const { user } = useCurrentUserState();
  const [on, setOn] = useState(false);

  useEffect(() => {
    let stop = false;
    let unlisten: (() => void) | undefined;
    const id = user?.id && user.id !== "dev-user" ? user.id : anonId();
    const bucket = aiBucket(id);
    void readAiFeatureFlags({ data: { distinctId: id } })
      .then((snapshot) => {
        if (!stop) setOn(aiFeatureVisible({ flag, bucket, snapshot }));
      })
      .catch(() => {
        if (!stop) setOn(aiFeatureVisible({ flag, bucket, snapshot: { reached: false, flags: {} } }));
      });
    const started = Date.now();
    const timer = window.setInterval(() => {
      const ph = getPostHog();
      if (!ph) {
        if (Date.now() - started > 8000) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      const read = () => {
        if (stop) return;
        const remote = ph.isFeatureEnabled(flag, { fresh: true });
        if (typeof remote !== "boolean") return;
        setOn(remote);
      };
      unlisten = ph.onFeatureFlags(read);
      read();
    }, 400);
    return () => {
      stop = true;
      window.clearInterval(timer);
      unlisten?.();
    };
  }, [flag, user?.id]);

  return on;
}
