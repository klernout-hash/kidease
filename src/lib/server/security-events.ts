import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";

export type SecurityKind =
  | "login"
  | "2fa_ok"
  | "2fa_fail"
  | "2fa_required"
  | "role_change"
  | "session_revoke"
  | "listing_claim"
  | "contract"
  | "payout"
  | "webhook_accept"
  | "webhook_reject"
  | "digest_denied"
  | "digest_run";

/** Insert-only audit row. Never pass secrets, card data, or medical notes. */
export async function logSecurityEvent(input: {
  kind: SecurityKind;
  actorUserId?: string | null;
  targetUserId?: string | null;
  daycareId?: string | null;
  ip?: string | null;
  detail?: string | null;
}) {
  const sql = await getSql();
  const id = randomBytes(16).toString("hex");
  const detail = (input.detail || "").slice(0, 240);
  await sql`
    insert into security_events (id, kind, actor_user_id, target_user_id, daycare_id, ip, detail)
    values (
      ${id},
      ${input.kind},
      ${input.actorUserId ?? null},
      ${input.targetUserId ?? null},
      ${input.daycareId ?? null},
      ${input.ip ?? null},
      ${detail || null}
    )
  `.catch(() => undefined);
}

export function requestIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || null;
}
