import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  OPEN_SPOTS_TOKEN_TTL_MS,
  ageGroupsInRange,
  applyOpenSpotsBand,
  checkinDispatchPlan,
  checkinEmailText,
  checkinSmsText,
  checkinWeekKey,
  isOpenSpotsBand,
  viewsWindowStart,
  type OpenSpotsBand,
  type SpotCounts,
} from "@/lib/open-spots-checkin";
import { openSpotsCheckinMailEnabled, openSpotsCheckinSmsEnabled } from "@/lib/features";
import {
  openSpotsTokenSecret,
  signOpenSpotsToken,
  verifyOpenSpotsToken,
} from "@/lib/open-spots-checkin-token";

const ORIGIN = "https://www.kidease.ca";

type DaycareRow = {
  id: string;
  name: string;
  phone: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  confirmed_open_spots: number | null;
  owner_id: string | null;
  email: string | null;
};

function spotsOf(row: Pick<DaycareRow, "spots_infant" | "spots_toddler" | "spots_preschool">): SpotCounts {
  return {
    infant: Number(row.spots_infant) || 0,
    toddler: Number(row.spots_toddler) || 0,
    preschool: Number(row.spots_preschool) || 0,
  };
}

async function viewsThisWeek(daycareId: string, now: number): Promise<number> {
  const sql = await getSql();
  const start = viewsWindowStart(now);
  const rows = await sql<{ views: number }>`
    select coalesce(sum(count), 0)::int as views
    from daycare_views
    where daycare_id = ${daycareId}
      and viewed_on >= ${start}
  `.catch(() => [] as { views: number }[]);
  return Number(rows[0]?.views) || 0;
}

async function loadClaimed(daycareId: string): Promise<DaycareRow | null> {
  const sql = await getSql();
  const rows = await sql<DaycareRow>`
    select d.id, d.name, d.phone, d.age_min_months, d.age_max_months,
           d.spots_infant, d.spots_toddler, d.spots_preschool, d.confirmed_open_spots,
           owner.user_id as owner_id,
           coalesce(nullif(trim(d.contact_email), ''), owner.email) as email
    from daycares d
    left join lateral (
      select p.user_id, u.email
      from provider_daycares p
      join "user" u on u.id = p.user_id
      where p.daycare_id = d.id
      order by u."createdAt" asc
      limit 1
    ) owner on true
    where d.id = ${daycareId}
      and d.claimed_at is not null
      and coalesce(d.is_test, 0) = 0
      and coalesce(d.claim_status, '') not in ('rejected', 'superseded', 'unclaimed')
    limit 1
  `.catch(() => [] as DaycareRow[]);
  return rows[0] ?? null;
}

export type OpenSpotsPreview =
  | { ok: false }
  | {
      ok: true;
      name: string;
      views: number;
      confirmedOpenSpots: number | null;
    };

export async function previewOpenSpotsLink(token: string, now = Date.now()): Promise<OpenSpotsPreview> {
  const payload = verifyOpenSpotsToken(token, openSpotsTokenSecret(), now);
  if (!payload) return { ok: false };
  const row = await loadClaimed(payload.daycareId);
  if (!row) return { ok: false };
  const views = await viewsThisWeek(row.id, now);
  return {
    ok: true,
    name: row.name,
    views,
    confirmedOpenSpots: row.confirmed_open_spots == null ? null : Number(row.confirmed_open_spots),
  };
}

export async function applyOpenSpotsLink(
  token: string,
  band: OpenSpotsBand,
  now = Date.now(),
): Promise<
  | { ok: false }
  | { ok: true; name: string; views: number; band: OpenSpotsBand; splitKnown: boolean; age: string | null }
> {
  const payload = verifyOpenSpotsToken(token, openSpotsTokenSecret(), now);
  if (!payload) return { ok: false };
  const row = await loadClaimed(payload.daycareId);
  if (!row) return { ok: false };
  const groups = ageGroupsInRange(row.age_min_months, row.age_max_months);
  const next = applyOpenSpotsBand(spotsOf(row), groups, band);
  const views = await viewsThisWeek(row.id, now);
  const sql = await getSql();
  if (next.splitKnown) {
    await sql`
      update daycares set
        spots_infant = ${next.spots.infant},
        spots_toddler = ${next.spots.toddler},
        spots_preschool = ${next.spots.preschool},
        confirmed_open_spots = ${next.confirmedOpenSpots},
        last_vacancy_updated_at = now()
      where id = ${row.id}
    `;
  } else {
    await sql`
      update daycares set
        confirmed_open_spots = ${next.confirmedOpenSpots},
        last_vacancy_updated_at = now()
      where id = ${row.id}
    `;
  }
  const id = `osc_${randomBytes(8).toString("hex")}`;
  await sql`
    insert into open_spots_checkins (id, daycare_id, band, views_week, split_known)
    values (${id}, ${row.id}, ${band}, ${views}, ${next.splitKnown})
  `.catch(() => undefined);
  return {
    ok: true,
    name: row.name,
    views,
    band,
    splitKnown: next.splitKnown,
    age: groups.length === 1 ? groups[0] : null,
  };
}

type Recipient = DaycareRow & { phone: string | null };

