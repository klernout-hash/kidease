/**
 * Error counts, cron run log, and mail to kyle@kidease.ca.
 * Does not enable KidEase subscriptions or store billing.
 */

import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  OPS_ALERT_EMAIL,
  automationModeFromEnv,
  dayKeyInTimeZone,
  opsAlertPlan,
  opsDigestLetter,
  AUTOMATION_FALLBACK_TZ,
} from "@/lib/automations";
import { exceptionTypeName, sanitizeExceptionMessage, shouldCaptureException } from "@/lib/posthog-errors";
import { ensureAutomationSchema } from "@/lib/server/automation-schema";
import { dispatchAutomationMail } from "@/lib/server/automation-mail";
import { pingCronHeartbeat } from "@/lib/server/cron-heartbeat";

function hourBucket(now = new Date()): string {
  const copy = new Date(now);
  copy.setUTCMinutes(0, 0, 0);
  return copy.toISOString();
}

export async function bumpErrorCount(source: string, now = new Date()): Promise<void> {
  const safe = source.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "server";
  await ensureAutomationSchema();
  const sql = await getSql();
  const bucket = hourBucket(now);
  await sql`
    insert into automation_error_counts (bucket, source, count)
    values (${bucket}, ${safe}, 1)
    on conflict (bucket, source)
    do update set count = automation_error_counts.count + 1
  `.catch(() => undefined);
}

export async function captureServerException(err: unknown, source: string): Promise<void> {
  const message = sanitizeExceptionMessage(err);
  const type = exceptionTypeName(err);
  await bumpErrorCount(source).catch(() => undefined);
  const mode = automationModeFromEnv("FEATURE_POSTHOG_ERRORS", process.env);
  if (mode === "dry_run") {
    console.info("[kidease-automation] dry-run exception", source, type);
    return;
  }
  if (!shouldCaptureException({ mode, webdriver: false, userAgent: null })) return;
  const key = String(process.env.POSTHOG_FLAGS_KEY || process.env.VITE_PUBLIC_POSTHOG_KEY || "").trim();
  const host = String(process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  if (!key) return;
  await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: "$exception",
      distinct_id: "kidease-server",
      properties: {
        $exception_type: type,
        $exception_message: message,
        $exception_source: source.slice(0, 40),
        $lib: "kidease-server",
      },
    }),
  }).catch(() => undefined);
}

export async function recordClientError(input: {
  userAgent?: string | null;
  webdriver?: boolean;
}): Promise<{ ok: true; counted: boolean }> {
  const mode = automationModeFromEnv("FEATURE_POSTHOG_ERRORS", process.env);
  if (!shouldCaptureException({ mode, webdriver: input.webdriver, userAgent: input.userAgent })) {
    return { ok: true, counted: false };
  }
  await bumpErrorCount("client");
  return { ok: true, counted: true };
}

async function countSince(hours: number): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select coalesce(sum(count), 0)::int as n
    from automation_error_counts
    where bucket > now() - (${`${hours} hours`})::interval
  `.catch(() => [] as { n: number }[]);
  return Number(rows[0]?.n) || 0;
}

async function failedJobsSince(hours: number): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql<{ automation: string }>`
    select distinct automation
    from automation_runs
    where ok = false
      and started_at > now() - (${`${hours} hours`})::interval
    order by automation
    limit 20
  `.catch(() => [] as { automation: string }[]);
  return rows.map((row) => row.automation);
}

export async function runOpsAlertsJob(options: { now?: Date; dryRun?: boolean; force?: boolean } = {}) {
  const now = options.now ?? new Date();
  const mode = automationModeFromEnv("FEATURE_OPS_ALERTS", process.env, Boolean(options.dryRun));
  if (mode === "off") return { ok: true, skipped: true, reason: "flag_off" };
  await ensureAutomationSchema();
  const errorsLastHour = await countSince(1);
  const failures = await failedJobsSince(1);
  const day = dayKeyInTimeZone(now, AUTOMATION_FALLBACK_TZ);
  const hourKey = `${day}-${String(now.getUTCHours()).padStart(2, "0")}`;
  const sql = await getSql();
  const sent = await sql<{ dedupe_key: string }>`
    select dedupe_key from automation_sends
    where automation = 'ops_alert'
      and channel = 'email'
      and status in ('sent', 'dry_run')
      and dedupe_key in (${`ops-digest:${day}`}, ${`ops-critical:${hourKey}`})
  `.catch(() => [] as { dedupe_key: string }[]);
  const keys = new Set(sent.map((row) => row.dedupe_key));
  const plan = opsAlertPlan({
    now,
    errorsLastHour,
    jobFailuresLastHour: failures.length,
    digestSentToday: keys.has(`ops-digest:${day}`),
    criticalSentThisHour: keys.has(`ops-critical:${hourKey}`),
  });
  let immediate = "skipped";
  let digest = "skipped";
  if (plan.immediate) {
    const letter = opsDigestLetter({
      errorsLastDay: errorsLastHour,
      failures,
      critical: true,
    });
    immediate = await dispatchAutomationMail({
      automation: "ops_alert",
      dedupeKey: `ops-critical:${hourKey}`,
      recipient: OPS_ALERT_EMAIL,
      subject: letter.subject,
      text: letter.text,
      html: letter.html,
      mode,
      quiet: false,
      allowlist: null,
      exemptAllowlist: true,
    });
  }
  if (plan.digest) {
    const dayFailures = await failedJobsSince(24);
    const letter = opsDigestLetter({
      errorsLastDay: await countSince(24),
      failures: dayFailures,
      critical: false,
    });
    digest = await dispatchAutomationMail({
      automation: "ops_alert",
      dedupeKey: `ops-digest:${day}`,
      recipient: OPS_ALERT_EMAIL,
      subject: letter.subject,
      text: letter.text,
      html: letter.html,
      mode,
      quiet: false,
      allowlist: null,
      exemptAllowlist: true,
    });
  }
  return { ok: true, skipped: false, mode, immediate, digest, errorsLastHour, failures: failures.length };
}

export async function runTracked(
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  await ensureAutomationSchema();
  const sql = await getSql();
  const id = `run_${randomBytes(8).toString("hex")}`;
  await sql`
    insert into automation_runs (id, automation, ok)
    values (${id}, ${name}, null)
  `.catch(() => undefined);
  try {
    const result = await fn();
    const ok = result.ok !== false;
    const detail = String(result.reason || result.detail || (ok ? "ok" : "failed")).slice(0, 180);
    await sql`
      update automation_runs
      set ok = ${ok}, finished_at = now(), detail = ${detail}
      where id = ${id}
    `.catch(() => undefined);
    if (ok) await pingCronHeartbeat(name);
    return { ...result, ok };
  } catch (err) {
    const detail = sanitizeExceptionMessage(err);
    await sql`
      update automation_runs
      set ok = false, finished_at = now(), detail = ${detail}
      where id = ${id}
    `.catch(() => undefined);
    await captureServerException(err, name);
    return { ok: false, reason: "job_failed" };
  }
}
