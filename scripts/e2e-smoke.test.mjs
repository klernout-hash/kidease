import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CITY_HUB_DEFS } from "../src/lib/city-hubs.ts";
import { CANONICAL_ORIGIN } from "./request-guard.mjs";
import { smokeAllowedOutputDirs } from "./browser-guard.mjs";
import {
  ADMIN_API_SMOKE_PATHS,
  classifyAdminApiGate,
  classifyAdminGate,
  classifyParentGuestGate,
  classifyProviderGuestGate,
  ciPlaywrightRetries,
  classifyPublicHealth,
  HEALTH_SMOKE_PATH,
  DEFAULT_PREVIEW_ORIGIN,
  e2eScriptMustStayChargeFree,
  expectedAccessLocation,
  FR_CITY_HUB_SLUGS,
  frenchCityHubSsrOk,
  homepageLooksLive,
  loadQuarantine,
  loginPageLooksLive,
  parseE2eArgs,
  parseQuarantine,
  skipReason,
  smokeGroupSelected,
  SMOKE_PATHS,
  splitSmokeResults,
  visualCheckBlocks,
  targetOrigin,
  vercelAppAdminDecision,
} from "./e2e-smoke-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("parseE2eArgs defaults skip without BASE_URL", () => {
  const args = parseE2eArgs([], {});
  assert.equal(args.explicitUrl, false);
  assert.equal(args.startPreview, false);
  assert.match(skipReason(args), /no BASE_URL/);
  assert.equal(targetOrigin(args), "");
});

test("parseE2eArgs reads BASE_URL and E2E_BASE_URL", () => {
  const a = parseE2eArgs([], { BASE_URL: "http://127.0.0.1:8081/" });
  assert.equal(a.url, "http://127.0.0.1:8081/");
  assert.equal(a.explicitUrl, true);
  assert.equal(skipReason(a), null);
  assert.equal(targetOrigin(a), "http://127.0.0.1:8081");

  const b = parseE2eArgs([], { E2E_BASE_URL: "https://example.vercel.app" });
  assert.equal(targetOrigin(b), "https://example.vercel.app");
});

test("parseE2eArgs --start-preview runs without BASE_URL", () => {
  const args = parseE2eArgs(["--start-preview"], {});
  assert.equal(skipReason(args), null);
  assert.equal(targetOrigin(args), DEFAULT_PREVIEW_ORIGIN);
  assert.equal(args.startPreview, true);
});

test("parseE2eArgs flag and unknown-flag handling", () => {
  assert.equal(parseE2eArgs(["--url", "http://127.0.0.1:4173/"], {}).url, "http://127.0.0.1:4173/");
  assert.equal(parseE2eArgs(["--url=http://127.0.0.1:4173/"], {}).url, "http://127.0.0.1:4173/");
  assert.deepEqual(parseE2eArgs(["--url"], {}), { error: "--url requires an http(s) origin" });
  assert.deepEqual(parseE2eArgs(["--nope"], {}), { error: "unknown flag: --nope" });
  assert.equal(parseE2eArgs(["--require"], {}).requireServer, true);
  assert.equal(parseE2eArgs([], { E2E_REQUIRE: "1" }).requireServer, true);
  assert.equal(parseE2eArgs(["--browser-smoke"], {}).browserSmoke, true);
  assert.equal(parseE2eArgs(["--signed-in"], {}).signedIn, true);
  assert.equal(parseE2eArgs(["--shard", "2/4"], {}).shard.index, 2);
  assert.deepEqual(parseE2eArgs(["--shard=1/4"], {}).shard.groups, ["public"]);
  assert.equal(parseE2eArgs(["--skip-desktop-visual"], {}).skipDesktopVisual, true);
  assert.equal(parseE2eArgs(["--desktop-visual-only"], {}).desktopVisualOnly, true);
  assert.match(parseE2eArgs(["--shard", "1/3"], {}).error, /1\/4/);
  assert.match(parseE2eArgs(["--desktop-visual-only", "--shard", "1/4"], {}).error, /cannot be combined/);
});

test("skipReason is null when a server is required even without URL", () => {
  assert.equal(skipReason(parseE2eArgs(["--require"], {})), null);
});

test("homepage identity is KidEase / licensed daycare, not a 500 shell", () => {
  assert.equal(
    homepageLooksLive({ title: "KidEase", bodyText: "Find licensed daycare near you", status: 200 }).ok,
    true,
  );
  assert.equal(homepageLooksLive({ title: "Error", bodyText: "boom", status: 500 }).ok, false);
  assert.equal(homepageLooksLive({ title: "", bodyText: "", status: 200 }).ok, false);
});

