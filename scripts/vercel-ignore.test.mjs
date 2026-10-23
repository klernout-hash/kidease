import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { shouldIgnoreVercelBuild } from "./vercel-ignore.mjs";

function exitFor(ref) {
  const result = spawnSync(process.execPath, ["scripts/vercel-ignore.mjs"], {
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref },
    encoding: "utf8",
  });
  return result.status;
}

test("parent sign-up branch builds and other cursor branches stay skipped", () => {
  assert.equal(shouldIgnoreVercelBuild("cursor/parent-sms-signup-ba39"), false);
  assert.equal(shouldIgnoreVercelBuild("cursor/posthog-opt-in-allow-e792"), false);
  assert.equal(shouldIgnoreVercelBuild("cursor/home-video-sound-1e24"), true);
  assert.equal(shouldIgnoreVercelBuild("main"), false);
  assert.equal(shouldIgnoreVercelBuild("feat/site-guide-chat"), false);
  assert.equal(shouldIgnoreVercelBuild(""), false);
  assert.equal(shouldIgnoreVercelBuild("main", { changedFiles: ["docs/billing.md", "README.md"] }), true);
  assert.equal(shouldIgnoreVercelBuild("main", { changedFiles: ["android/app/build.gradle", "e2e/desktop-baselines/home.png"] }), true);
  assert.equal(shouldIgnoreVercelBuild("main", { changedFiles: ["docs/billing.md", "src/routes/index.tsx"] }), false);
  assert.equal(
    shouldIgnoreVercelBuild("feat/site", {
      vercelEnv: "preview",
      commitSha: "abc",
      previousSha: "abc",
    }),
    true,
  );
  assert.equal(
    shouldIgnoreVercelBuild("main", {
      vercelEnv: "production",
      commitSha: "abc",
      previousSha: "abc",
    }),
    false,
  );
  assert.equal(exitFor("cursor/parent-sms-signup-ba39"), 1);
  assert.equal(exitFor("cursor/other-ba39"), 0);
  assert.equal(exitFor("main"), 1);
});
