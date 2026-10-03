/**
 * Weekly check-in for claimed daycares.
 * Email stays off unless FEATURE_VACANCY_CHECKIN is on, and still needs CASL.
 * SMS stays off. Toll-free SMS is not approved, so that path never sends.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { vacancyCheckinEnabled, vacancyCheckinSmsEnabled } from "@/lib/features";
import {
  isVacancyCheckinChoice,
  vacancyCheckinWrite,
  type VacancyCheckinChoice,
} from "@/lib/vacancy-checkin";
import {
  signVacancyCheckinToken,
  vacancyCheckinSecret,
  verifyVacancyCheckinToken,
} from "@/lib/vacancy-checkin-token";

export type VacancyCheckinView = {
  ok: true;
  name: string;
  weeklyViews: number;
};

export const getVacancyCheckin = createServerFn({ method: "GET" })
  .validator((token: string) => String(token || ""))
  .handler(async ({ data }) => readVacancyCheckin(data));

async function readVacancyCheckin(token: string): Promise<VacancyCheckinView | { ok: false }> {
  const payload = verifyVacancyCheckinToken(token, vacancyCheckinSecret());
  if (!payload) return { ok: false };
  const sql = await getSql();
  const rows = await sql<{ name: string }>`
    select name from daycares where id = ${payload.daycareId} and claimed_at is not null limit 1
  `.catch(() => []);
  if (!rows[0]) return { ok: false };
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const views = await sql<{ n: number }>`
    select coalesce(sum(count), 0)::int as n
    from daycare_views
    where daycare_id = ${payload.daycareId} and viewed_on >= ${since}
  `.catch(() => [{ n: 0 }]);
  return { ok: true, name: rows[0].name, weeklyViews: Number(views[0]?.n) || 0 };
}

export async function applyVacancyCheckin(
  token: string,
  choice: VacancyCheckinChoice,
): Promise<{ ok: true; choice: VacancyCheckinChoice } | { ok: false }> {
  const payload = verifyVacancyCheckinToken(token, vacancyCheckinSecret());
  if (!payload) return { ok: false };
  const write = vacancyCheckinWrite(choice);
  const sql = await getSql();
  const wrote = await sql<{ id: string }>`
    update daycares
    set last_vacancy_updated_at = now(),
        open_spots_confirmed = ${write.spots},
        open_spots_confirmed_plus = ${write.plus},
        spots_infant = case when ${write.clearAgeSpots} then 0 else spots_infant end,
        spots_toddler = case when ${write.clearAgeSpots} then 0 else spots_toddler end,
        spots_preschool = case when ${write.clearAgeSpots} then 0 else spots_preschool end
    where id = ${payload.daycareId} and claimed_at is not null
    returning id
  `;
  if (!wrote[0]) return { ok: false };
  return { ok: true, choice };
}

export async function sendVacancyCheckinSms(): Promise<{ sent: false; reason: "flag_off" | "toll_free_not_approved" }> {
  if (!vacancyCheckinSmsEnabled()) return { sent: false, reason: "flag_off" };
  return { sent: false, reason: "toll_free_not_approved" };
}

export async function runVacancyCheckinJob(): Promise<
  { ok: true; sent: number; reason: "flag_off" | "sent" | "no_secret" }
> {
  if (!vacancyCheckinEnabled()) return { ok: true, sent: 0, reason: "flag_off" };
  const secret = vacancyCheckinSecret();
  if (!secret) return { ok: true, sent: 0, reason: "no_secret" };
  const sql = await getSql();
  const rows = await sql<{ daycare_id: string; name: string; user_id: string; email: string }>`
    select d.id as daycare_id, d.name, u.id as user_id, u.email
    from daycares d
    join provider_daycares p on p.daycare_id = d.id
    join "user" u on u.id = p.user_id
    where d.claimed_at is not null
      and u.email is not null
      and length(trim(u.email)) > 3
  `.catch(() => []);
  let sent = 0;
  const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
  const { sendTransactionalMail } = await import("@/lib/transactional-mail");
  const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca";
  for (const row of rows) {
    const to = row.email.trim();
    const casl = await evaluateCaslSend({ userId: row.user_id, channel: "email", purpose: "service", address: to });
    if (!casl.ok) continue;
    const token = signVacancyCheckinToken(row.daycare_id, secret);
    if (!token) continue;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const views = await sql<{ n: number }>`
      select coalesce(sum(count), 0)::int as n
      from daycare_views
      where daycare_id = ${row.daycare_id} and viewed_on >= ${since}
    `.catch(() => [{ n: 0 }]);
    const n = Number(views[0]?.n) || 0;
    const link = `${origin}/vacancy-checkin/${encodeURIComponent(token)}`;
    const safeName = row.name.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch);
    const text = `${row.name}: parents viewed your listing ${n} times in the last 7 days. Tap one number to update open spots. You do not need to sign in. ${link}`;
    const mail = await sendTransactionalMail({
      purpose: "vacancy_checkin",
      to,
      subject: "How many open spots this week?",
      text,
      html: `<p>${safeName}: parents viewed your listing ${n} times in the last 7 days.</p><p><a href="${link}">Tap one number</a>. You do not need to sign in.</p>`,
    });
    if (mail.status === "sent") sent += 1;
  }
  return { ok: true, sent, reason: "sent" };
}

export function parseCheckinChoice(value: unknown): VacancyCheckinChoice | null {
  return isVacancyCheckinChoice(value) ? (Number(value) as VacancyCheckinChoice) : null;
}
