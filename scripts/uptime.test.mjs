import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BETTERSTACK_HEARTBEAT_ENV,
  BETTERSTACK_UPTIME_TOKEN_ENV,
  HEALTH_PATH,
  UPTIME_ALERT_EMAIL,
  UPTIME_HEALTH_URL,
  UPTIME_HOME_URL,
  betterStackHeartbeatUrl,
  buildHealthPayload,
  classifyPublicHealth,
  healthHeaders,
  healthHttpStatus,
  healthRevision,
  healthRuntime,
  healthSentryState,
  isAllowedHeartbeatUrl,
  pingBetterStackHeartbeat,
  PRODUCTION_CFR_SIGNAL,
  PRODUCTION_HEALTH_SIGNAL,
} from "../src/lib/uptime.ts";
import { decideRequest } from "./request-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("uptime / Better Stack", () => {
  it("names monitors, alert mailbox, and env placeholders without committing values", () => {
    assert.equal(HEALTH_PATH, "/api/health");
    assert.equal(UPTIME_HOME_URL, "https://www.kidease.ca/");
    assert.equal(UPTIME_HEALTH_URL, "https://www.kidease.ca/api/health");
    assert.equal(UPTIME_ALERT_EMAIL, "kyle@kidease.ca");
    assert.equal(BETTERSTACK_HEARTBEAT_ENV, "BETTERSTACK_HEARTBEAT_URL");
    assert.equal(BETTERSTACK_UPTIME_TOKEN_ENV, "BETTERSTACK_UPTIME_API_TOKEN");

    const example = read(".env.example");
    assert.match(example, /# BETTERSTACK_HEARTBEAT_URL=/);
    assert.match(example, /# BETTERSTACK_UPTIME_API_TOKEN=/);
    assert.match(example, /kyle@kidease\.ca/);
    assert.match(example, /docs\/uptime\.md/);
    assert.doesNotMatch(example, /BETTERSTACK_HEARTBEAT_URL=https:\/\//);
    assert.doesNotMatch(example, /BETTERSTACK_UPTIME_API_TOKEN=\S+/);

    const docs = read("docs/uptime.md");
    assert.match(docs, /Why Better Stack/);
    assert.match(docs, /not Checkly/i);
    assert.match(docs, /kyle@kidease\.ca/);
    assert.match(docs, /SMS \/ Slack/);
    assert.match(docs, /https:\/\/www\.kidease\.ca\//);
    assert.match(docs, /\/api\/health/);
    assert.match(docs, /Do \*\*not\*\* paste real tokens into git/);
    assert.match(docs, /production_health/);
    assert.match(docs, /CI fail-rate is not production CFR/);
    assert.match(docs, /pipeline noise/);
    assert.match(docs, /production_change_failure/);
    assert.match(docs, /cfr\.candidate/);
    assert.match(docs, /cfr_candidate/);

    const security = read("SECURITY.md");
    assert.match(security, /Better Stack/);
    assert.match(security, /\/api\/health/);
    assert.match(security, /kyle@kidease\.ca/);
  });

  it("health payload is 200 unless the database check errors", () => {
    assert.deepEqual(buildHealthPayload({ app: "ok", database: "ok" }, {}), {
      ok: true,
      status: "ok",
      service: "kidease",
      signal: PRODUCTION_HEALTH_SIGNAL,
      checks: { app: "ok", database: "ok" },
      runtime: "local",
      cfr: { signal: PRODUCTION_CFR_SIGNAL, candidate: false, sentry: "unset" },
    });
    assert.equal(healthHttpStatus({ app: "ok", database: "skipped" }), 200);
    assert.equal(healthHttpStatus({ app: "ok", database: "error" }), 503);
    assert.equal(healthHttpStatus({ app: "error", database: "ok" }), 503);
    assert.equal(buildHealthPayload({ app: "ok", database: "error" }, {}).ok, false);
    assert.equal(buildHealthPayload({ app: "ok", database: "error" }, {}).status, "degraded");
    assert.equal(PRODUCTION_HEALTH_SIGNAL, "production_health");
    assert.equal(healthRevision({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }), "abcdef1");
    assert.equal(healthRevision({}), "");
    assert.equal(healthRuntime({ VERCEL: "1" }), "vercel");
    assert.equal(healthRuntime({}), "local");
    const vercel = buildHealthPayload({ app: "ok", database: "ok" }, {
      VERCEL: "1",
      VERCEL_GIT_COMMIT_SHA: "deadbeefcafebabe",
    });
    assert.equal(vercel.runtime, "vercel");
    assert.equal(vercel.revision, "deadbee");
    assert.equal(vercel.signal, "production_health");
    assert.equal(vercel.cfr.signal, PRODUCTION_CFR_SIGNAL);
    assert.equal(vercel.cfr.candidate, false);
    assert.equal(vercel.cfr.sentry, "unset");
    assert.equal(healthSentryState({ SENTRY_DSN: "https://abc@o0.ingest.sentry.io/1" }), "configured");
    assert.equal(healthSentryState({}), "unset");
    assert.equal(buildHealthPayload({ app: "ok", database: "error" }, {}).cfr.candidate, true);
    assert.equal(buildHealthPayload({ app: "ok", database: "error" }, {}).cfr.alert, "cfr_candidate");
    assert.equal(buildHealthPayload({ app: "ok", database: "ok" }, {}).cfr.alert, undefined);
    assert.equal(PRODUCTION_CFR_SIGNAL, "production_change_failure");
    assert.doesNotMatch(JSON.stringify(buildHealthPayload({ app: "ok", database: "ok" }, { SENTRY_DSN: "https://abc@o0.ingest.sentry.io/1" })), /abc@o0/);

    const headers = healthHeaders();
    assert.equal(headers.get("cache-control"), "no-store");
    assert.equal(headers.get("x-robots-tag"), "noindex, nofollow");
  });

  it("classifies a public health response for smoke / Better Stack", () => {
    assert.equal(
      classifyPublicHealth({
        status: 200,
        bodyText: JSON.stringify({ ok: true, service: "kidease", checks: { app: "ok", database: "skipped" } }),
      }).ok,
      true,
    );
    assert.equal(classifyPublicHealth({ status: 503, bodyText: '{"ok":false}' }).ok, false);
    assert.equal(classifyPublicHealth({ status: 200, bodyText: "not-json" }).ok, false);
    assert.equal(classifyPublicHealth({ status: 200, bodyText: '{"ok":true}' }).ok, false);
  });

  it("heartbeat helper no-ops without a URL and allows only Better Stack hosts", () => {
    assert.equal(betterStackHeartbeatUrl({}), "");
    assert.equal(betterStackHeartbeatUrl({ BETTERSTACK_HEARTBEAT_URL: "  " }), "");
    assert.equal(isAllowedHeartbeatUrl("https://uptime.betterstack.com/api/v1/heartbeat/x"), true);
    assert.equal(isAllowedHeartbeatUrl("https://betteruptime.com/api/v1/heartbeat/x"), true);
    assert.equal(isAllowedHeartbeatUrl("https://evil.example/steal"), false);
    assert.equal(isAllowedHeartbeatUrl("http://uptime.betterstack.com/api/v1/heartbeat/x"), false);
    assert.equal(isAllowedHeartbeatUrl("not-a-url"), false);
  });

  it("registers the public route and keeps it off the vercel.app admin redirect", () => {
    const route = read("src/routes/api/health.ts");
    const tree = read("src/routeTree.gen.ts");
    const probe = read("src/lib/server/uptime.ts");
    assert.match(route, /createFileRoute\("\/api\/health"\)/);
    assert.match(route, /collectHealth/);
    assert.match(route, /HEAD:/);
    assert.doesNotMatch(route, /requireAdmin|cronAuthorized|BETTERSTACK_UPTIME_API_TOKEN/);
    assert.match(tree, /from '\.\/routes\/api\/health'/);
    assert.match(tree, /id:\s*'\/api\/health'/);
    assert.match(probe, /dbSource === "none"/);
    assert.match(probe, /getSqlWithin/);
    assert.match(probe, /pingBetterStackHeartbeat/);
    assert.match(probe, /payload\.cfr\.candidate/);
    assert.match(probe, /reportError/);
    assert.match(probe, /cfr_candidate/);
    assert.doesNotMatch(probe, /connectionString|process\.env\.DATABASE_URL/);

    assert.deepEqual(decideRequest({ host: "www.kidease.ca", pathname: "/api/health" }), {
      action: "next",
    });
    assert.deepEqual(decideRequest({ host: "kidease-git.vercel.app", pathname: "/api/health" }), {
      action: "next",
    });
    assert.deepEqual(decideRequest({ host: "kidease.ca", pathname: "/api/health" }), {
      action: "next",
    });
  });

  it("vercel.json does not cache the health probe", () => {
    const vercel = read("vercel.json");
    assert.match(vercel, /"source": "\/api\/health"/);
    assert.match(vercel, /no-store/);
    assert.match(vercel, /noindex, nofollow/);
  });

  it("heartbeat skips when the URL is unset so the app boots without keys", async () => {
    assert.deepEqual(await pingBetterStackHeartbeat({}), { ok: true, skipped: true });
    assert.deepEqual(await pingBetterStackHeartbeat({ BETTERSTACK_HEARTBEAT_URL: "https://evil.example/x" }), {
      ok: false,
      skipped: false,
    });
  });
});
