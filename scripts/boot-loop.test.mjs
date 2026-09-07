import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { rejectAfter, withTimeout, withTimeoutFallback } from "../src/lib/timeout.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("boot settle helpers", () => {
  it("rejects and falls back instead of hanging", async () => {
    await assert.rejects(() => withTimeout(new Promise(() => {}), 20, "get-session-timeout"), /get-session-timeout/);
    assert.deepEqual(await withTimeoutFallback(new Promise(() => {}), 20, []), []);
    await assert.rejects(() => rejectAfter(10, "sql-timeout"), /sql-timeout/);
  });
});

describe("home / session / splash cannot stay pending forever", () => {
  it("root and index use BootPending (skeleton, then honest error — not BrandMark)", () => {
    const rootRoute = src("src/routes/__root.tsx");
    const index = src("src/routes/index.tsx");
    const pending = src("src/components/boot-pending.tsx");
    assert.match(rootRoute, /pendingComponent: BootPending/);
    assert.match(index, /pendingComponent: BootPending/);
    assert.match(index, /withTimeoutFallback/);
    assert.match(index, /kidease-desk-landed/);
    assert.match(pending, /could not finish loading/i);
    assert.match(pending, /BOOT_SETTLE_MS/);
    assert.match(pending, /PageSkeleton/);
    assert.doesNotMatch(pending, /<BrandMark/);
  });

  it("useSession times out so desks do not sit on Loading", () => {
    const hook = src("src/lib/auth/use-current-user.ts");
    assert.match(hook, /SESSION_SETTLE_MS/);
    assert.match(hook, /useSettledUser/);
    assert.match(hook, /isPending && expired/);
    const verify = src("src/lib/auth/verify.server.ts");
    assert.match(verify, /get-session-timeout/);
    const authApi = src("src/routes/api/auth/$.ts");
    assert.match(authApi, /get-session/);
    assert.match(authApi, /session: null/);
  });

  it("featured + ranking overlays bound Neon so PR 70 cannot hang the home loader", () => {
    const daycares = src("src/lib/server/daycares.ts");
    const quality = src("src/lib/server/quality.ts");
    const rank = src("src/lib/server/rank.ts");
    const db = src("src/lib/db.ts");
    assert.match(db, /getSqlWithin/);
    assert.match(daycares, /withTimeoutFallback\(loadFeatured/);
    assert.match(daycares, /withTimeoutFallback\(runSearch/);
    assert.match(quality, /getSqlWithin/);
    assert.match(rank, /getSqlWithin/);
  });

  it("NativeBoot records splash before the timer so remounts cannot loop the logo", () => {
    const boot = src("src/components/native-boot.tsx");
    assert.match(boot, /splashArmed/);
    assert.match(boot, /markSplashed\(\)/);
    const markAt = boot.indexOf("markSplashed()");
    const timerAt = boot.indexOf("setTimeout");
    assert.ok(markAt > 0 && timerAt > markAt, "session flag must be set before the hide timer");
    assert.match(boot, /1600/);
  });

  it("service worker is network-first and times out navigations", () => {
    const sw = src("public/sw.js");
    assert.match(sw, /kidease-shell-v2/);
    assert.match(sw, /NAVIGATE_MS = 8000/);
    assert.match(sw, /fetchWithTimeout/);
    assert.doesNotMatch(sw, /if \(cached\) return cached/);
  });

  it("shared apex cookie Domain is kidease.ca, never www, never on __Host-", () => {
    const cookies = src("src/lib/auth/cookies.ts");
    assert.match(cookies, /KIDEASE_COOKIE_DOMAIN = "kidease\.ca"/);
    assert.doesNotMatch(cookies, /KIDEASE_COOKIE_DOMAIN = "www\.kidease\.ca"/);
    assert.match(cookies, /never `www\.kidease\.ca`/);
    const extra = src("scripts/login-auth.test.mjs");
    assert.match(extra, /Domain=kidease\.ca/);
  });

  it("admin beforeLoad timeout goes to login, not home, so desk bounce cannot loop", () => {
    const gate = src("src/lib/server/admin-route.ts");
    assert.match(gate, /admin-gate-timeout/);
    assert.match(gate, /Unauthorized.*admin-gate-timeout|admin-gate-timeout.*Unauthorized/s);
  });
});
