import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  familyInviteCode,
  growthLoopsEnabled,
  thankYouDecision,
  THANK_YOU_KIND,
} from "@/lib/growth-loops";
import { normalizeReferralCode } from "@/lib/referrals";

function rewardId(): string {
  return `rw_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function noteThankYou(referrerId: string, referredId: string): Promise<ThankYouWrite> {
  if (!growthLoopsEnabled()) return { noted: false, reason: "off" };
  const sql = await getSql();
  const prior = await sql<{ n: number | string }>`
    select count(*)::int as n from referral_rewards where referred_user_id = ${referredId}
  `;
  const earned = await sql<{ n: number | string }>`
    select count(*)::int as n from referral_rewards where referrer_user_id = ${referrerId}
  `;
  const decision = thankYouDecision({
    enabled: true,
    referrerId,
    referredId,
    alreadyRewarded: Number(prior[0]?.n ?? 0) > 0,
    earnedCount: Number(earned[0]?.n ?? 0),
  });
  if (decision !== "earn") return { noted: false, reason: decision };
  await sql`
    insert into referral_rewards (id, referrer_user_id, referred_user_id, kind)
    values (${rewardId()}, ${referrerId}, ${referredId}, ${THANK_YOU_KIND})
  `;
  return { noted: true, reason: "earn" };
}

export type ThankYouWrite = { noted: boolean; reason: string };

export const loadGrowthSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!growthLoopsEnabled()) return { enabled: false as const, thankYous: 0, invite: null };
    const sql = await getSql();
    const rewards = await sql<{ n: number | string }>`
      select count(*)::int as n from referral_rewards where referrer_user_id = ${context.userId}
    `;
    const invites = await sql<{ code: string; centre_name: string; opens: number | string }>`
      select code, centre_name, opens from family_invites where user_id = ${context.userId} limit 1
    `;
    const row = invites[0];
    return {
      enabled: true as const,
      thankYous: Number(rewards[0]?.n ?? 0),
      invite: row
        ? { code: row.code, centreName: row.centre_name, opens: Number(row.opens) || 0 }
        : null,
    };
  });

export const createFamilyInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!growthLoopsEnabled()) return { ok: false as const, reason: "off" as const };
    const sql = await getSql();
    const existing = await sql<{ code: string; centre_name: string }>`
      select code, centre_name from family_invites where user_id = ${context.userId} limit 1
    `;
    if (existing[0]) return { ok: true as const, code: existing[0].code, centreName: existing[0].centre_name };
    const centres = await sql<{ id: string; name: string }>`
      select d.id, d.name
      from centre_members m
      join daycares d on d.id = m.daycare_id
      where m.user_id = ${context.userId} and m.status = 'active'
      order by d.name
      limit 1
    `;
    const centre = centres[0];
    if (!centre?.id || !centre.name?.trim()) return { ok: false as const, reason: "no_centre" as const };
    const code = familyInviteCode();
    await sql`
      insert into family_invites (user_id, daycare_id, centre_name, code)
      values (${context.userId}, ${centre.id}, ${centre.name.trim().slice(0, 120)}, ${code})
    `;
    return { ok: true as const, code, centreName: centre.name.trim() };
  });

export const peekFamilyInvite = createServerFn({ method: "GET" })
  .validator((code: string) => String(code || ""))
  .handler(async ({ data }) => openFamilyInvite(data));

export async function openFamilyInvite(raw: string): Promise<{ centreName: string } | null> {
  if (!growthLoopsEnabled()) return null;
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const sql = await getSql();
  const rows = await sql<{ centre_name: string }>`
    update family_invites set opens = opens + 1 where code = ${code} returning centre_name
  `;
  const name = rows[0]?.centre_name?.trim();
  return name ? { centreName: name } : null;
}

export async function purgeGrowthRows(userId: string) {
  const sql = await getSql();
  await sql`delete from referral_rewards where referrer_user_id = ${userId} or referred_user_id = ${userId}`.catch(
    () => undefined,
  );
  await sql`delete from family_invites where user_id = ${userId}`.catch(() => undefined);
}