test("login page needs Sign in plus an email field", () => {
  assert.equal(
    loginPageLooksLive({
      title: "KidEase",
      bodyText: "Sign in\nEmail",
      hasEmail: true,
      status: 200,
    }).ok,
    true,
  );
  assert.equal(
    loginPageLooksLive({ title: "KidEase", bodyText: "Welcome", hasEmail: false, status: 200 }).ok,
    false,
  );
});

test("admin guest gate: 404 on the app, Access redirect or Cloudflare at the edge", () => {
  const login = classifyAdminGate({
    finalUrl: "http://127.0.0.1:8081/login?next=/admin",
    status: 200,
    bodyText: "Sign in",
  });
  assert.equal(login.kind, "login");
  assert.equal(login.ok, false);
  assert.equal(
    classifyAdminGate({
      finalUrl: "http://127.0.0.1:8081/admin",
      status: 404,
      bodyText: "Page not found",
    }).kind,
    "not-found",
  );
  assert.equal(
    classifyAdminGate({
      status: 302,
      locationHeader: `${CANONICAL_ORIGIN}/admin`,
    }).kind,
    "access-redirect",
  );
  assert.equal(
    classifyAdminGate({
      finalUrl: "https://kidease.cloudflareaccess.com/cdn-cgi/access/login",
      bodyText: "Cloudflare Access",
      status: 302,
    }).kind,
    "cloudflare-access",
  );
  assert.equal(classifyAdminGate({ status: 403 }).kind, "denied");
  const open = classifyAdminGate({
    finalUrl: "http://127.0.0.1:8081/admin",
    status: 200,
    bodyText: "Admin · KidEase\nQueue",
  });
  assert.equal(open.ok, false);
  assert.equal(open.kind, "open");
});

test("vercel.app /admin decision matches Access-ish 302 to www", () => {
  const decision = vercelAppAdminDecision();
  assert.equal(decision.action, "redirect");
  assert.equal(decision.status, 302);
  assert.equal(decision.location, expectedAccessLocation("/admin"));
  assert.equal(expectedAccessLocation(), `${CANONICAL_ORIGIN}/admin`);
});

test("guest admin API gate: 401/403/redirect, never a 200 payload", () => {
  assert.equal(classifyAdminApiGate({ status: 401 }).kind, "denied");
  assert.equal(classifyAdminApiGate({ status: 403 }).kind, "denied");
  assert.equal(classifyAdminApiGate({ status: 302, locationHeader: "https://www.kidease.ca/login" }).ok, true);
  assert.equal(classifyAdminApiGate({ status: 200, bodyText: JSON.stringify({ ok: false, error: "Not authorized" }) }).ok, true);
  assert.equal(classifyAdminApiGate({ status: 200, bodyText: JSON.stringify({ ok: true, prices: {} }) }).ok, false);
  assert.deepEqual([...ADMIN_API_SMOKE_PATHS], ["/api/admin/sentry-test", "/api/admin/stripe-catalog"]);
});

test("French city hub SSR rejects the crash screen and requires the hub h1", () => {
  assert.deepEqual([...FR_CITY_HUB_SLUGS], CITY_HUB_DEFS.map((hub) => hub.slug));
  assert.equal(
    frenchCityHubSsrOk('<main><h1>Garderies permises à Montréal, QC</h1></main>').ok,
    true,
  );
  assert.equal(frenchCityHubSsrOk("<h1>Something went wrong</h1><p>Invariant failed</p>").ok, false);
  assert.equal(frenchCityHubSsrOk("<h1>Licensed daycare in Montreal, QC</h1>").ok, false);
  assert.equal(frenchCityHubSsrOk("").ok, false);
  assert.match(src("scripts/e2e-smoke.mjs"), /frenchCityHubSmoke/);
  assert.match(src("scripts/e2e-smoke.mjs"), /fr-city-hubs/);
});

test("public /api/health is a guest 200 probe", () => {
  assert.equal(HEALTH_SMOKE_PATH, "/api/health");
  assert.equal(
    classifyPublicHealth({
      status: 200,
      bodyText: JSON.stringify({ ok: true, service: "kidease", checks: { app: "ok", database: "skipped" } }),
    }).ok,
    true,
  );
  assert.equal(classifyPublicHealth({ status: 503, bodyText: '{"ok":false,"service":"kidease"}' }).ok, false);
  assert.match(src("scripts/e2e-smoke.mjs"), /HEALTH_SMOKE_PATH/);
  assert.match(src("scripts/e2e-smoke.mjs"), /api-health/);
});

