/**
 * Server side of the outbound safety controls: the SQL store, the shared
 * gate every sender calls, the cap alert to Kyle, and the hook that forces
 * group flags off. Imported once by src/server.ts so the hooks are in place.
 */

import { getSql } from "@/lib/db";
import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import { registerFlagKillLoader } from "@/lib/flags";
import { reportError } from "@/lib/observe";
import {
  CONTROL_KEYS,
  OUTBOUND_CHANNEL_LABEL,
  controlsFromRows,
  forcedOffFlags,
  normalizeControlEdit,
  outboundDay,
  type OutboundControls,
} from "@/lib/outbound-controls";
import { blockedMessage, createOutboundGate, registerOutboundGates, type OutboundStore } from "@/lib/outbound-gate-core";

const CONTROLS_TTL_MS = 15_000;
let cached: { at: number; controls: OutboundControls } | null = null;
let controlsGeneration = 0;
let pendingControls: {
  generation: number;
  at: number;
  promise: Promise<OutboundControls>;
} | null = null;

async function readControls(): Promise<OutboundControls> {
  if (cached && Date.now() - cached.at < CONTROLS_TTL_MS) return cached.controls;
  // Share a refresh so concurrent reads cannot overwrite newer settings in
  // completion order. Invalidation also retires any pre-edit refresh.
  if (!pendingControls) {
    pendingControls = {
      generation: controlsGeneration,
      at: Date.now(),
      promise: (async () => {
        const sql = await getSql();
        const rows = await sql<{ key: string; value: string }>`select key, value from outbound_controls`;
        return controlsFromRows(rows);
      })(),
    };
  }
  const pending = pendingControls;
  try {
    const controls = await pending.promise;
    // A saved safety change must affect this waiter too, not just later calls.
    if (pending.generation !== controlsGeneration) return readControls();
    // Query latency consumes the freshness window; never re-age an old result.
    if (Date.now() - pending.at >= CONTROLS_TTL_MS) {
      throw new Error("Outbound safety settings refresh exceeded its freshness window");
    }
    cached = { at: pending.at, controls };
    return controls;
  } finally {
    // A retired request must not clear a newer refresh after it settles.
    if (pendingControls === pending) pendingControls = null;
  }
}

export function clearOutboundControlsCache(): void {
  controlsGeneration += 1;
  cached = null;
  pendingControls = null;
}

export const sqlOutboundStore: OutboundStore = {
  loadControls: readControls,
  async consume({ day, channel, units, cap, essential }) {
    const sql = await getSql();
    const rows = await sql<{ used: number }>`
      insert into outbound_daily_usage (day, channel, used)
      values (${day}, ${channel}, ${units})
      on conflict (day, channel) do update set used = outbound_daily_usage.used + excluded.used
      where ${essential} or outbound_daily_usage.used + excluded.used <= ${cap}
      returning used
    `;
    return rows.length > 0;
  },
  async noteBlocked({ day, channel, alert }) {
    const sql = await getSql();
    await sql`
      insert into outbound_daily_usage (day, channel, used, blocked)
      values (${day}, ${channel}, 0, 1)
      on conflict (day, channel) do update set blocked = outbound_daily_usage.blocked + 1
    `;
    if (!alert) return false;
    const first = await sql<{ day: string }>`
      update outbound_daily_usage set alerted_at = now()
      where day = ${day} and channel = ${channel} and alerted_at is null
      returning day
    `;
    return first.length > 0;
  },
};

async function alertCapHit({ channel, day, cap }: { channel: string; day: string; cap: number }) {
  const { sendTransactionalMail } = await import("@/lib/transactional-mail");
  const label = OUTBOUND_CHANNEL_LABEL[channel as keyof typeof OUTBOUND_CHANNEL_LABEL] || channel;
  const to = (process.env.OUTBOUND_ALERT_EMAIL || "").trim() || KIDEASE_OPERATOR_EMAIL;
  const text = [
    `KidEase reached today's limit for ${label.toLowerCase()} (${cap}) on ${day}.`,
    "New sends on this channel are paused until midnight Winnipeg time.",
    "Password, verification and emergency messages still go out.",
    "Change the limit in Admin > Settings > Outbound safety.",
  ].join("\n");
  await sendTransactionalMail({
    purpose: "host_action",
    to,
    subject: `KidEase: daily ${channel} limit reached`,
    text,
    html: `<p>${text.replace(/\n/g, "<br/>")}</p>`,
    outboundEssential: true,
  });
}

export const outboundGate = createOutboundGate({
  store: sqlOutboundStore,
  alertCapHit,
  onError: (err) => reportError(err, { route: "outbound-gate" }),
});

export const gateOutbound = outboundGate.gate;
export const gateOutboundEmail = outboundGate.gateEmail;
export const gateOutboundSms = outboundGate.gateSms;

/**
 * One video join or placed call. The admin "minutes per call" setting is
 * reserved toward the media cap first; a signed Twilio report later settles
 * it to real minutes (see src/lib/server/media-usage.ts).
 */
export async function gateMediaSession(
  kind: "video" | "voice",
): Promise<{ ok: true; units: number; day: string } | { ok: false; error: string }> {
  let c: OutboundControls;
  try {
    c = await outboundGate.controls();
  } catch {
    return { ok: false, error: blockedMessage("controls_unavailable") };
  }
  const day = outboundDay();
  const r = await gateOutbound({ channel: "media", units: c.mediaMinutesPerSession, label: kind });
  if (r.allow) return { ok: true, units: c.mediaMinutesPerSession, day };
  return { ok: false, error: blockedMessage(r.reason) };
}

/** Admin edit: validate, store, and write the audit row. */
export async function saveOutboundControl(input: {
  key: string;
  value: unknown;
  actorId: string;
  actorEmail: string | null;
}): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const norm = normalizeControlEdit(input.key, input.value);
  if (!norm.ok) return norm;
  const sql = await getSql();
  const before = await sql<{ value: string }>`select value from outbound_controls where key = ${input.key}`;
  const old = before[0]?.value ?? null;
  await sql`
    insert into outbound_controls (key, value, updated_at, updated_by)
    values (${input.key}, ${norm.value}, now(), ${input.actorId})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
  `;
  // The setting is already saved even if the separate audit write fails.
  clearOutboundControlsCache();
  await sql`
    insert into outbound_control_audit (actor_id, actor_email, key, old_value, new_value)
    values (${input.actorId}, ${input.actorEmail}, ${input.key}, ${old}, ${norm.value})
  `;
  return { ok: true, value: norm.value };
}

export { CONTROL_KEYS };

// Group switches force their child flags off (refreshed every 15 s).
registerFlagKillLoader(async () => forcedOffFlags(await readControls()));

// Shared senders (transactional mail, SMS, push, video/voice) find the gate here.
registerOutboundGates({ email: gateOutboundEmail, sms: gateOutboundSms, gate: gateOutbound });
