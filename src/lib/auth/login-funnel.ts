/**
 * Login → 2FA → dest continue helpers and PostHog funnel events.
 * Properties are dest kinds / desk keys only — never email, codes, or raw next.
 *
 * Remeasure with `login_funnel` steps `submitted` → `continued`.
 * `desk_landed` confirms a desk painted; public next (/search, /daycare)
 * completes on `continued` so listing/search returns are not scored as stalls.
 */
import { useEffect, useRef } from "react";
import {
  type DeskKey,
  DESK_PATH,
  deskFromPathname,
  funnelDestPath,
  postLoginDestKind,
  resolvePostLoginPath,
  sanitizePostLoginNext,
  shouldOpenTwoFactorForDest,
  staffTwoFactorRequired,
  twoFactorPageUrl,
  writeStickyDesk,
} from "@/lib/desks";
import { capturePostHogEvent } from "@/lib/posthog";
import { getMyDesks } from "@/lib/server/roles";
import { getTwoFactorStatus } from "@/lib/server/two-factor";
import { withTimeout, withTimeoutFallback } from "@/lib/timeout";
import { SESSION_SETTLE_RETRIES, waitForSignedInSession } from "./session-settle.ts";

export { loginErrorCallbackUrl, twoFactorPageUrl } from "@/lib/desks";
export { SESSION_SETTLE_RETRIES, waitForSignedInSession };

export const LOGIN_FUNNEL_EVENT = "login_funnel";
export const TWO_FACTOR_STATUS_MS = 1500;
export const DESK_RESOLVE_MS = 4000;
export const LOGIN_STALL_MS = 8000;

export type LoginFunnelStep =
  | "viewed"
  | "submitted"
  | "succeeded"
  | "failed"
  | "dest_resolved"
  | "dest_failed"
  | "continued"
  | "two_factor_viewed"
  | "two_factor_skipped"
  | "two_factor_verified"
  | "two_factor_failed"
  | "desk_landed";

export type LoginFunnelProps = {
  step: LoginFunnelStep;
  dest_kind?: ReturnType<typeof postLoginDestKind>;
  dest_path?: string;
  desk?: DeskKey;
  method?: "email" | "social" | "session";
  reason?: string;
  native?: boolean;
};

export function captureLoginFunnel(props: LoginFunnelProps): void {
  const payload: Record<string, unknown> = { step: props.step };
  if (props.dest_kind) payload.dest_kind = props.dest_kind;
  if (props.dest_path) payload.dest_path = props.dest_path;
  if (props.desk) payload.desk = props.desk;
  if (props.method) payload.method = props.method;
  if (props.reason) payload.reason = props.reason;
  if (typeof props.native === "boolean") payload.native = props.native;
  capturePostHogEvent(LOGIN_FUNNEL_EVENT, payload);
}

function funnelDestMeta(dest: string) {
  const desk = deskFromPathname(dest);
  return {
    dest_kind: postLoginDestKind(dest),
    dest_path: funnelDestPath(dest),
    desk: desk ?? undefined,
  };
}

export function markContinued(dest: string, extra?: Pick<LoginFunnelProps, "method" | "reason" | "native">): void {
  captureLoginFunnel({
    step: "continued",
    ...funnelDestMeta(dest),
    ...extra,
  });
}

export async function resolveContinueDest(input: {
  next?: string | null;
  desk?: DeskKey | null;
  role?: "parent" | "provider" | "admin" | null;
  sticky?: DeskKey | null;
}): Promise<string> {
  const next = sanitizePostLoginNext(input.next);
  const hinted = Boolean(next || input.desk || input.role || input.sticky);
  let desks: DeskKey[] | null = null;
  if (!hinted) {
    desks = await withTimeoutFallback(
      getMyDesks()
        .then((row) => row.desks)
        .catch(() => null),
      DESK_RESOLVE_MS,
      null,
    );
  }
  const dest = resolvePostLoginPath({
    next,
    desk: input.desk,
    role: input.role,
    desks,
    sticky: input.sticky,
  });
  const desk = deskFromPathname(dest);
  if (desk) writeStickyDesk(desk);
  captureLoginFunnel({
    step: "dest_resolved",
    ...funnelDestMeta(dest),
  });
  return dest;
}