test("guest parent desk redirects to login; provider stays a sign-in landing", () => {
  assert.equal(
    classifyParentGuestGate({
      finalUrl: "http://127.0.0.1:8081/login?next=/parent",
      status: 200,
      bodyText: "Sign in",
    }).kind,
    "login",
  );
  assert.equal(
    classifyParentGuestGate({
      finalUrl: "http://127.0.0.1:8081/parent",
      status: 200,
      bodyText: "My shortlist\nYour children",
    }).ok,
    false,
  );
  assert.equal(
    classifyProviderGuestGate({
      finalUrl: "http://127.0.0.1:8081/provider",
      status: 200,
      bodyText: "Centre desk\nSign in to manage spots, fees, and photos\nSign in to the centre desk",
    }).kind,
    "guest-landing",
  );
  assert.equal(
    classifyProviderGuestGate({
      finalUrl: "http://127.0.0.1:8081/provider",
      status: 200,
      bodyText: "Tour requests\nMoney",
    }).ok,
    false,
  );
  assert.equal(
    classifyProviderGuestGate({
      finalUrl: "http://127.0.0.1:8081/provider",
      status: 200,
      bodyText: "Lead inbox\nMoney",
    }).ok,
    false,
  );
});

test("smoke paths never include pay or 2FA submit", () => {
  assert.deepEqual(SMOKE_PATHS, {
    home: "/",
    login: "/login",
    admin: "/admin",
    parent: "/parent",
    provider: "/provider",
  });
  const runner = src("scripts/e2e-smoke.mjs");
  assert.equal(e2eScriptMustStayChargeFree(runner).length, 0);
  assert.doesNotMatch(runner, /\/pay\//);
  assert.match(runner, /\.fill\(FIXTURE_PASSWORD\)/);
  const passwordFills = runner.match(/\.fill\([^)\n]*password[^)\n]*\)/gi) || [];
  assert.deepEqual(passwordFills, [".fill(FIXTURE_PASSWORD)"]);
  assert.match(runner, /if \(args\.signedIn\)/);
  assert.match(runner, /scripts\/browser-smoke\.mjs/);
  assert.match(runner, /args\.startPreview/);
  assert.match(runner, /skipReason/);
  assert.match(runner, /delete env\.VERCEL/);
  assert.match(runner, /stagePgliteArtifacts/);
  assert.match(runner, /pglite\.data/);
  assert.match(runner, /env\.E2E_ROLE_FIXTURE = "1"/);
  assert.match(runner, /env\.SHOW_PAY_CTAS = "1"/);
  assert.doesNotMatch(runner, /env\.VERCEL = env\.VERCEL \|\| "1"/);
  assert.match(runner, /requestWithHost/);
  assert.match(runner, /kidease-git\.vercel\.app/);
});

test("package.json wires e2e scripts to the smoke runner and browser-smoke", () => {
  const pkg = JSON.parse(src("package.json"));
  assert.equal(pkg.scripts.e2e, "node scripts/e2e-smoke.mjs");
  assert.equal(pkg.scripts["e2e:preview"], "node scripts/e2e-smoke.mjs --start-preview");
  assert.match(pkg.scripts["e2e:browser-smoke"], /scripts\/browser-smoke\.mjs/);
  assert.match(pkg.scripts.preview, /vite preview/);
});

test("CI builds once, shards smoke, and keeps desktop visual blocking on main", () => {
  const ci = src(".github/workflows/ci.yml");
  assert.match(ci, /workflow_dispatch:/);
  assert.match(ci, /base_url:/);
  assert.match(ci, /paths-ignore:[\s\S]*?docs\/\*\*/);
  assert.match(ci, /\*\*\/\*\.md/);
  assert.match(ci, /mcr\.microsoft\.com\/playwright:v1\.62\.1-jammy/);
  assert.equal((ci.match(/mcr\.microsoft\.com\/playwright:v1\.62\.1-jammy/g) || []).length, 2);
  assert.match(ci, /playwright install-deps chromium/);
  assert.doesNotMatch(ci, /playwright install-deps chromium webkit/);
  assert.doesNotMatch(ci, /playwright install chromium webkit/);
  assert.match(ci, /cache-hit != 'true'/);
  assert.match(ci, /signed-in-e2e:[\s\S]*?timeout-minutes: 60/);
  assert.match(ci, /shard: \["1\/4", "2\/4", "3\/4", "4\/4"\]/);
  assert.match(ci, /E2E_VISUAL_BLOCKING/);
  assert.match(ci, /name: ci-build/);
  assert.match(ci, /restore-ci-build\.sh/);
  assert.match(src("scripts/restore-ci-build.sh"), /last-build\.json/);
  assert.match(src("scripts/stage-ci-build.sh"), /nitro\.json/);
  assert.match(ci, /defaults:\n\s+run:\n\s+shell: bash/);
  assert.match(ci, /\.vercel\/output/);
  const runner = src("scripts/e2e-smoke.mjs");
  assert.match(runner, /kidease\.e2e_session/);
  assert.match(runner, /pathname === "\/parent"/);
  assert.match(runner, /withNetRetry/);
  assert.match(runner, /ciPlaywrightRetries/);
  assert.match(runner, /e2e\/quarantine\.json/);
  assert.match(ci, /npm run build/);
  assert.match(ci, /npm run e2e:preview/);
  assert.match(ci, /BROWSER_ALLOW_EXTERNAL_HOST/);
  assert.match(ci, /npm run e2e/);
  assert.doesNotMatch(ci, /STRIPE_SECRET|TWILIO_|RESEND_API_KEY|OPERATOR_RESET_PASSWORD/);
  const lock = JSON.parse(src("package-lock.json"));
  assert.equal(lock.packages["node_modules/playwright"].version, "1.62.1");
});

