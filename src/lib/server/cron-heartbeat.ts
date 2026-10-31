/**
 * Optional Better Stack heartbeat for one cron. Flag off or URL unset = no-op.
 * Never logs the URL. A failed ping does not fail the cron.
 */

import { automationLiveEnv, automationMode, cronHeartbeatEnv } from "@/lib/automations";
import { cronHeartbeatsEnabled } from "@/lib/features";
import { isAllowedHeartbeatUrl } from "@/lib/uptime";

export async function pingCronHeartbeat(
  job: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; skipped: boolean; reason: string }> {
  const mode = automationMode(
    cronHeartbeatsEnabled(env),
    env[automationLiveEnv("FEATURE_CRON_HEARTBEATS")],
  );
  if (mode === "off") return { ok: true, skipped: true, reason: "flag_off" };
  const url = String(env[cronHeartbeatEnv(job)] || "").trim();
  if (!url) return { ok: true, skipped: true, reason: "no_url" };
  if (!isAllowedHeartbeatUrl(url)) return { ok: false, skipped: true, reason: "bad_url" };
  if (mode === "dry_run") {
    console.info("[kidease-automation] dry-run heartbeat", job);
    return { ok: true, skipped: true, reason: "dry_run" };
  }
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual" });
    return { ok: res.ok, skipped: false, reason: res.ok ? "pinged" : "http" };
  } catch {
    return { ok: false, skipped: false, reason: "network" };
  }
}
