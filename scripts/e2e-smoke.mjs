#!/usr/bin/env node
/**
 * Minimal Playwright smoke for CI / local preview.
 *
 *   npm run e2e                  # skip (exit 0) without BASE_URL
 *   npm run e2e:preview          # vite preview on :8081, then smoke
 *   BASE_URL=https://… BROWSER_ALLOW_EXTERNAL_HOST=1 npm run e2e
 *
 * Does not charge Stripe or submit OTPs. See docs/e2e.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl, smokeAllowedOutputDirs } from "./browser-guard.mjs";
import {
  ADMIN_API_SMOKE_PATHS,
  classifyAdminApiGate,
  classifyAdminGate,
  classifyParentGuestGate,
  classifyProviderGuestGate,
  classifyPublicHealth,
  HEALTH_SMOKE_PATH,
  DEFAULT_PREVIEW_ORIGIN,
  homepageLooksLive,
  loginPageLooksLive,
  parseE2eArgs,
  skipReason,
  SMOKE_PATHS,
  targetOrigin,
} from "./e2e-smoke-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseE2eArgs(process.argv.slice(2), process.env);
if (args.error) {
  console.error(JSON.stringify({ ok: false, error: args.error }, null, 2));
  process.exit(1);
}

const skipped = skipReason(args);
if (skipped) {
  const verdict = { ok: true, skipped: true, reason: skipped };
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(0);
}

const origin = targetOrigin(args) || DEFAULT_PREVIEW_ORIGIN;
checkedUrl(origin.endsWith("/") ? origin : `${origin}/`);

const allowedOut = smokeAllowedOutputDirs();
const outDir = checkedOutputPath(join(args.outDir, ".keep"), allowedOut, "e2e artifacts");
mkdirSync(dirname(outDir), { recursive: true });
const verdictPath = join(dirname(outDir), "verdict.json");

const timeoutMs = Number(process.env.E2E_TIMEOUT_MS || 45000);
const results = [];
let previewChild = null;

async function setFixture(context, base, { role, plan, own } = {}) {
  await context.clearCookies();
  const cookies = [];
  if (role) cookies.push({ name: "kidease_e2e_role", value: role, url: base });
  if (plan) cookies.push({ name: "kidease_e2e_plan", value: plan, url: base });
  if (own) cookies.push({ name: "kidease_e2e_own", value: own, url: base });
  if (cookies.length) await context.addCookies(cookies);
}

async function roleNavText(page) {
  const nav = page.locator('[data-ke="role-nav"]:visible');
  const count = await nav.count();
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(await nav.nth(i).innerText().catch(() => ""));
  }
  return parts.join("\n");
}

function mentions(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

async function shot(page, name, width) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  const dir = join(dirname(outDir), "shots");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false }).catch(() => {});
}

async function runRoleFixture(page, base) {
  const context = page.context();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="role-nav"][data-role="guest"]:visible').first().waitFor({ timeout: timeoutMs });
    let guestNav = await roleNavText(page);
    await shot(page, "guest-desktop", 1280);
    const menu = page.locator('header button[aria-label="Menu"]');
    if (await menu.isVisible().catch(() => false)) {
      await menu.click({ timeout: 8000 });
      const drawerNav = page.locator("#ke-nav-drawer [data-ke='role-nav']");
      await drawerNav.waitFor({ timeout: 8000 }).catch(() => {});
      guestNav = `${guestNav}\n${await drawerNav.innerText().catch(() => "")}`;
      await page.keyboard.press("Escape");
    }
    await shot(page, "guest-390", 390);
    const guestOk =
      /i'm a parent/i.test(guestNav) &&
      /i'm a daycare/i.test(guestNav) &&
      /sign in/i.test(guestNav) &&
      !/requests & tours/i.test(guestNav);
    record("menu-guest", guestOk, { note: guestOk ? "guest" : guestNav.slice(0, 180) });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "parent" });
    const parentWrong = await page.goto(new URL("/provider", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForURL(/\/parent/i, { timeout: timeoutMs }).catch(() => {});
    const parentHome = /\/parent/i.test(page.url());
    record("redirect-parent-from-daycare", parentHome, {
      note: page.url(),
      status: parentWrong?.status() ?? 0,
    });
    await page.locator('[data-ke="parent-home"]').waitFor({ timeout: timeoutMs });
    await shot(page, "parent-390", 390);
    await shot(page, "parent-desktop", 1280);
    const parentNav = await roleNavText(page);
    const parentCross = mentions(parentNav, ["My listing", "Enquiries", "I'm a daycare", "Get more with Pro"]);
    const parentUpgrade = page.locator('[data-nav="upgrade"]:visible');
    const parentLabel = ((await parentUpgrade.first().innerText().catch(() => "")) || "").trim();
    record("menu-parent", parentHome && parentCross.length === 0 && /home/i.test(parentNav) && parentLabel === "Upgrade", {
      note: parentCross.join(",") || parentLabel || "parent",
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "parent", plan: "paid" });
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-nav="upgrade"]:visible').first().waitFor({ timeout: timeoutMs }).catch(() => {});
    const paidLabel = ((await page.locator('[data-nav="upgrade"]:visible').first().innerText().catch(() => "")) || "").trim();
    await page.locator('[data-nav="upgrade"]:visible').first().click().catch(() => {});
    await page.locator('[data-ke="manage-or-cancel"]').waitFor({ timeout: timeoutMs }).catch(() => {});
    const managed = (await page.locator('[data-ke="manage-or-cancel"]').count()) > 0;
    record("upgrade-my-plan-parent", paidLabel === "My plan" && managed, { note: paidLabel });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider" });
    const daycareWrong = await page.goto(new URL("/parent", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForURL(/\/provider/i, { timeout: timeoutMs }).catch(() => {});
    const daycareHome = /\/provider/i.test(page.url());
    record("redirect-daycare-from-parent", daycareHome, {
      note: page.url(),
      status: daycareWrong?.status() ?? 0,
    });
    await page.locator('[data-ke="daycare-desk"]').waitFor({ timeout: timeoutMs });
    await shot(page, "daycare-390", 390);
    await shot(page, "daycare-desktop", 1280);
    const daycareNav = await roleNavText(page);
    const daycareCross = mentions(daycareNav, ["Saved", "Requests & tours", "I'm a parent", "Try Parent Plus"]);
    const daycareLabel = ((await page.locator('[data-nav="upgrade"]:visible').first().innerText().catch(() => "")) || "").trim();
    record("menu-daycare", daycareHome && daycareCross.length === 0 && /desk/i.test(daycareNav) && daycareLabel === "Upgrade", {
      note: daycareCross.join(",") || daycareLabel || "daycare",
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider", plan: "paid" });
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const daycarePaid = ((await page.locator('[data-nav="upgrade"]:visible').first().innerText().catch(() => "")) || "").trim();
    record("upgrade-my-plan-daycare", daycarePaid === "My plan", { note: daycarePaid });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.context().clearCookies();
    await page.goto(new URL("/search", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const listingHref = await page.locator('a[href*="/daycare/"]').evaluateAll((els) => {
      for (const el of els) {
        const href = el.getAttribute("href") || "";
        if (href.includes("/daycare/") && !href.includes("/daycare/city")) return href;
      }
      return "";
    });
    if (!listingHref) {
      record("listing-role-actions", false, { note: "no public listing link on /search" });
    } else {
      const listingUrl = new URL(listingHref, base).href;
      const slug = listingHref.split("/daycare/")[1]?.split(/[?#]/)[0] || "";
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.getByRole("button", { name: /^Essential$/ }).click().catch(() => {});
      await page.locator('[data-ke="listing-parent-actions"]:visible').first().waitFor({ timeout: timeoutMs }).catch(() => {});
      const guestActions = await page.locator('[data-ke="listing-parent-actions"]:visible').count();
      const save = page.getByRole("button", { name: /^save$/i });
      const tour = page.getByRole("button", { name: /book a tour/i });
      if (await save.count()) await save.first().click();
      else if (await tour.count()) await tour.first().click();
      await page.waitForURL(/\/login/i, { timeout: timeoutMs }).catch(() => {});
      record("listing-guest-signin", guestActions > 0 && /\/login/i.test(page.url()), {
        note: `actions=${guestActions} save=${await save.count()} tour=${await tour.count()} url=${page.url()}`,
      });

      await setFixture(context, base, { role: "provider" });
      await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.locator("h1").first().waitFor({ timeout: timeoutMs }).catch(() => {});
      const otherParent = await page.locator('[data-ke="listing-parent-actions"]').count();
      const otherEdit = await page.locator('[data-ke="listing-edit"]').count();
      record("listing-daycare-other", otherParent === 0 && otherEdit === 0, {
        note: `parent=${otherParent} edit=${otherEdit}`,
      });

      await setFixture(context, base, { role: "provider", own: slug });
      await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.locator('[data-ke="listing-edit"]').first().waitFor({ timeout: timeoutMs }).catch(() => {});
      const ownParent = await page.locator('[data-ke="listing-parent-actions"]').count();
      const ownEdit = await page.locator('[data-ke="listing-edit"]').count();
      record("listing-daycare-own", ownParent === 0 && ownEdit > 0, {
        note: `parent=${ownParent} edit=${ownEdit} slug=${slug}`,
      });
    }

    await setFixture(context, base, { role: "parent" });
    const parentAdmin = await page.goto(new URL("/admin", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    const parentAdminBody = await page.locator("body").innerText().catch(() => "");
    const parentAdminGate = classifyAdminGate({
      finalUrl: page.url(),
      status: parentAdmin?.status() ?? 0,
      bodyText: parentAdminBody,
    });
    record("admin-parent-404", parentAdminGate.ok && parentAdminGate.kind === "not-found", {
      note: parentAdminGate.kind,
      status: parentAdmin?.status() ?? 0,
    });

    await context.clearCookies();
    const signedOutAdmin = await page.goto(new URL("/admin", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    const signedOutBody = await page.locator("body").innerText().catch(() => "");
    const signedOutGate = classifyAdminGate({
      finalUrl: page.url(),
      status: signedOutAdmin?.status() ?? 0,
      bodyText: signedOutBody,
    });
    record("admin-signed-out-404", signedOutGate.ok && signedOutGate.kind === "not-found", {
      note: signedOutGate.kind,
      status: signedOutAdmin?.status() ?? 0,
    });
  } catch (err) {
    record("role-fixture", false, { note: err instanceof Error ? err.message : String(err) });
  } finally {
    await page.context().clearCookies().catch(() => {});
    await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  }
}

function record(name, pass, detail = {}) {
  results.push({ name, ok: pass, ...detail });
  const mark = pass ? "ok" : "FAIL";
  console.log(`[e2e] ${mark}  ${name}${detail.note ? ` — ${detail.note}` : ""}`);
}

async function waitForOrigin(url, ms) {
  const deadline = Date.now() + ms;
  let last = "not tried";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err?.message || err);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`preview not ready at ${url}: ${last}`);
}

function startPreview() {
  // The Nitro `vercel` preset sets production-like paths. Without DATABASE_URL,
  // the bundled server must not boot PGLite (it looks for a missing
  // pglite.data). VERCEL=1 selects the same `none` SQL backend as Vercel
  // preview/production — catalogue pages still render. See docs/e2e.md.
  const env = { ...process.env };
  if (!String(env.DATABASE_URL || "").trim()) {
    env.VERCEL = env.VERCEL || "1";
  }
  // Loopback role cookie for this preview only. Production must not set this.
  env.E2E_ROLE_FIXTURE = "1";
  previewChild = spawn("npm", ["run", "preview"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env,
    detached: true,
  });
  previewChild.stdout.on("data", (buf) => process.stdout.write(buf));
  previewChild.stderr.on("data", (buf) => process.stderr.write(buf));
  previewChild.on("exit", (code, signal) => {
    if (code && code !== 0 && process.exitCode == null) {
      console.error(`[e2e] preview exited ${code}${signal ? ` / ${signal}` : ""}`);
    }
  });
}

function stopPreview() {
  if (!previewChild?.pid) return;
  const pid = previewChild.pid;
  previewChild.stdout?.destroy();
  previewChild.stderr?.destroy();
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      previewChild.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }, 2000).unref();
}

async function runBrowserSmoke(url) {
  const shot = join(dirname(outDir), "browser-smoke.png");
  const child = spawn(
    process.execPath,
    [join(root, "scripts/browser-smoke.mjs"), url, shot],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  const code = await new Promise((resolve) => child.on("close", resolve));
  record("browser-smoke", code === 0 || code === 2, {
    note: code === 2 ? "console noise (exit 2) tolerated" : `exit ${code}`,
    exit: code,
  });
}

function requestWithHost(url, host) {
  const parsed = new URL(url);
  const lib = parsed.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: { host },
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, location: res.headers.location || "" });
        res.resume();
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function adminHttpGate(base) {
  const adminUrl = new URL(SMOKE_PATHS.admin, base).href;
  try {
    const res = await requestWithHost(adminUrl, "kidease-git.vercel.app");
    const gate = classifyAdminGate({
      status: res.status,
      locationHeader: res.location,
    });
    record("admin-access-header", gate.ok, {
      note: gate.ok ? gate.kind : gate.reason,
      status: res.status,
      location: res.location,
    });
    return;
  } catch {
    /* Host override is best-effort; Playwright guest gate is the CI assertion. */
  }
  record("admin-access-header", true, {
    note: "skipped Host override (local guest /login gate still required)",
    skipped: true,
  });
}