export async function shouldOpenTwoFactorPage(
  dest: string,
  statusPromise?: Promise<{ verified: boolean }>,
): Promise<boolean> {
  const kind = postLoginDestKind(dest);
  if (kind === "public" || kind === "home") return false;
  // Parent / provider 2FA is optional. Sending them to /verify-2fa while
  // TwoFactorGate still requires verified:true flash-loops parent ↔ code.
  if (!staffTwoFactorRequired(dest)) {
    captureLoginFunnel({
      step: "two_factor_skipped",
      reason: "optional_desk",
      ...funnelDestMeta(dest),
    });
    return false;
  }
  try {
    const status = await withTimeout(
      statusPromise ?? getTwoFactorStatus(),
      TWO_FACTOR_STATUS_MS,
      "2fa-status-timeout",
    );
    if (!shouldOpenTwoFactorForDest(dest, status.verified)) {
      captureLoginFunnel({
        step: "two_factor_skipped",
        reason: "already_verified",
        ...funnelDestMeta(dest),
      });
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function assignPostAuthDest(dest: string): void {
  if (typeof window === "undefined") return;
  const url = sanitizePostLoginNext(dest) ?? resolvePostLoginPath({ next: dest });
  window.location.assign(url.startsWith("/") && !url.startsWith("//") ? url : "/parent");
}

function fallbackDest(input: {
  next?: string | null;
  desk?: DeskKey | null;
  role?: "parent" | "provider" | "admin" | null;
  sticky?: DeskKey | null;
}): string {
  return resolvePostLoginPath({
    next: input.next,
    desk: input.desk,
    role: input.role,
    sticky: input.sticky,
  });
}

export async function continueAfterSignIn(input: {
  next?: string | null;
  desk?: DeskKey | null;
  role?: "parent" | "provider" | "admin" | null;
  sticky?: DeskKey | null;
  method: "email" | "social" | "session";
}): Promise<string> {
  try {
    const preview = sanitizePostLoginNext(input.next);
    const previewKind = preview ? postLoginDestKind(preview) : null;
    const statusPromise =
      previewKind === "public" ||
      previewKind === "home" ||
      (preview != null && !staffTwoFactorRequired(preview))
        ? undefined
        : getTwoFactorStatus();
    const dest = await resolveContinueDest(input);
    const needTwoFactor = await shouldOpenTwoFactorPage(dest, statusPromise);
    markContinued(dest, { method: input.method });
    if (needTwoFactor) {
      window.location.assign(twoFactorPageUrl(dest));
      return dest;
    }
    assignPostAuthDest(dest);
    return dest;
  } catch {
    captureLoginFunnel({ step: "dest_failed", method: input.method, reason: "continue_failed" });
    const dest = fallbackDest(input);
    markContinued(dest, { method: input.method, reason: "fallback" });
    assignPostAuthDest(dest);
    return dest;
  }
}

/** Fire `desk_landed` once per mount when a signed-in desk paints. */
export function useLoginFunnelDeskLand(desk: DeskKey, ready: boolean): void {
  const sent = useRef(false);
  useEffect(() => {
    if (!ready || sent.current) return;
    sent.current = true;
    captureLoginFunnel({ step: "desk_landed", desk, dest_kind: "desk", dest_path: DESK_PATH[desk] });
  }, [desk, ready]);
}

/** Mount inside TwoFactorGate so we only count a painted desk, not the gate. */
export function LoginFunnelDeskLand({ desk }: { desk: DeskKey }) {
  useLoginFunnelDeskLand(desk, true);
  return null;
}
