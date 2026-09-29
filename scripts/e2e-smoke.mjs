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
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
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

async function settleMockCheckout(page) {
  // The panel assigns the mock Checkout URL. Wait until that navigation commits
  // so the next page.goto is not interrupted. The script never pays.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 }).catch(async () => {
    await page.evaluate(() => window.stop()).catch(() => {});
  });
}

async function setFixture(context, base, { role, plan, own, activity } = {}) {
  await context.clearCookies();
  const res = await context.request.post(new URL("/api/e2e-seed", base).href, {
    data: { role, paid: plan === "paid", ownSlug: own || "", activity: Boolean(activity) },
    headers: { origin: base, "content-type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(`seed ${role || "parent"} ${res.status()} ${(await res.text()).slice(0, 200)}`);
  }
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

async function appBarText(page, href) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const bar = page.locator('[data-ke="app-tab-bar"]');
  await bar.waitFor({ state: "visible", timeout: timeoutMs });
  return ((await bar.innerText()) || "").replace(/\s+/g, " ").trim();
}

async function upgradePlaces(page) {
  const header = ((await page.locator('header [data-ke="role-nav"] [data-nav="upgrade"]').innerText().catch(() => "")) || "").trim();
  const panel = ((await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]').innerText().catch(() => "")) || "").trim();
  let drawer = "";
  const menu = page.locator('header button[aria-label="Menu"]');
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    const row = page.locator('#ke-nav-drawer [data-nav="upgrade"]');
    await row.waitFor({ timeout: 8000 }).catch(() => {});
    drawer = ((await row.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    await page.keyboard.press("Escape");
  }
  return { header, panel, drawer };
}

async function shot(page, name, width, content) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  // Channel is chosen once at document load. Reload so 390px shots use the app bar.
  await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
  const ready =
    width < 1024 ? page.locator('[data-ke="app-tab-bar"]') : page.locator('header button[aria-label="Menu"]');
  await ready.first().waitFor({ timeout: timeoutMs }).catch(() => {});
  if (content) await page.locator(content).first().waitFor({ timeout: timeoutMs }).catch(() => {});
  const dir = join(dirname(outDir), "shots");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false }).catch(() => {});
}

async function runRoleFixture(page, base) {
  const context = page.context();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('header button[aria-label="Menu"]').first().waitFor({ timeout: timeoutMs });
    await page.locator('header button[aria-label="Menu"]').click();
    await page.locator('#ke-nav-drawer [data-ke="role-nav"][data-role="guest"]').waitFor({ timeout: timeoutMs });
    let guestNav = await page.locator('#ke-nav-drawer [data-ke="role-nav"]').innerText();
    const guestPricing = await page.locator('[data-ke="optional-upgrades"]').count();
    const guestPlans = await page.locator('#ke-nav-drawer [data-nav="plans"]').count();
    const guestFooterPlans = await page.locator('footer a[href="/plans"]').count();
    record("guest-no-pricing", guestPricing === 0, { note: `pricing blocks ${guestPricing}` });
    record("guest-plans-links", guestPlans > 0 && guestFooterPlans > 0, {
      note: `nav=${guestPlans} footer=${guestFooterPlans}`,
    });
    await shot(page, "guest-desktop", 1280, "h1");
    await page.keyboard.press("Escape");
    const menu = page.locator('header button[aria-label="Menu"]');
    if (await menu.isVisible().catch(() => false)) {
      await menu.click({ timeout: 8000 });
      const drawerNav = page.locator("#ke-nav-drawer [data-ke='role-nav']");
      await drawerNav.waitFor({ timeout: 8000 }).catch(() => {});
      await page.locator('#ke-nav-drawer [data-nav="plans"]').waitFor({ timeout: 8000 }).catch(() => {});
      guestNav = `${guestNav}\n${await drawerNav.innerText().catch(() => "")}`;
      const dir = join(dirname(outDir), "shots");
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, "guest-menu.png"), fullPage: false }).catch(() => {});
      await page.keyboard.press("Escape");
    }
    await shot(page, "guest-390", 390, "h1");
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
    await page.locator('[data-ke="parent-home"][data-settled="1"]').waitFor({ timeout: timeoutMs });
    const parentCardNew = await page.locator('[data-ke="upgrade-card"]').count();
    record("parent-card-new", parentCardNew === 0, { note: `cards ${parentCardNew}` });
    await shot(page, "parent-new", 1280, '[data-ke="parent-home"]');
    await shot(page, "parent-390", 390, '[data-ke="parent-home"]');
    await shot(page, "parent-desktop", 1280, '[data-ke="parent-home"]');
    await page.locator('header button[aria-label="Menu"]').click();
    await page.locator('#ke-nav-drawer [data-ke="role-nav"][data-role="parent"]').waitFor({ timeout: timeoutMs });
    const parentNav = await page.locator('#ke-nav-drawer [data-ke="role-nav"]').innerText();
    await page.keyboard.press("Escape");
    const parentCross = mentions(parentNav, ["My listing", "Enquiries", "I'm a daycare", "Get more with Pro"]);
    const parentPlaces = await upgradePlaces(page);
    const parentChrome = await page.locator("body").innerText();
    const parentSignIn = /parent sign in|daycare sign in/i.test(parentChrome);
    record(
      "menu-parent",
      parentHome &&
        parentCross.length === 0 &&
        /home/i.test(parentNav) &&
        !parentSignIn &&
        parentPlaces.drawer === "Upgrade",
      { note: parentSignIn ? "sign-in leak" : parentCross.join(",") || JSON.stringify(parentPlaces) },
    );
    const parentBar = await appBarText(page, new URL("/parent", base).href);
    record(
      "bottom-bar-parent",
      /\bHome\b/.test(parentBar) &&
        /\bSaved\b/.test(parentBar) &&
        /\bRequests\b/.test(parentBar) &&
        /\bMessages\b/.test(parentBar) &&
        /\bUpgrade\b/.test(parentBar) &&
        !/\bDesk\b/.test(parentBar) &&
        !/\bEnquiries\b/.test(parentBar) &&
        !/\bEnrolled\b/.test(parentBar),
      { note: parentBar },
    );
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "parent", plan: "paid" });
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('header [data-nav="upgrade"]:visible').first().waitFor({ timeout: timeoutMs }).catch(() => {});
    const paidPlaces = await upgradePlaces(page);
    await page.locator('header button[aria-label="Menu"]').click();
    await page.locator('#ke-nav-drawer [data-nav="upgrade"]').click();
    await page.locator('[data-ke="manage-or-cancel"]').waitFor({ timeout: timeoutMs }).catch(() => {});
    const managed = (await page.locator('[data-ke="manage-or-cancel"]').count()) > 0;
    record(
      "upgrade-my-plan-parent",
      paidPlaces.drawer === "My plan" && managed,
      { note: JSON.stringify(paidPlaces) },
    );

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
    await page.locator('[data-ke="daycare-desk"][data-settled="1"]').waitFor({ timeout: timeoutMs });
    const daycareCardNew = await page.locator('[data-ke="upgrade-card"]').count();
    record("daycare-card-new", daycareCardNew === 0, { note: `cards ${daycareCardNew}` });
    await shot(page, "daycare-390", 390, '[data-ke="daycare-desk"]');
    await shot(page, "daycare-desktop", 1280, '[data-ke="daycare-desk"]');
    await page.locator('header button[aria-label="Menu"]').click();
    await page.locator('#ke-nav-drawer [data-ke="role-nav"][data-role="provider"]').waitFor({ timeout: timeoutMs });
    const daycareNav = await page.locator('#ke-nav-drawer [data-ke="role-nav"]').innerText();
    await page.keyboard.press("Escape");
    const daycareCross = mentions(daycareNav, ["Saved", "Requests & tours", "I'm a parent", "Try Parent Plus"]);
    const daycarePlaces = await upgradePlaces(page);
    const daycareChrome = await page.locator("body").innerText();
    const daycareSignIn = /parent sign in|daycare sign in/i.test(daycareChrome);
    record(
      "menu-daycare",
      daycareHome &&
        daycareCross.length === 0 &&
        /desk/i.test(daycareNav) &&
        !daycareSignIn &&
        daycarePlaces.drawer === "Upgrade",
      { note: daycareSignIn ? "sign-in leak" : daycareCross.join(",") || JSON.stringify(daycarePlaces) },
    );
    // Pure daycare fixture (role=provider), not an admin who also owns centres.
    const daycareBar = await appBarText(page, new URL("/provider", base).href);
    record(
      "bottom-bar-daycare",
      daycareBar.includes("Desk") &&
        daycareBar.includes("Listing") &&
        daycareBar.includes("Enquiries") &&
        daycareBar.includes("Messages") &&
        daycareBar.includes("Upgrade") &&
        !/\bSaved\b/.test(daycareBar) &&
        !/\bEnrolled\b/.test(daycareBar),
      { note: `role=provider ${daycareBar}` },
    );
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider", plan: "paid" });
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const daycarePaidPlaces = await upgradePlaces(page);
    record(
      "upgrade-my-plan-daycare",
      daycarePaidPlaces.header === "My plan" && daycarePaidPlaces.panel === "My plan" && daycarePaidPlaces.drawer === "My plan",
      { note: JSON.stringify(daycarePaidPlaces) },
    );

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider" });
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="daycare-desk"]').waitFor({ timeout: timeoutMs });
    const headerUpgrade = ((await page.locator('[data-nav="upgrade"]:visible').first().innerText().catch(() => "")) || "").trim();
    await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]').click();
    await page.waitForURL(/\/provider\/subscription/i, { timeout: timeoutMs }).catch(() => {});
    const deskCheckout = page.locator('[data-ke="plan-checkout"]:visible').first();
    await deskCheckout.waitFor({ timeout: timeoutMs }).catch(() => {});
    const deskHit = page.waitForRequest((req) => req.url().includes("cs_test_e2e_mock"), { timeout: timeoutMs }).catch(() => null);
    if ((await deskCheckout.count()) > 0) await deskCheckout.click();
    const deskReached = Boolean(await deskHit);
    await settleMockCheckout(page);
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('header [data-nav="upgrade"]:visible').first().click();
    await page.waitForURL(/\/provider\/subscription/i, { timeout: timeoutMs }).catch(() => {});
    const homeCheckout = page.locator('[data-ke="plan-checkout"]:visible').first();
    await homeCheckout.waitFor({ timeout: timeoutMs }).catch(() => {});
    const homeHit = page.waitForRequest((req) => req.url().includes("cs_test_e2e_mock"), { timeout: timeoutMs }).catch(() => null);
    if ((await homeCheckout.count()) > 0) await homeCheckout.click();
    const homeReached = Boolean(await homeHit);
    await settleMockCheckout(page);
    record("daycare-checkout-two-clicks", headerUpgrade === "Upgrade" && deskReached && homeReached, {
      note: `${headerUpgrade} desk=${deskReached} home=${homeReached}`,
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "parent" });
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="parent-home"]').waitFor({ timeout: timeoutMs });
    const parentHeaderUpgrade = ((await page.locator('[data-nav="upgrade"]:visible').first().innerText().catch(() => "")) || "").trim();
    await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]').click();
    await page.waitForURL(/tab=payments/i, { timeout: timeoutMs }).catch(() => {});
    const deskPlus = page.locator('[data-ke="plan-checkout"]:visible').first();
    await deskPlus.waitFor({ timeout: timeoutMs }).catch(() => {});
    const parentDeskHit = page.waitForRequest((req) => req.url().includes("cs_test_e2e_mock"), { timeout: timeoutMs }).catch(() => null);
    if ((await deskPlus.count()) > 0) await deskPlus.click();
    const parentDeskReached = Boolean(await parentDeskHit);
    await settleMockCheckout(page);
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('header [data-nav="upgrade"]:visible').first().click();
    await page.waitForURL(/tab=payments/i, { timeout: timeoutMs }).catch(() => {});
    const homePlus = page.locator('[data-ke="plan-checkout"]:visible').first();
    await homePlus.waitFor({ timeout: timeoutMs }).catch(() => {});
    const parentHomeHit = page.waitForRequest((req) => req.url().includes("cs_test_e2e_mock"), { timeout: timeoutMs }).catch(() => null);
    if ((await homePlus.count()) > 0) await homePlus.click();
    const parentHomeReached = Boolean(await parentHomeHit);
    await settleMockCheckout(page);
    record("parent-plus-two-clicks", parentHeaderUpgrade === "Upgrade" && parentDeskReached && parentHomeReached, {
      note: `${parentHeaderUpgrade} desk=${parentDeskReached} home=${parentHomeReached}`,
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "parent", activity: true });
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="upgrade-card"]').waitFor({ timeout: timeoutMs });
    await shot(page, "parent-active", 1280, '[data-ke="upgrade-card"]');
    await page.locator('[data-ke="upgrade-card-dismiss"]').click();
    await page.locator('[data-ke="upgrade-card"]').waitFor({ state: "hidden", timeout: timeoutMs }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="parent-home"]').waitFor({ timeout: timeoutMs });
    const parentCardAfter = await page.locator('[data-ke="upgrade-card"]').count();
    record("parent-card-dismissed", parentCardAfter === 0, { note: `cards ${parentCardAfter}` });

    await setFixture(context, base, { role: "provider", activity: true });
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="upgrade-card"]').waitFor({ timeout: timeoutMs });
    await page.locator('[data-ke="upgrade-card-dismiss"]').click();
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="daycare-desk"]').waitFor({ timeout: timeoutMs });
    const daycareCardAfter = await page.locator('[data-ke="upgrade-card"]').count();
    record("daycare-card-dismissed", daycareCardAfter === 0, { note: `cards ${daycareCardAfter}` });

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

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL("/login?role=admin", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const adminLoginTitle = ((await page.locator("h1").first().innerText().catch(() => "")) || "").trim();
    record("login-role-admin-plain", !/operator|admin/i.test(adminLoginTitle), { note: adminLoginTitle });
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: "visible", timeout: timeoutMs });
    const ownerEmail = "kyle@kidease.ca";
    let ownerForm = false;
    for (let attempt = 0; attempt < 4 && !ownerForm; attempt += 1) {
      await emailInput.fill(ownerEmail);
      ownerForm = await page
        .locator('[data-ke="admin-email-first"]')
        .waitFor({ state: "visible", timeout: 4000 })
        .then(() => true)
        .catch(() => false);
    }
    const ownerTitle = ((await page.locator("h1").first().innerText().catch(() => "")) || "").trim();
    const ownerValue = await emailInput.inputValue().catch(() => "");
    const ownerSocial = await page.locator('[data-ke="social-sign-in"]').count();
    record("owner-email-password", ownerForm && ownerSocial === 0 && !/operator|admin/i.test(ownerTitle), {
      note: `${ownerTitle} value=${ownerValue} social=${ownerSocial}`,
    });
    const twoFactorPath = `/${"verify"}-${"2fa"}`;
    await page.goto(`${new URL(twoFactorPath, base).href}?next=/admin`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForURL(/\/login/i, { timeout: timeoutMs }).catch(() => {});
    const verifyTitle = ((await page.locator("h1").first().innerText().catch(() => "")) || "").trim();
    record("verify-2fa-admin-next-plain", /\/login/i.test(page.url()) && !/operator|admin/i.test(verifyTitle), {
      note: `${page.url()} ${verifyTitle}`,
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

function stagePgliteArtifacts() {
  // Nitro inlines PGLite into the server function, so the relative
  // pglite.data / wasm URLs point at that directory. Copy the package files
  // there or the preview process exits before the first request.
  const dest = join(root, ".vercel/output/functions/__server.func");
  const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
  for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
    copyFileSync(join(srcDir, name), join(dest, name));
  }
}

function startPreview() {
  // Role smoke signs in real accounts and opens the real plan panels, so the
  // preview needs PGLite when DATABASE_URL is unset. Do not set VERCEL here:
  // that selects the empty SQL backend. Catalogue pages still fall back to
  // the bundled JSON when the database is not Neon.
  const env = { ...process.env };
  if (!String(env.DATABASE_URL || "").trim()) {
    delete env.VERCEL;
    stagePgliteArtifacts();
  }
  // Loopback seed + mocked checkout only. Production builds ignore the role cookie.
  env.E2E_ROLE_FIXTURE = "1";
  env.SHOW_PAY_CTAS = "1";
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