let browser = null;
try {
  if (args.startPreview && !args.explicitUrl) {
    startPreview();
    await waitForOrigin(origin, Number(process.env.E2E_PREVIEW_WAIT_MS || 90000));
  } else {
    await waitForOrigin(origin, Number(process.env.E2E_PREVIEW_WAIT_MS || 15000)).catch((err) => {
      if (args.requireServer || args.explicitUrl) throw err;
      throw err;
    });
  }

  const base = origin.endsWith("/") ? origin : `${origin}/`;

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const homeResp = await page.goto(new URL(SMOKE_PATHS.home, base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page.getByRole("heading", { level: 1, name: /Find licensed daycare near you/i }).waitFor({
    timeout: timeoutMs,
  });
  const home = homepageLooksLive({
    title: await page.title(),
    bodyText: await page.locator("body").innerText().catch(() => ""),
    status: homeResp?.status() ?? 0,
  });
  await page.screenshot({ path: join(dirname(outDir), "home.png"), fullPage: false }).catch(() => {});
  record("homepage", home.ok, { note: home.reason, status: homeResp?.status() ?? 0 });

  const healthResp = await page.request.get(new URL(HEALTH_SMOKE_PATH, base).href).catch(() => null);
  const healthBody = (await healthResp?.text().catch(() => "")) || "";
  const health = classifyPublicHealth({
    status: healthResp?.status() ?? 0,
    bodyText: healthBody,
  });
  record("api-health", health.ok, {
    note: health.kind === "ok" ? health.kind : health.reason,
    status: healthResp?.status() ?? 0,
  });

  const loginResp = await page.goto(new URL(SMOKE_PATHS.login, base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page.getByRole("heading", { level: 1, name: /Sign in/i }).waitFor({ timeout: timeoutMs });
  const email = page.locator('input[type="email"]');
  await email.waitFor({ timeout: timeoutMs });
  const login = loginPageLooksLive({
    title: await page.title(),
    bodyText: await page.locator("body").innerText().catch(() => ""),
    hasEmail: (await email.count()) > 0,
    status: loginResp?.status() ?? 0,
  });
  await page.screenshot({ path: join(dirname(outDir), "login.png"), fullPage: false }).catch(() => {});
  record("login", login.ok, { note: login.reason, status: loginResp?.status() ?? 0 });

  const adminResp = await page.goto(new URL(SMOKE_PATHS.admin, base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page
    .getByText(/page not found/i)
    .first()
    .waitFor({ timeout: timeoutMs })
    .catch(() => {});
  const adminBody = await page.locator("body").innerText().catch(() => "");
  const adminGate = classifyAdminGate({
    finalUrl: page.url(),
    status: adminResp?.status() ?? 0,
    bodyText: adminBody,
    locationHeader: adminResp?.headers()?.location ?? "",
  });
  await page.screenshot({ path: join(dirname(outDir), "admin.png"), fullPage: false }).catch(() => {});
  record("admin-guest-gate", adminGate.ok, {
    note: adminGate.kind === "unknown" ? adminGate.reason : adminGate.kind,
    status: adminResp?.status() ?? 0,
    url: page.url(),
  });

  await adminHttpGate(base);

  const parentResp = await page.goto(new URL(SMOKE_PATHS.parent, base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page.waitForURL(/\/login|\/parent/i, { timeout: timeoutMs }).catch(() => {});
  const parentBody = await page.locator("body").innerText().catch(() => "");
  const parentGate = classifyParentGuestGate({
    finalUrl: page.url(),
    status: parentResp?.status() ?? 0,
    bodyText: parentBody,
    locationHeader: parentResp?.headers()?.location ?? "",
  });
  await page.screenshot({ path: join(dirname(outDir), "parent-guest.png"), fullPage: false }).catch(() => {});
  record("parent-guest-gate", parentGate.ok, {
    note: parentGate.kind === "unknown" || parentGate.kind === "open" ? parentGate.reason : parentGate.kind,
    status: parentResp?.status() ?? 0,
    url: page.url(),
  });

  const providerResp = await page.goto(new URL(SMOKE_PATHS.provider, base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  const providerBody = await page.locator("body").innerText().catch(() => "");
  const providerGate = classifyProviderGuestGate({
    finalUrl: page.url(),
    status: providerResp?.status() ?? 0,
    bodyText: providerBody,
    locationHeader: providerResp?.headers()?.location ?? "",
  });
  await page.screenshot({ path: join(dirname(outDir), "provider-guest.png"), fullPage: false }).catch(() => {});
  record("provider-guest-gate", providerGate.ok, {
    note: providerGate.kind === "unknown" || providerGate.kind === "open" ? providerGate.reason : providerGate.kind,
    status: providerResp?.status() ?? 0,
    url: page.url(),
  });

  for (const apiPath of ADMIN_API_SMOKE_PATHS) {
    const apiResp = await page.request.get(new URL(apiPath, base).href).catch(() => null);
    const apiStatus = apiResp?.status() ?? 0;
    const apiBody = (await apiResp?.text().catch(() => "")) || "";
    const apiGate = classifyAdminApiGate({
      status: apiStatus,
      locationHeader: apiResp?.headers()?.location ?? "",
      bodyText: apiBody,
      finalUrl: apiResp?.url() ?? "",
    });
    record(`admin-api-guest:${apiPath}`, apiGate.ok, {
      note: apiGate.kind === "unknown" || apiGate.kind === "open" ? apiGate.reason : apiGate.kind,
      status: apiStatus,
    });
  }

  await runRoleFixture(page, base);

  if (args.browserSmoke) {
    await runBrowserSmoke(base);
  }

  const failed = results.filter((r) => !r.ok);
  const verdict = {
    ok: failed.length === 0,
    origin,
    results,
    failed: failed.map((r) => r.name),
  };
  writeFileSync(verdictPath, JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  const failure = { ok: false, origin, error: String(err?.message || err), results };
  try {
    writeFileSync(verdictPath, JSON.stringify(failure, null, 2));
  } catch {
    /* ignore */
  }
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopPreview();
}
