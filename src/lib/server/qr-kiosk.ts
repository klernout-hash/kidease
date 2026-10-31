import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { centreCanWriteCare } from "@/lib/centre-roles";
import { getSql } from "@/lib/db";
import { qrKioskEnabled } from "@/lib/features";
import {
  attendanceStatusForKiosk,
  isKioskAction,
  kioskExpiresAt,
  kioskReady,
  kioskRedeemDecision,
  kioskScanUrl,
  kioskTokenSecret,
  mintKioskToken,
  verifyKioskToken,
  type KioskAction,
} from "@/lib/qr-kiosk";
import { loadCentreRole, listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { nid } from "@/lib/utils";

const OFF = { enabled: false as const };

function publicOrigin(): string {
  return process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca";
}

export const getKioskFrame = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!qrKioskEnabled()) return OFF;
    const ready = kioskReady();
    if (!ready.canMint) {
      return { enabled: true as const, ready: false as const, reason: "key" as const };
    }
    const sql = await getSql();
    const accessible = await listAccessibleDaycareIds(sql, context.userId);
    const daycareId = data.daycareId && accessible.includes(data.daycareId) ? data.daycareId : accessible[0];
    if (!daycareId) return { enabled: true as const, ready: false as const, reason: "centre" as const };
    const role = await loadCentreRole(sql, context.userId, daycareId);
    if (!centreCanWriteCare(role)) return { enabled: true as const, ready: false as const, reason: "centre" as const };
    const minted = mintKioskToken({ daycareId, secret: kioskTokenSecret(), enabled: true });
    if (!minted) return { enabled: true as const, ready: false as const, reason: "key" as const };
    const names = await sql<{ name: string }>`select name from daycares where id = ${daycareId} limit 1`;
    const url = kioskScanUrl(publicOrigin(), minted.token);
    const QRCode = await import("qrcode");
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 280 });
    return {
      enabled: true as const,
      ready: true as const,
      daycareId,
      centreName: names[0]?.name || "",
      svg,
      expiresAt: minted.expiresAt || kioskExpiresAt(),
    };
  });

export const previewKioskCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token?: string }) => ({ token: String(input?.token || "").trim().slice(0, 400) }))
  .handler(async ({ context, data }) => {
    if (!qrKioskEnabled()) return OFF;
    const verified = verifyKioskToken(data.token, kioskTokenSecret());
    if (!verified) return { enabled: true as const, ok: false as const, reason: "bad_code" as const };
    const sql = await getSql();
    const names = await sql<{ name: string }>`select name from daycares where id = ${verified.daycareId} limit 1`;
    const children = await sql<{ child_id: string; child_name: string }>`
      select b.child_id, coalesce(c.name, 'Child') as child_name
      from bookings b
      left join children c on c.id = b.child_id
      where b.daycare_id = ${verified.daycareId}
        and b.user_id = ${context.userId}
        and b.status in ('accepted', 'active')
        and coalesce(b.child_id, '') <> ''
    `.catch(() => [] as { child_id: string; child_name: string }[]);
    return {
      enabled: true as const,
      ok: true as const,
      centreName: names[0]?.name || "",
      children: children.map((row) => ({ id: row.child_id, name: row.child_name })),
    };
  });

export const redeemKioskScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token?: string; childId?: string; action?: string }) => ({
    token: String(input?.token || "").trim().slice(0, 400),
    childId: String(input?.childId || "").trim().slice(0, 80),
    action: String(input?.action || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    const enabled = qrKioskEnabled();
    const verified = enabled ? verifyKioskToken(data.token, kioskTokenSecret()) : null;
    if (!enabled || !verified || !isKioskAction(data.action) || !data.childId) {
      const decision = kioskRedeemDecision({
        enabled,
        verified: Boolean(verified),
        enrolled: false,
        action: data.action,
        alreadyUsed: false,
      });
      return decision;
    }
    const action: KioskAction = data.action;
    const sql = await getSql();
    const enrolled = await sql<{ id: string; child_name: string }>`
      select b.id, coalesce(c.name, 'Child') as child_name
      from bookings b
      left join children c on c.id = b.child_id
      where b.user_id = ${context.userId}
        and b.daycare_id = ${verified.daycareId}
        and b.child_id = ${data.childId}
        and b.status in ('accepted', 'active')
      limit 1
    `.catch(() => [] as { id: string; child_name: string }[]);
    const prior = await sql<{ id: string }>`
      select id from kiosk_scans
      where daycare_id = ${verified.daycareId}
        and child_id = ${data.childId}
        and window_id = ${verified.window}
        and action = ${action}
      limit 1
    `.catch(() => [] as { id: string }[]);
    const decision = kioskRedeemDecision({
      enabled: true,
      verified: true,
      enrolled: Boolean(enrolled[0]),
      action,
      alreadyUsed: Boolean(prior[0]),
    });
    if (!decision.ok || !enrolled[0]) return decision;
    const status = attendanceStatusForKiosk(action);
    const day = new Date().toISOString().slice(0, 10);
    await sql`
      insert into kiosk_scans (id, daycare_id, child_id, parent_user_id, action, window_id)
      values (${nid("ks")}, ${verified.daycareId}, ${data.childId}, ${context.userId}, ${action}, ${verified.window})
    `;
    await sql`
      insert into attendance (
        id, daycare_id, booking_id, child_name, parent_user_id, day, drop_off, pick_up, status, notes, updated_by
      ) values (
        ${nid("at")}, ${verified.daycareId}, ${enrolled[0].id}, ${enrolled[0].child_name},
        ${context.userId}, ${day}, ${"07:30"}, ${"17:00"}, ${status}, ${""}, ${context.userId}
      )
      on conflict (daycare_id, child_name, day)
      do update set status = excluded.status, updated_by = excluded.updated_by
    `;
    return decision;
  });
