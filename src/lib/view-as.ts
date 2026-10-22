/**
 * Admin "View as user" policy. No database and no session cookie here.
 * The Better Auth session stays the operator. A server row says whose
 * desks to read. Writes stay off until that row is closed.
 */
import { isKidEaseOperatorEmail } from "./admin-email.ts";
import { desksFor, landingPath, type AppRole } from "./desks.ts";

/** Support window. The server clock is the source of truth. */
export const VIEW_AS_TTL_MS = 30 * 60 * 1000;

export const VIEW_AS_READ_ONLY_MESSAGE = "View as user is read-only.";

export type ViewAsEndReason = "exit" | "expired" | "replaced" | "denied";

export type ViewAsDenyReason =
  | "not_admin"
  | "self"
  | "target_admin"
  | "missing_target"
  | "not_daycare_or_parent"
  | "already";

/** Side effects a view-as session must refuse. `read` and `exit` stay open. */
export type ViewAsAction =
  | "read"
  | "exit"
  | "message"
  | "call"
  | "video"
  | "payment"
  | "password"
  | "two_factor"
  | "email"
  | "delete"
  | "write";

export type ViewAsAuditKind =
  | "view_as_start"
  | "view_as_exit"
  | "view_as_expired"
  | "view_as_denied"
  | "view_as_blocked";

export class ViewAsReadOnlyError extends Error {
  readonly code = "VIEW_AS_READ_ONLY";
  readonly action: ViewAsAction;
  constructor(action: ViewAsAction) {
    super(VIEW_AS_READ_ONLY_MESSAGE);
    this.name = "ViewAsReadOnlyError";
    this.action = action;
  }
}

export type ViewAsSessionRow = {
  id: string;
  adminUserId: string;
  targetUserId: string;
  startedAtMs: number;
  expiresAtMs: number;
  endedAtMs: number | null;
  endReason: ViewAsEndReason | null;
};

export type ViewAsAudit = {
  kind: ViewAsAuditKind;
  actorUserId: string;
  targetUserId: string;
  atMs: number;
  detail: string;
};

export function viewAsExpiryMs(startedAtMs: number): number {
  return startedAtMs + VIEW_AS_TTL_MS;
}

/** Expired at the exact end time. One millisecond earlier is still open. */
export function isViewAsExpired(expiresAtMs: number, nowMs: number): boolean {
  return !(expiresAtMs > nowMs);
}

export function viewAsMinutesLeft(expiresAtMs: number, nowMs: number): number {
  if (isViewAsExpired(expiresAtMs, nowMs)) return 0;
  return Math.max(1, Math.ceil((expiresAtMs - nowMs) / 60_000));
}

/**
 * Only a passing admin may start. The target must be a parent or daycare
 * account. Another admin, the operator mailbox, support staff, and the
 * admin's own user are refused.
 */
export function decideStartViewAs(input: {
  actorIsAdmin: boolean;
  actorUserId: string;
  targetUserId: string;
  targetRole: string | null | undefined;
  targetEmail: string | null | undefined;
}): { ok: true } | { ok: false; reason: ViewAsDenyReason } {
  if (!input.actorIsAdmin) return { ok: false, reason: "not_admin" };
  const targetUserId = input.targetUserId.trim();
  const actorUserId = input.actorUserId.trim();
  if (!targetUserId) return { ok: false, reason: "missing_target" };
  if (targetUserId === actorUserId) return { ok: false, reason: "self" };
  if (isKidEaseOperatorEmail(input.targetEmail)) return { ok: false, reason: "target_admin" };
  const role = (input.targetRole || "").trim().toLowerCase();
  if (role === "admin") return { ok: false, reason: "target_admin" };
  if (role === "parent" || role === "provider") return { ok: true };
  return { ok: false, reason: "not_daycare_or_parent" };
}

export function assertViewAsAction(action: ViewAsAction, active: boolean): void {
  if (!active) return;
  if (action === "read" || action === "exit") return;
  throw new ViewAsReadOnlyError(action);
}

export function viewAsAllows(action: ViewAsAction, active: boolean): boolean {
  if (!active) return true;
  return action === "read" || action === "exit";
}

/** Auth POST paths that change a password, email, 2FA, or delete a user. */
const BLOCKED_AUTH_SUFFIXES: Array<{ suffix: string; action: ViewAsAction }> = [
  { suffix: "/change-password", action: "password" },
  { suffix: "/set-password", action: "password" },
  { suffix: "/reset-password", action: "password" },
  { suffix: "/forget-password", action: "password" },
  { suffix: "/request-password-reset", action: "password" },
  { suffix: "/change-email", action: "email" },
  { suffix: "/send-verification-email", action: "email" },
  { suffix: "/update-user", action: "write" },
  { suffix: "/delete-user", action: "delete" },
  { suffix: "/revoke-session", action: "write" },
  { suffix: "/revoke-sessions", action: "write" },
  { suffix: "/revoke-other-sessions", action: "write" },
];

/**
 * Sign-out stays open so the operator is never trapped. It ends the
 * operator's own Better Auth session. It does not sign the other person out.
 */
