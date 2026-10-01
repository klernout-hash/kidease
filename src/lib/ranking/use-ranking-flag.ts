import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { readAiFeatureFlags } from "@/lib/server/ai-flags";
import { rankingFlagOn } from "./variant.ts";

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

/**
 * `undefined` until the server answers, then the real flag.
 * PostHog down, or the flag off, is false. Search keeps Nearest.
 */
export function useRankingBestMatchFlag(): boolean | undefined {
  const { user } = useCurrentUserState();
  const [flag, setFlag] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let stop = false;
    const id = user?.id && user.id !== "dev-user" ? user.id : anonId();
    void readAiFeatureFlags({ data: { distinctId: id } })
      .then((snapshot) => {
        if (!stop) setFlag(rankingFlagOn(snapshot));
      })
      .catch(() => {
        if (!stop) setFlag(false);
      });
    return () => {
      stop = true;
    };
  }, [user?.id]);

  return flag;
}
