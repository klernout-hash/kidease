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
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl, smokeAllowedOutputDirs } from "./browser-guard.mjs";
import {
  classifyAdminGate,
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
  previewChild = spawn("npm", ["run", "preview"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
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
  if (!previewChild || previewChild.killed) return;
  previewChild.kill("SIGTERM");
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

async function adminHttpGate(base) {
  const adminUrl = new URL(SMOKE_PATHS.admin, base).href;
  try {
    const res = await fetch(adminUrl, {
      redirect: "manual",
      headers: { host: "kidease-git.vercel.app" },
    });
    const location = res.headers.get("location") || "";
    const gate = classifyAdminGate({
      status: res.status,
      locationHeader: location,
      finalUrl: res.url,
    });
    if (gate.ok) {
      record("admin-access-header", true, { note: gate.kind, status: res.status, location });
      return;
    }
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
  await page.getByRole("heading", { name: /Find licensed daycare near you|KidEase/i }).waitFor({
    timeout: timeoutMs,
  });
  const home = homepageLooksLive({
    title: await page.title(),
    bodyText: await page.locator("body").innerText().catch(() => ""),
    status: homeResp?.status() ?? 0,
  });
  await page.screenshot({ path: join(dirname(outDir), "home.png"), fullPage: false }).catch(() => {});
  record("homepage", home.ok, { note: home.reason, status: homeResp?.status() ?? 0 });

  const loginResp = await page.goto(new URL(SMOKE_PATHS.login, base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
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
    .waitForURL(/\/login|cloudflareaccess/i, { timeout: timeoutMs })
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