export function authMutationAction(method: string, pathname: string): ViewAsAction | null {
  if (method.toUpperCase() !== "POST") return null;
  const path = (pathname || "").replace(/\/+$/, "").toLowerCase();
  if (!path) return null;
  if (path.endsWith("/sign-out") || path.endsWith("/sign-out/")) return null;
  for (const row of BLOCKED_AUTH_SUFFIXES) {
    if (path.endsWith(row.suffix)) return row.action;
  }
  if (path.includes("/two-factor/")) return "two_factor";
  return null;
}

export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function splitSql(sql: string): string[] {
  return stripSqlComments(sql)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function statementMutates(sql: string): boolean {
  const head = sql.replace(/^\(+/, "").trim().toLowerCase();
  if (!head) return false;
  if (head.startsWith("select") || head.startsWith("values") || head.startsWith("show") || head.startsWith("explain")) {
    return /\bfor\s+update\b/.test(head) || /\bfor\s+share\b/.test(head);
  }
  if (head.startsWith("with")) {
    return /\b(insert|update|delete|merge|truncate)\b/.test(head);
  }
  return true;
}

function statementAllowed(sql: string): boolean {
  if (!statementMutates(sql)) return true;
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  return /^insert\s+into\s+security_events\b/.test(normalized);
}

/** Reads pass. Inserts into the audit log pass. Every other write fails. */
export function sqlAllowedDuringViewAs(sql: string): boolean {
  const statements = splitSql(sql);
  if (statements.length === 0) return true;
  return statements.every((statement) => statementAllowed(statement));
}

export function viewAsAuthFailureEndsSession(message: string): boolean {
  return (
    message === "Not authorized" ||
    message === "Two-factor verification required" ||
    message === "Admin session timed out. Sign in again."
  );
}

export function viewAsWho(
  name: string | null | undefined,
  email: string | null | undefined,
  unknown: string,
): string {
  const n = (name || "").trim();
  const e = (email || "").trim();
  if (n && e && n.toLowerCase() !== e.toLowerCase()) return `${n} (${e})`;
  return n || e || unknown;
}

export function viewAsHome(role: AppRole, ownsCentre: boolean): "/parent" | "/provider" {
  const home = landingPath(desksFor({ role, ownsCentre }));
  return home === "/provider" ? "/provider" : "/parent";
}

export function openViewAsSession(input: {
  id: string;
  adminUserId: string;
  targetUserId: string;
  nowMs: number;
  existing: ViewAsSessionRow | null;
  decision: ReturnType<typeof decideStartViewAs>;
}): {
  session: ViewAsSessionRow | null;
  closed: ViewAsSessionRow | null;
  audits: ViewAsAudit[];
  error: ViewAsDenyReason | null;
} {
  if (!input.decision.ok) {
    return {
      session: input.existing,
      closed: null,
      audits: [
        {
          kind: "view_as_denied",
          actorUserId: input.adminUserId,
          targetUserId: input.targetUserId,
          atMs: input.nowMs,
          detail: input.decision.reason,
        },
      ],
      error: input.decision.reason,
    };
  }
  const audits: ViewAsAudit[] = [];
  let closed: ViewAsSessionRow | null = null;
  if (input.existing && input.existing.endedAtMs == null) {
    closed = { ...input.existing, endedAtMs: input.nowMs, endReason: "replaced" };
    audits.push({
      kind: "view_as_exit",
      actorUserId: input.existing.adminUserId,
      targetUserId: input.existing.targetUserId,
      atMs: input.nowMs,
      detail: "replaced",
    });
  }
  const session: ViewAsSessionRow = {
    id: input.id,
    adminUserId: input.adminUserId,
    targetUserId: input.targetUserId,
    startedAtMs: input.nowMs,
    expiresAtMs: viewAsExpiryMs(input.nowMs),
    endedAtMs: null,
    endReason: null,
  };
  audits.push({
    kind: "view_as_start",
    actorUserId: input.adminUserId,
    targetUserId: input.targetUserId,
    atMs: input.nowMs,
    detail: "start",
  });
  return { session, closed, audits, error: null };
}

export function readViewAsSession(
  session: ViewAsSessionRow | null,
  nowMs: number,
): { active: ViewAsSessionRow | null; expired: ViewAsSessionRow | null; audits: ViewAsAudit[] } {
  if (!session || session.endedAtMs != null) return { active: null, expired: null, audits: [] };
  if (isViewAsExpired(session.expiresAtMs, nowMs)) {
    const expired = { ...session, endedAtMs: nowMs, endReason: "expired" as const };
    return {
      active: null,
      expired,
      audits: [
        {
          kind: "view_as_expired",
          actorUserId: session.adminUserId,
          targetUserId: session.targetUserId,
          atMs: nowMs,
          detail: "expired",
        },
      ],
    };
  }
  return { active: session, expired: null, audits: [] };
}

export function exitViewAsSession(
  session: ViewAsSessionRow | null,
  nowMs: number,
): { closed: ViewAsSessionRow | null; audits: ViewAsAudit[] } {
  if (!session || session.endedAtMs != null) return { closed: null, audits: [] };
  return {
    closed: { ...session, endedAtMs: nowMs, endReason: "exit" },
    audits: [
      {
        kind: "view_as_exit",
        actorUserId: session.adminUserId,
        targetUserId: session.targetUserId,
        atMs: nowMs,
        detail: "exit",
      },
    ],
  };
}

export function fillViewAs(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
