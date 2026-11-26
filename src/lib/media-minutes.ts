/**
 * Real minutes for the daily media cap (FEATURE_VIDEO / FEATURE_VOICE).
 *
 * A join or placed call reserves the admin "minutes per call" estimate first,
 * so the cap still blocks before Twilio reports back. A signed Twilio report
 * then settles the row to real minutes and moves outbound_daily_usage by
 * (actual - reserved), never below zero.
 *
 * Pure: SQL text is shared with scripts/media-minutes.test.mjs (PGlite).
 */

/** Seconds → billed minutes (Twilio bills each started minute). */
export function billedMinutes(seconds: unknown): number {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 60);
}

/**
 * In-app voice is two Twilio Client legs (caller and answerer), each billed.
 * A call that was not answered still bills the caller leg for about a minute.
 */
export function voiceCallMinutes(dialStatus: string | null | undefined, dialDurationSeconds: unknown): number {
  const status = String(dialStatus || "").trim().toLowerCase();
  const talk = billedMinutes(dialDurationSeconds);
  if (status === "completed" || status === "answered") return Math.max(1, talk) * 2;
  return 1;
}

/** Hard ceiling for one in-app voice call (TwiML <Dial timeLimit>). */
export const VOICE_CALL_TIME_LIMIT_SECONDS = 1800;

export const MEDIA_RESERVE_SQL = `
insert into media_sessions (id, kind, twilio_sid, identity, conversation_id, user_id, usage_day, reserved_minutes)
values ($1, $2, $3, $4, $5, $6, $7::date, $8)
on conflict (id) do nothing
`;

/** $1 room SID, $2 identity, $3 participant SID (settle_ref), $4 actual minutes. */
export const SETTLE_VIDEO_PARTICIPANT_SQL = `
with target as (
  select id, usage_day, reserved_minutes from media_sessions
  where kind = 'video' and twilio_sid = $1 and identity = $2 and status = 'open'
    and not exists (select 1 from media_sessions done where done.settle_ref = $3)
  order by created_at
  limit 1
  for update skip locked
), settled as (
  update media_sessions m
  set status = 'settled', actual_minutes = $4::int, settle_ref = $3, settled_at = now()
  from target
  where m.id = target.id
  returning target.usage_day as usage_day, target.reserved_minutes as reserved_minutes
)
update outbound_daily_usage u
set used = greatest(0, u.used + ($4::int - s.reserved_minutes))
from settled s
where u.day = s.usage_day and u.channel = 'media'
returning u.used
`;

/**
 * Room ended: settle any join that never reported (never connected, or a lost
 * callback) at no more than its reservation. $1 room SID, $2 room minutes.
 */
export const SETTLE_VIDEO_ROOM_SQL = `
with settled as (
  update media_sessions
  set status = 'settled', actual_minutes = least(reserved_minutes, $2::int), settled_at = now()
  where kind = 'video' and twilio_sid = $1 and status = 'open'
  returning usage_day, reserved_minutes, actual_minutes
), agg as (
  select usage_day, sum(actual_minutes - reserved_minutes)::int as delta from settled group by usage_day
)
update outbound_daily_usage u
set used = greatest(0, u.used + agg.delta)
from agg
where u.day = agg.usage_day and u.channel = 'media'
returning u.used
`;

/** $1 call SID, $2 actual minutes. Idempotent: only an open row settles. */
export const SETTLE_VOICE_CALL_SQL = `
with settled as (
  update media_sessions
  set status = 'settled', actual_minutes = $2::int, settle_ref = 'voice:' || $1, settled_at = now()
  where kind = 'voice' and twilio_sid = $1 and status = 'open'
  returning usage_day, reserved_minutes
)
update outbound_daily_usage u
set used = greatest(0, u.used + ($2::int - s.reserved_minutes))
from settled s
where u.day = s.usage_day and u.channel = 'media'
returning u.used
`;
