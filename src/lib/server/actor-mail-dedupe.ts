import { getSql } from "@/lib/db";
import { PROVIDER_ONBOARD_PURPOSE, winnipegDayKey } from "@/lib/signup-user-mail";

async function ensureTable() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists actor_mail_sends (
      purpose text not null,
      email text not null,
      winnipeg_day date not null,
      user_id text,
      created_at timestamptz not null default now(),
      primary key (purpose, email, winnipeg_day)
    )
  `).catch(() => undefined);
}

/** Claim the same-day slot. Returns false when this mailbox already got this purpose today (Winnipeg). */
export async function claimActorMailDay(input: {
  purpose?: string;
  email: string;
  userId?: string | null;
  at?: Date;
}): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  const purpose = input.purpose || PROVIDER_ONBOARD_PURPOSE;
  const day = winnipegDayKey(input.at);
  await ensureTable();
  const sql = await getSql();
  const rows = await sql
    .query<{ purpose: string }>(
      `insert into actor_mail_sends (purpose, email, winnipeg_day, user_id)
       values ($1, $2, $3::date, $4)
       on conflict (purpose, email, winnipeg_day) do nothing
       returning purpose`,
      [purpose, email, day, input.userId ?? null],
    )
    .catch(() => [] as { purpose: string }[]);
  return Boolean(rows[0]);
}

export async function releaseActorMailDay(input: {
  purpose?: string;
  email: string;
  at?: Date;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email) return;
  const purpose = input.purpose || PROVIDER_ONBOARD_PURPOSE;
  const day = winnipegDayKey(input.at);
  const sql = await getSql();
  await sql
    .query(`delete from actor_mail_sends where purpose = $1 and email = $2 and winnipeg_day = $3::date`, [
      purpose,
      email,
      day,
    ])
    .catch(() => undefined);
}
