/**
 * Client-safe hooks. The server installs the real guards on globalThis.
 * A browser bundle has no guard, so these calls do nothing there.
 */
import { assertViewAsAction, type ViewAsAction } from "./view-as.ts";

export type ViewAsPublic = {
  targetUserId: string;
  name: string | null;
  email: string | null;
  role: "parent" | "provider";
  expiresAt: string;
  readOnly: true;
};

export type ViewAsTargetKind = "parent" | "daycare" | "staff";

export type ViewAsTarget = {
  userId: string;
  name: string | null;
  email: string | null;
  city: string | null;
  role: "parent" | "provider";
  kind: ViewAsTargetKind;
};

type ViewAsHooks = {
  __kideaseSqlGuard__?: (sql: string) => void;
  __kideaseViewAsSideEffect__?: (action: ViewAsAction) => void;
  __kideaseReadViewAs__?: () => ViewAsPublic | null;
};

function hooks(): ViewAsHooks {
  return globalThis as ViewAsHooks;
}

export function readViewAsPublic(): ViewAsPublic | null {
  try {
    return hooks().__kideaseReadViewAs__?.() ?? null;
  } catch {
    return null;
  }
}

export function isViewAsReadOnly(): boolean {
  return readViewAsPublic() != null;
}

/** Throws when a view-as frame is active and the action is not a read or exit. */
export function blockViewAsSideEffect(action: ViewAsAction): void {
  const hook = hooks().__kideaseViewAsSideEffect__;
  if (hook) {
    hook(action);
    return;
  }
  if (readViewAsPublic()) assertViewAsAction(action, true);
}
