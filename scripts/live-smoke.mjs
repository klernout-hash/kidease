#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/**
 * Public production smoke. No sign-in and no paid vendor.
 *
 *   node scripts/live-smoke.mjs
 *
 * Rollback runs only when the smoke fails and both VERCEL_TOKEN and
 * VERCEL_PROJECT_ID are set. VERCEL_ORG_ID is the team id when the project
 * is on a team. See docs/guardrails.md.
 */
const CHECKS = [
  { name: "home", path: "/", statuses: [200], must: /KidEase/i, forbid: /Something went wrong/i },
  { name: "login", path: "/login", statuses: [200], forbid: /Something went wrong/i },
  { name: "fr-login", path: "/fr/login", statuses: [200], forbid: /Something went wrong/i },
  { name: "health", path: "/api/health", statuses: [200], must: /"status"\s*:\s*"ok"|"ok"\s*:\s*true/ },
  { name: "sign-in-redirect", path: "/sign-in", statuses: [301, 302, 307, 308], location: /\/login(?:\?|$)/ },
  { name: "sign-up-redirect", path: "/sign-up", statuses: [301, 302, 307, 308], location: /\/signup(?:\?|$)/ },
];

export function smokeConfig(env = process.env) {
  const token = String(env.VERCEL_TOKEN || "").trim();
  const projectId = String(env.VERCEL_PROJECT_ID || "").trim();
  return {
    base: String(env.SMOKE_BASE_URL || "https://www.kidease.ca").replace(/\/$/, ""),
    token,
    projectId,
    teamId: String(env.VERCEL_ORG_ID || "").trim(),
    canRollback: Boolean(token && projectId),
  };
}

export function judgeProbe({ statuses, must, forbid, location }, response) {
  const status = response.status;
  const body = String(response.body || "");
  const loc = String(response.location || "");
  if (!statuses.includes(status)) return `status ${status}`;
  if (forbid && forbid.test(body)) return "error screen in the body";
  if (must && !must.test(body)) return "body missed the expected text";
  if (location && !location.test(loc)) return `location ${loc || "(none)"}`;
  return "";
}

export function previousReadyDeployment(deployments, now = Date.now()) {
  const ready = (deployments || [])
    .filter((row) => {
      const state = String(row.readyState || row.state || "").toUpperCase();
      return state === "READY" && (row.target === "production" || !row.target);
    })
    .sort((a, b) => Number(b.created || b.createdAt || 0) - Number(a.created || a.createdAt || 0));
  const current = ready[0];
  const previous = ready[1];
  if (!previous?.uid) return null;
  const ageMs = now - Number(current?.created || now);
  return { currentId: current?.uid || "", previousId: previous.uid, ageMs };
}

export function rollbackRequest(config, deploymentId) {
  const params = new URLSearchParams({ description: "KidEase live smoke failed" });
  if (config.teamId) params.set("teamId", config.teamId);
  return {
    url: `https://api.vercel.com/v1/projects/${encodeURIComponent(config.projectId)}/rollback/${encodeURIComponent(deploymentId)}?${params}`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
    },
  };
}

async function probe(base, check, fetchImpl) {
  const response = await fetchImpl(`${base}${check.path}`, { redirect: "manual" });
  const body = check.must || check.forbid ? await response.text() : "";
  const reason = judgeProbe(check, {
    status: response.status,
    body,
    location: response.headers.get("location") || "",
  });
  return { name: check.name, ok: !reason, note: reason || `HTTP ${response.status}` };
}

async function listProductionDeployments(config, fetchImpl) {
  const params = new URLSearchParams({
    projectId: config.projectId,
    target: "production",
    limit: "8",
  });
  if (config.teamId) params.set("teamId", config.teamId);
  const response = await fetchImpl(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!response.ok) throw new Error(`deployment list HTTP ${response.status}`);
  const json = await response.json();
  return json.deployments || [];
}

export async function runLiveSmoke({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const config = smokeConfig(env);
  const results = [];
  for (const check of CHECKS) {
    try {
      results.push(await probe(config.base, check, fetchImpl));
    } catch (err) {
      results.push({ name: check.name, ok: false, note: err instanceof Error ? err.message : String(err) });
    }
  }
  const failed = results.filter((row) => !row.ok);
  for (const row of results) log(`[live-smoke] ${row.ok ? "ok" : "FAIL"}  ${row.name} — ${row.note}`);
  if (failed.length === 0) return { ok: true, rolledBack: false, results };

  if (!config.canRollback) {
    log(
      "[live-smoke] rollback skipped. Set GitHub Actions secrets VERCEL_TOKEN and VERCEL_PROJECT_ID (and VERCEL_ORG_ID for a team). This script does not change Vercel or GitHub settings.",
    );
    return { ok: false, rolledBack: false, results };
  }

  try {
    const deployments = await listProductionDeployments(config, fetchImpl);
    const target = previousReadyDeployment(deployments);
    if (!target) {
      log("[live-smoke] no previous READY production deployment to roll back to");
      return { ok: false, rolledBack: false, results };
    }
    const request = rollbackRequest(config, target.previousId);
    const response = await fetchImpl(request.url, request.init);
    if (!response.ok) {
      log(`[live-smoke] rollback HTTP ${response.status}`);
      return { ok: false, rolledBack: false, results };
    }
    log(`[live-smoke] rolled production back to ${target.previousId}`);
    return { ok: false, rolledBack: true, results };
  } catch (err) {
    log(`[live-smoke] rollback failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, rolledBack: false, results };
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invoked) {
  const verdict = await runLiveSmoke();
  process.exitCode = verdict.ok ? 0 : 1;
}
