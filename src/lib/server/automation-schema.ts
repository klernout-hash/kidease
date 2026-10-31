import { getSql } from "@/lib/db";

/** Idempotent sends, run log, and hourly error counts. Safe to call every cron. */
export async function ensureAutomationSchema(): Promise<void> {
  const sql = await getSql();
  await sql
    .query(
      `create table if not exists automation_sends (
        automation text not null,
        dedupe_key text not null,
        channel text not null,
        recipient text not null,
        status text not null,
        created_at timestamptz not null default now(),
        primary key (automation, dedupe_key, channel)
      )`,
    )
    .catch(() => undefined);
  await sql
    .query(
      `create index if not exists automation_sends_recipient_idx
       on automation_sends (recipient, channel, created_at desc)`,
    )
    .catch(() => undefined);
  await sql
    .query(
      `create table if not exists automation_runs (
        id text primary key,
        automation text not null,
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        ok boolean,
        detail text
      )`,
    )
    .catch(() => undefined);
  await sql
    .query(
      `create table if not exists automation_error_counts (
        bucket timestamptz not null,
        source text not null,
        count int not null default 0,
        primary key (bucket, source)
      )`,
    )
    .catch(() => undefined);
  await sql
    .query(`alter table daycares add column if not exists open_spots_hidden_at timestamptz`)
    .catch(() => undefined);
}
