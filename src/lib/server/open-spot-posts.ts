/**
 * Age-group open spots. FEATURE_AGE_OPEN_SPOTS defaults off.
 * Mail uses FEATURE_OPEN_SPOT_ALERTS. Push uses FEATURE_PUSH. No fee.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ageOpenSpotsEnabled, openSpotAlertsEnabled } from "@/lib/features";
import { cleanSpotCount, matchOpenSpotParent, orderedByRank, parsePostAge, type SpotParent } from "@/lib/gap-features";
import { nid } from "@/lib/utils";
import { canCentreWriteLeadsFor } from "./centre-access";

export const ageOpenSpotsFlag = createServerFn({ method: "GET" }).handler(async () => ageOpenSpotsEnabled());

export const postAgeOpenSpots = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; ageGroup?: string; spots?: number }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    ageGroup: String(input?.ageGroup || "").trim(),
    spots: input?.spots,
  }))
  .handler(async ({ context, data }) => {
    if (!ageOpenSpotsEnabled()) return { ok: false as const, reason: "off" as const, matched: 0, nextWaitlistId: null as string | null };
    const age = parsePostAge(data.ageGroup);
    const spots = cleanSpotCount(data.spots);
    if (!data.daycareId || !age || spots == null) throw new Error("Choose an age group and a number of spots.");
    const sql = await getSql();
    if (!(await canCentreWriteLeadsFor(sql, context.userId, data.daycareId))) {
      throw new Error("That centre is not on this account");
    }
    const id = nid("osp");
    await sql`
      insert into open_spot_posts (id, daycare_id, age_group, spots, created_by)
      values (${id}, ${data.daycareId}, ${age}, ${spots}, ${context.userId})
    `;
    if (age === "infant") {
      await sql`update daycares set spots_infant = ${spots}, spots_updated_at = now() where id = ${data.daycareId}`;
    } else if (age === "toddler") {
      await sql`update daycares set spots_toddler = ${spots}, spots_updated_at = now() where id = ${data.daycareId}`;
    } else {
      await sql`update daycares set spots_preschool = ${spots}, spots_updated_at = now() where id = ${data.daycareId}`;
    }

    const waiting = await sql<{
      id: string;
      user_id: string;
      age_group: string;
      joined_at: string | Date;
      rank_order: number | null;
      status: string;
    }>`
      select id, user_id, age_group, joined_at, rank_order, status
      from daycare_waitlist
      where daycare_id = ${data.daycareId} and status in ('waiting', 'offered')
    `.catch(
      () =>
        [] as {
          id: string;
          user_id: string;
          age_group: string;
          joined_at: string | Date;
          rank_order: number | null;
          status: string;
        }[],
    );
    const interests = await sql<{ user_id: string; age_band: string }>`
      select user_id, age_band from waitlist_interests where daycare_id = ${data.daycareId}
    `.catch(() => [] as { user_id: string; age_band: string }[]);
    const saved = await sql<{ user_id: string }>`
      select user_id from saved_daycares where daycare_id = ${data.daycareId}
    `.catch(() => [] as { user_id: string }[]);
    const savedIds = saved.map((row) => row.user_id);
    const searches = savedIds.length
      ? await sql
          .query<{ user_id: string; age_band: string }>(
            `select user_id, age_band from saved_searches where user_id = any($1::text[]) and coalesce(kind, 'search') = 'search'`,
            [savedIds],
          )
          .catch(() => [] as { user_id: string; age_band: string }[])
      : [];

    const byUser = new Map<string, SpotParent>();
    const ensure = (userId: string) => {
      const hit = byUser.get(userId);
      if (hit) return hit;
      const next: SpotParent = { userId, waitlistAge: null, interestAge: null, saved: false, searchAges: [] };
      byUser.set(userId, next);
      return next;
    };
    for (const row of waiting) {
      const person = ensure(row.user_id);
      if (!person.waitlistAge) person.waitlistAge = row.age_group;
    }
    for (const row of interests) ensure(row.user_id).interestAge = row.age_band;
    for (const row of saved) ensure(row.user_id).saved = true;
    for (const row of searches) ensure(row.user_id).searchAges.push(row.age_band);

    const matched = [...byUser.values()].flatMap((person) => {
      const source = matchOpenSpotParent(age, person);
      return source ? [{ userId: person.userId, source }] : [];
    });
    const centre = await sql<{ name: string; slug: string }>`
      select name, slug from daycares where id = ${data.daycareId} limit 1
    `;
    const name = centre[0]?.name || "A centre";
    const slug = centre[0]?.slug || "";
    const mailOn = openSpotAlertsEnabled();
    if (matched.length) {
      const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
      for (const row of matched) {
        await sql`
          insert into open_spot_notices (id, post_id, user_id, source)
          values (${nid("osn")}, ${id}, ${row.userId}, ${row.source})
          on conflict (post_id, user_id) do nothing
        `.catch(() => undefined);
        await dispatchCustomerAlert({
          userId: row.userId,
          category: "spot_opened",
          vars: { name, status: age },
          href: slug ? `/daycare/${slug}` : "/parent",
          dedupeKey: `open-spot:${id}:${row.userId}`,
          emailFallback: mailOn,
        }).catch(() => undefined);
      }
    }
    const nextWaitlistId =
      orderedByRank(
        waiting.map((row) => ({
          id: row.id,
          rank: row.rank_order == null ? null : Number(row.rank_order),
          joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : String(row.joined_at),
          status: row.status,
        })),
      ).find((row) => {
        const src = waiting.find((item) => item.id === row.id);
        return src?.status === "waiting" && (src.age_group === age || src.age_group === "any");
      })?.id ?? null;
    return { ok: true as const, id, matched: matched.length, nextWaitlistId };
  });
