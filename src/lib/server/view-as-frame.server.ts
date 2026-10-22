import { AsyncLocalStorage } from "node:async_hooks";
import {
  ViewAsReadOnlyError,
  assertViewAsAction,
  sqlAllowedDuringViewAs,
  type ViewAsAction,
} from "@/lib/view-as";
import type { ViewAsPublic } from "@/lib/view-as-public";

export type ViewAsFrame = {
  sessionId: string;
  actorUserId: string;
  targetUserId: string;
  targetEmail: string | null;
  targetName: string | null;
  targetRole: "parent" | "provider";
  expiresAtMs: number;
  writeBypass: boolean;
};

const frames = new AsyncLocalStorage<ViewAsFrame>();
const bypass = new AsyncLocalStorage<true>();

export function isViewAsBypass(): boolean {
  return bypass.getStore() === true;
}

export function runWithoutViewAs<T>(fn: () => Promise<T>): Promise<T> {
  return bypass.run(true, fn);
}

export function getViewAsFrame(): ViewAsFrame | null {
  return frames.getStore() ?? null;
}

export function enterViewAsFrame(frame: ViewAsFrame): void {
  frames.enterWith(frame);
}

export function withViewAsWriteBypass<T>(fn: () => Promise<T>): Promise<T> {
  const store = frames.getStore();
  if (!store) return fn();
  const prev = store.writeBypass;
  store.writeBypass = true;
  return fn().finally(() => {
    store.writeBypass = prev;
  });
}

function publicFrame(store: ViewAsFrame): ViewAsPublic {
  return {
    targetUserId: store.targetUserId,
    name: store.targetName,
    email: store.targetEmail,
    role: store.targetRole,
    expiresAt: new Date(store.expiresAtMs).toISOString(),
    readOnly: true,
  };
}

const g = globalThis as typeof globalThis & {
  __kideaseSqlGuard__?: (sql: string) => void;
  __kideaseViewAsSideEffect__?: (action: ViewAsAction) => void;
  __kideaseReadViewAs__?: () => ViewAsPublic | null;
};

g.__kideaseSqlGuard__ = (sql: string) => {
  const store = frames.getStore();
  if (!store || store.writeBypass) return;
  if (sqlAllowedDuringViewAs(sql)) return;
  throw new ViewAsReadOnlyError("write");
};

g.__kideaseViewAsSideEffect__ = (action: ViewAsAction) => {
  const store = frames.getStore();
  if (!store || store.writeBypass) return;
  if (action !== "read" && action !== "exit") {
    void import("@/lib/server/security-events")
      .then((mod) =>
        mod.logSecurityEvent({
          kind: "view_as_blocked",
          actorUserId: store.actorUserId,
          targetUserId: store.targetUserId,
          detail: action,
        }),
      )
      .catch(() => undefined);
  }
  assertViewAsAction(action, true);
};

g.__kideaseReadViewAs__ = () => {
  const store = frames.getStore();
  return store ? publicFrame(store) : null;
};
