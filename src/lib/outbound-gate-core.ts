/**
 * The send gate, with its storage injected so tests can run without a DB.
 * Every outbound email, SMS, push and video/voice session asks this first.
 */

import {
  CHANNEL_GROUP,
  defaultControls,
  outboundDay,
  precheckOutbound,
  resolveTestRecipient,
  testModeSmsBody,
  testModeSubject,
  type OutboundBlockReason,
  type OutboundChannel,
  type OutboundControls,
} from "./outbound-controls.ts";

export type OutboundStore = {
  loadControls(): Promise<OutboundControls>;
  /** Add units unless that would pass the cap. Essential always adds. Returns false when capped. */
  consume(input: { day: string; channel: OutboundChannel; units: number; cap: number; essential: boolean }): Promise<boolean>;
  /** Count one blocked send. Returns true only the first time this channel is alerted today. */
  noteBlocked(input: { day: string; channel: OutboundChannel; alert: boolean }): Promise<boolean>;
};

export type GateInput = {
  channel: OutboundChannel;
  /** Password, verification and emergency messages. Counted, never blocked. */
  essential?: boolean;
  /** Messages default to 1. Video/voice uses minutes. */
  units?: number;
  /** Short tag for logs, such as "spot-alert". Never the message body. */
  label?: string;
};

export type GateResult =
  | { allow: true; testMode: boolean; testRecipient: string }
  | { allow: false; reason: OutboundBlockReason };

export type GateDeps = {
  store: OutboundStore;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  /** Tell Kyle once per channel per day that a cap was hit. */
  alertCapHit?: (input: { channel: OutboundChannel; day: string; cap: number }) => Promise<void>;
  log?: (line: string, data: Record<string, unknown>) => void;
  onError?: (err: unknown) => void;
};

export function createOutboundGate(deps: GateDeps) {
  const env = deps.env ?? (typeof process !== "undefined" ? process.env : {});
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((line, data) => console.info(line, data));

  async function controls(): Promise<OutboundControls> {
    try {
      return await deps.store.loadControls();
    } catch (err) {
      deps.onError?.(err);
      return defaultControls();
    }
  }

  async function gate(input: GateInput): Promise<GateResult> {
    const essential = Boolean(input.essential);
    const units = Math.max(1, Math.floor(input.units ?? 1));
    const c = await controls();
    const testRecipient = resolveTestRecipient(c, input.channel, env);
    const pre = precheckOutbound({ controls: c, channel: input.channel, essential, testRecipient });
    const day = outboundDay(now());
    if (!pre.ok) {
      log("[kidease-outbound] blocked", { channel: input.channel, reason: pre.reason, label: input.label ?? "" });
      await deps.store.noteBlocked({ day, channel: input.channel, alert: false }).catch((err) => deps.onError?.(err));
      return { allow: false, reason: pre.reason };
    }
    const cap = c.caps[input.channel];
    let within = true;
    if (!essential && units > cap) within = false;
    else {
      try {
        within = await deps.store.consume({ day, channel: input.channel, units, cap, essential });
      } catch (err) {
        // Counter trouble must not stop mail. The cap is a cost guard, not a lock.
        deps.onError?.(err);
        within = true;
      }
    }
    if (!within) {
      log("[kidease-outbound] blocked", { channel: input.channel, reason: "daily_cap", label: input.label ?? "" });
      let first = false;
      try {
        first = await deps.store.noteBlocked({ day, channel: input.channel, alert: true });
      } catch (err) {
        deps.onError?.(err);
      }
      if (first && deps.alertCapHit) {
        await deps.alertCapHit({ channel: input.channel, day, cap }).catch((err) => deps.onError?.(err));
      }
      return { allow: false, reason: "daily_cap" };
    }
    // Sign-in codes, password resets and emergency notices always reach the real person.
    const reroute = c.testMode && !essential && (input.channel === "email" || input.channel === "sms");
    return { allow: true, testMode: reroute, testRecipient };
  }

  /** Email: gate, then reroute in test mode. */
  async function gateEmail(input: { to: string; subject: string; essential?: boolean; label?: string }) {
    const r = await gate({ channel: "email", essential: input.essential, label: input.label });
    if (!r.allow) return { allow: false as const, reason: r.reason };
    if (!r.testMode) return { allow: true as const, to: input.to, subject: input.subject, testMode: false };
    return {
      allow: true as const,
      to: r.testRecipient,
      subject: testModeSubject(input.subject, input.to),
      testMode: true,
    };
  }

  /** SMS: gate, then reroute in test mode. */
  async function gateSms(input: { to: string; body: string; essential?: boolean; label?: string }) {
    const r = await gate({ channel: "sms", essential: input.essential, label: input.label });
    if (!r.allow) return { allow: false as const, reason: r.reason };
    if (!r.testMode) return { allow: true as const, to: input.to, body: input.body, testMode: false };
    return { allow: true as const, to: r.testRecipient, body: testModeSmsBody(input.body, input.to), testMode: true };
  }

  return { gate, gateEmail, gateSms, controls };
}

export type OutboundGate = ReturnType<typeof createOutboundGate>;
export type EmailGate = OutboundGate["gateEmail"];

/** Plain words for a blocked send, safe to show an admin. */
export function blockedMessage(reason: OutboundBlockReason): string {
  if (reason === "switch_off") return "Not sent: this channel is switched off in admin.";
  if (reason === "daily_cap") return "Not sent: today's limit for this channel is reached.";
  return "Not sent: test mode is on but no test address is set.";
}

export { CHANNEL_GROUP };

/**
 * Senders in shared or test-covered code find the live gate here. The server
 * registers it at startup (src/lib/server/outbound-gate.ts). In unit tests
 * nothing is registered, so sends behave exactly as before.
 */
export type RegisteredOutboundGates = {
  email?: OutboundGate["gateEmail"];
  sms?: OutboundGate["gateSms"];
  gate?: OutboundGate["gate"];
};

const GATES_KEY = "__kideaseOutboundGates__";

export function registerOutboundGates(gates: RegisteredOutboundGates | null): void {
  (globalThis as Record<string, unknown>)[GATES_KEY] = gates ?? undefined;
}

export function outboundGates(): RegisteredOutboundGates {
  return ((globalThis as Record<string, unknown>)[GATES_KEY] as RegisteredOutboundGates | undefined) ?? {};
}