test("shards, quarantine, and CI retries", () => {
  assert.equal(ciPlaywrightRetries({}), 0);
  assert.equal(ciPlaywrightRetries({ CI: "true" }), 1);
  assert.equal(ciPlaywrightRetries({ CI: "true", E2E_RETRIES: "2" }), 2);
  assert.equal(ciPlaywrightRetries({ CI: "true", E2E_RETRIES: "9" }), 2);
  const shard = parseE2eArgs(["--shard", "3/4"], {});
  assert.equal(smokeGroupSelected(shard, "webkit"), true);
  assert.equal(smokeGroupSelected(shard, "public"), false);
  assert.equal(smokeGroupSelected(shard, "visual"), false);
  const local = parseE2eArgs([], { BASE_URL: "http://127.0.0.1:8081/" });
  assert.equal(smokeGroupSelected(local, "visual"), true);
  assert.equal(smokeGroupSelected(local, "role"), true);
  const shots = parseE2eArgs(["--desktop-visual-only"], {});
  assert.equal(smokeGroupSelected(shots, "visual"), true);
  assert.equal(smokeGroupSelected(shots, "public"), false);
  assert.deepEqual(parseQuarantine('{"checks":[]}'), []);
  assert.deepEqual(parseQuarantine('{"checks":["role-fixture"]}'), ["role-fixture"]);
  assert.throws(() => parseQuarantine("{}"), /checks array/);
  const split = splitSmokeResults(
    [
      { name: "homepage", ok: true },
      { name: "role-fixture", ok: false },
      { name: "login", ok: false },
    ],
    ["role-fixture"],
  );
  assert.deepEqual(split.failed.map((row) => row.name), ["login"]);
  assert.deepEqual(split.quarantined.map((row) => row.name), ["role-fixture"]);
  assert.equal(visualCheckBlocks({}, ["desktop-visual"]), true);
  assert.equal(
    visualCheckBlocks({ E2E_VISUAL_BLOCKING: "0" }, ["desktop-visual"], "1280x800__fr.png 3.04% limit 0.40%"),
    false,
  );
  assert.equal(
    visualCheckBlocks({ E2E_VISUAL_BLOCKING: "0" }, ["desktop-visual"], "home 1280 Too many arguments"),
    true,
  );
  assert.equal(visualCheckBlocks({ E2E_VISUAL_BLOCKING: "0" }, ["desktop-visual", "suite"]), true);
  assert.equal(visualCheckBlocks({ E2E_VISUAL_BLOCKING: "0" }, []), false);
  assert.deepEqual(loadQuarantine(join(root, "e2e/quarantine.json")), []);
  const doc = src("docs/e2e.md");
  assert.match(doc, /quarantine\.json/);
  assert.match(doc, /retries: 1/);
  assert.match(doc, /0\.004/);
  assert.match(doc, /Blocking on main|still fails the e2e check on main|On a push to `main`/);
});

test("docs/e2e.md explains local preview and optional long-lived BASE_URL", () => {
  const doc = src("docs/e2e.md");
  assert.match(doc, /npm run e2e:preview/);
  assert.match(doc, /BASE_URL/);
  assert.match(doc, /BROWSER_ALLOW_EXTERNAL_HOST=1/);
  assert.match(doc, /workflow_dispatch/);
  assert.match(doc, /Stripe/);
  assert.match(doc, /OTP/);
  assert.match(doc, /127\.0\.0\.1:8081/);
});

test("browser-smoke may write under cwd for GitHub Actions", () => {
  const dirs = smokeAllowedOutputDirs("/repo");
  assert.ok(dirs.includes("/workspace"));
  assert.ok(dirs.includes("/tmp"));
  assert.ok(dirs.includes("/repo"));
});
