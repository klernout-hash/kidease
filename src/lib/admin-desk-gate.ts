/**
 * /admin beforeLoad outcomes. Role is checked by assertAdminDesk.
 * 2FA is TwoFactorGate's job — a missing device cookie must not dump
 * an admin-role session on `/` (that looks like a broken Admin pill).
 */

export const ADMIN_LOGIN_SEARCH = {
  role: "admin" as const,
  desk: "admin" as const,
  intent: "admin" as const,
  next: "/admin" as const,
};

export type AdminDeskGateDest =
  | { to: "/login"; search: typeof ADMIN_LOGIN_SEARCH }
  | { to: "/verify-2fa"; search: { next: "/admin" } }
  | { to: "/" };

export function adminGateFailureKind(err: unknown): "login" | "two_factor" | "home" {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();
  if (raw === "Unauthorized" || raw === "admin-gate-timeout") return "login";
  if (msg.includes("unauthorized") || msg.includes("admin-gate-timeout")) return "login";
  if (raw === "Two-factor verification required") return "two_factor";
  if (msg.includes("two-factor") || /\b2fa\b/.test(msg)) return "two_factor";
  return "home";
}

export function adminDeskGateRedirect(err: unknown): AdminDeskGateDest {
  const kind = adminGateFailureKind(err);
  if (kind === "login") return { to: "/login", search: ADMIN_LOGIN_SEARCH };
  if (kind === "two_factor") return { to: "/verify-2fa", search: { next: "/admin" } };
  return { to: "/" };
}