async function listRecipients(): Promise<Recipient[]> {
  const sql = await getSql();
  return sql<Recipient>`
    select d.id, d.name, d.phone, d.age_min_months, d.age_max_months,
           d.spots_infant, d.spots_toddler, d.spots_preschool, d.confirmed_open_spots,
           owner.user_id as owner_id,
           coalesce(nullif(trim(d.contact_email), ''), owner.email) as email
    from daycares d
    left join lateral (
      select p.user_id, u.email
      from provider_daycares p
      join "user" u on u.id = p.user_id
      where p.daycare_id = d.id
      order by u."createdAt" asc
      limit 1
    ) owner on true
    where d.claimed_at is not null
      and coalesce(d.is_test, 0) = 0
      and coalesce(d.claim_status, '') not in ('rejected', 'superseded', 'unclaimed')
    order by d.id
    limit 2000
  `.catch(() => [] as Recipient[]);
}

async function claimSend(daycareId: string, week: string, channel: "email" | "sms"): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ daycare_id: string }>`
    insert into open_spots_checkin_sends (daycare_id, week, channel)
    values (${daycareId}, ${week}, ${channel})
    on conflict (daycare_id, week, channel) do nothing
    returning daycare_id
  `.catch(() => [] as { daycare_id: string }[]);
  return Boolean(rows[0]);
}

async function releaseSend(daycareId: string, week: string, channel: "email" | "sms") {
  const sql = await getSql();
  await sql`
    delete from open_spots_checkin_sends
    where daycare_id = ${daycareId} and week = ${week} and channel = ${channel}
  `.catch(() => undefined);
}

function pageLinks(token: string) {
  const base = `${ORIGIN}/spots/${token}`;
  return {
    0: `${base}?band=0`,
    1: `${base}?band=1`,
    2: `${base}?band=2`,
    3: `${base}?band=3`,
  } as Record<OpenSpotsBand, string>;
}

export async function runOpenSpotsCheckinJob(options: { dryRun?: boolean; now?: number } = {}) {
  const now = options.now ?? Date.now();
  const plan = checkinDispatchPlan(openSpotsCheckinMailEnabled(), openSpotsCheckinSmsEnabled());
  if (plan.skipped) {
    return { ok: true, skipped: true, reason: "flags-off", emailed: 0, sms: 0 };
  }
  const secret = openSpotsTokenSecret();
  if (!secret) {
    return { ok: true, skipped: true, reason: "no-secret", emailed: 0, sms: 0 };
  }
  const week = checkinWeekKey(now);
  const rows = await listRecipients();
  let emailed = 0;
  let sms = 0;
  const { sendTransactionalMail } = await import("@/lib/transactional-mail");
  const { sendSms } = await import("@/lib/server/sms");
  const { readConsent } = await import("@/lib/server/casl-consent");
  for (const row of rows) {
    const token = signOpenSpotsToken({ daycareId: row.id, exp: now + OPEN_SPOTS_TOKEN_TTL_MS }, secret);
    if (!token) continue;
    const views = await viewsThisWeek(row.id, now);
    const links = pageLinks(token);
    if (plan.email && row.email) {
      const claimed = options.dryRun ? true : await claimSend(row.id, week, "email");
      if (claimed && !options.dryRun) {
        const mail = checkinEmailText({ name: row.name, views, links });
        try {
          await sendTransactionalMail({
            purpose: "open_spots_checkin",
            to: row.email,
            subject: mail.subject,
            text: mail.text,
            html: `<p>${mail.text.replace(/\n/g, "<br>")}</p>`,
          });
          emailed += 1;
        } catch {
          await releaseSend(row.id, week, "email");
        }
      } else if (options.dryRun) {
        emailed += 1;
      }
    }
    if (plan.sms && row.phone && row.owner_id) {
      const consent = await readConsent(row.owner_id, "sms", "service").catch(() => null);
      if (!consent?.granted) continue;
      const claimed = options.dryRun ? true : await claimSend(row.id, week, "sms");
      if (!claimed || options.dryRun) {
        if (options.dryRun) sms += 1;
        continue;
      }
      const result = await sendSms({
        to: row.phone,
        body: checkinSmsText({ name: row.name, views, pageUrl: `${ORIGIN}/spots/${token}` }),
        consentGranted: true,
        audience: "user",
      });
      if (result.ok) sms += 1;
      else await releaseSend(row.id, week, "sms");
    }
  }
  return { ok: true, skipped: false, reason: null, emailed, sms, dryRun: Boolean(options.dryRun) };
}

export const previewOpenSpotsCheckin = createServerFn({ method: "GET" })
  .validator((token: string) => String(token || "").trim())
  .handler(async ({ data }) => previewOpenSpotsLink(data));

export const saveOpenSpotsCheckin = createServerFn({ method: "POST" })
  .validator((input: { token?: string; band?: number }) => {
    const band = Number(input?.band);
    const token = String(input?.token || "").trim();
    if (!token || !isOpenSpotsBand(band)) throw new Error("This link is not valid.");
    return { token, band };
  })
  .handler(async ({ data }) => applyOpenSpotsLink(data.token, data.band));
