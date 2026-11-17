/**
 * Admin > Outbound safety: read and change the kill switches, daily caps
 * and messaging test mode. Every change writes an audit row.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/server/roles";
import { outboundDay, type OutboundControls } from "@/lib/outbound-controls";

export type OutboundUsageRow = { channel: string; used: number; blocked: number; alerted: boolean };
export type OutboundAuditRow = { at: string; who: string; key: string; from: string | null; to: string | null };

export type OutboundPage =
  | {
      ok: true;
      controls: OutboundControls;
      day: string;
      usage: OutboundUsageRow[];
      audit: OutboundAuditRow[];
      /** Test addresses set in Vercel, masked. */
      envTestEmail: string;
      envTestPhone: string;
    }
  | { ok: false; error: string };

function maskEmail(raw: string): string {
  const [user, domain] = raw.split("@");
  if (!user || !domain) return "";
  return `${user.slice(0, 1)}***@${domain}`;
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 4 ? `+*** *** ${digits.slice(-4)}` : "";
}

export const loadOutboundPage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<OutboundPage> => {
    await requireAdmin(context.userId);
    try {
      const { outboundGate, clearOutboundControlsCache } = await import("@/lib/server/outbound-gate");
      clearOutboundControlsCache();
      const controls = await outboundGate.controls();
      const sql = await getSql();
      const day = outboundDay();
      const usage = await sql<{ channel: string; used: number; blocked: number; alerted_at: string | null }>`
        select channel, used, blocked, alerted_at from outbound_daily_usage where day = ${day}
      `;
      const audit = await sql<{
        at: string;
        actor_email: string | null;
        key: string;
        old_value: string | null;
        new_value: string | null;
      }>`
        select at, actor_email, key, old_value, new_value
        from outbound_control_audit order by at desc limit 20
      `;
      return {
        ok: true,
        controls,
        day,
        usage: usage.map((r) => ({
          channel: r.channel,
          used: Number(r.used) || 0,
          blocked: Number(r.blocked) || 0,
          alerted: Boolean(r.alerted_at),
        })),
        audit: audit.map((r) => ({
          at: new Date(r.at).toISOString(),
          who: r.actor_email || "admin",
          key: r.key,
          from: r.old_value,
          to: r.new_value,
        })),
        envTestEmail: maskEmail((process.env.OUTBOUND_TEST_EMAIL || "").trim()),
        envTestPhone: maskPhone((process.env.OUTBOUND_TEST_PHONE || "").trim()),
      };
    } catch {
      return { ok: false, error: "Outbound settings could not load. The database may need the 0210 migration." };
    }
  });

export const saveOutboundSetting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key: string; value: string }) => ({
    key: String(input?.key || "").slice(0, 60),
    value: String(input?.value ?? "").slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    const { saveOutboundControl } = await import("@/lib/server/outbound-gate");
    const { refreshFlagKills } = await import("@/lib/flags");
    const result = await saveOutboundControl({
      key: data.key,
      value: data.value,
      actorId: context.userId,
      actorEmail: admin?.email ?? null,
    });
    if (result.ok) await refreshFlagKills().catch(() => undefined);
    return result;
  });
