import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sentrySourcemapUploadEnabled } from "./upload-sentry-sourcemaps.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("Sentry source map upload", () => {
  it("stays off unless the switch is exactly 1", () => {
    assert.equal(sentrySourcemapUploadEnabled({}), false);
    assert.equal(sentrySourcemapUploadEnabled({ SENTRY_UPLOAD_SOURCEMAPS: "0" }), false);
    assert.equal(sentrySourcemapUploadEnabled({ SENTRY_UPLOAD_SOURCEMAPS: "true" }), false);
    assert.equal(sentrySourcemapUploadEnabled({ SENTRY_AUTH_TOKEN: "secret" }), false);
    assert.equal(sentrySourcemapUploadEnabled({ SENTRY_UPLOAD_SOURCEMAPS: "1" }), true);
  });

  it("skips without calling Sentry when the switch is unset", () => {
    const run = spawnSync(process.execPath, ["scripts/upload-sentry-sourcemaps.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SENTRY_UPLOAD_SOURCEMAPS: "", SENTRY_AUTH_TOKEN: "do-not-print" },
    });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /skipped/);
    assert.doesNotMatch(`${run.stdout}\n${run.stderr}`, /do-not-print/);
  });

  it("is wired into the build before PostHog deletes the maps, and the example leaves it off", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const steps = pkg.scripts.build.split(/\s*&&\s*/);
    const sentry = steps.indexOf("node scripts/upload-sentry-sourcemaps.mjs");
    const posthog = steps.indexOf("node scripts/upload-posthog-sourcemaps.mjs");
    assert.ok(sentry > 0);
    assert.ok(posthog > sentry);
    const example = readFileSync(join(root, ".env.example"), "utf8");
    assert.match(example, /# SENTRY_UPLOAD_SOURCEMAPS=/);
    assert.doesNotMatch(example, /^SENTRY_UPLOAD_SOURCEMAPS=1/m);
    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    assert.match(vite, /SENTRY_UPLOAD_SOURCEMAPS/);
  });
});
