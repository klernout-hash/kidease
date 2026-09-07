import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CANONICAL_ORIGIN } from "./request-guard.mjs";
import { smokeAllowedOutputDirs } from "./browser-guard.mjs";
import {
  classifyAdminGate,
  DEFAULT_PREVIEW_ORIGIN,
  e2eScriptMustStayChargeFree,
  expectedAccessLocation,
  homepageLooksLive,
  loginPageLooksLive,
  parseE2eArgs,
  skipReason,
  SMOKE_PATHS,
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

test("admin guest gate: login, Access redirect, Cloudflare, or 401", () => {
  assert.equal(
    classifyAdminGate({ finalUrl: "http://127.0.0.1:8081/login?next=/admin", status: 200, bodyText: "Sign in" })
      .kind,
    "login",
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

test("smoke paths never include pay or 2FA submit", () => {
  assert.deepEqual(SMOKE_PATHS, { home: "/", login: "/login", admin: "/admin" });
  const runner = src("scripts/e2e-smoke.mjs");
  assert.equal(e2eScriptMustStayChargeFree(runner).length, 0);
  assert.doesNotMatch(runner, /\/pay\//);
  assert.doesNotMatch(runner, /fill\(.*password/i);
  assert.match(runner, /scripts\/browser-smoke\.mjs/);
  assert.match(runner, /args\.startPreview/);
  assert.match(runner, /skipReason/);
});

test("package.json wires e2e scripts to the smoke runner and browser-smoke", () => {
  const pkg = JSON.parse(src("package.json"));
  assert.equal(pkg.scripts.e2e, "node scripts/e2e-smoke.mjs");
  assert.equal(pkg.scripts["e2e:preview"], "node scripts/e2e-smoke.mjs --start-preview");
  assert.match(pkg.scripts["e2e:browser-smoke"], /scripts\/browser-smoke\.mjs/);
  assert.match(pkg.scripts.preview, /vite preview/);
});

test("CI e2e job builds preview locally or accepts workflow_dispatch BASE_URL", () => {
  const ci = src(".github/workflows/ci.yml");
  assert.match(ci, /workflow_dispatch:/);
  assert.match(ci, /base_url:/);
  assert.match(ci, /npx playwright install --with-deps chromium/);
  assert.match(ci, /npm run build/);
  assert.match(ci, /npm run e2e:preview/);
  assert.match(ci, /BROWSER_ALLOW_EXTERNAL_HOST/);
  assert.match(ci, /npm run e2e/);
  assert.doesNotMatch(ci, /STRIPE_SECRET|TWILIO_|RESEND_API_KEY|OPERATOR_RESET_PASSWORD/);
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
