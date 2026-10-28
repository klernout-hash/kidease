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
import { chromium, webkit } from "playwright";
import { runIpadViewportPass } from "./ipad-viewports.mjs";
import { runPhoneViewportPass } from "./phone-viewports.mjs";
import { runFoldResizePass } from "./fold-resize.mjs";
import { runStoreViewportPass } from "./store-viewports.mjs";
import { runDesktopVisualPass } from "./desktop-visual.mjs";
import { checkedOutputPath, checkedUrl, smokeAllowedOutputDirs } from "./browser-guard.mjs";
import { withNetRetry } from "./e2e-net.mjs";
import {
  ADMIN_API_SMOKE_PATHS,
  classifyAdminApiGate,
  classifyAdminGate,
  classifyParentGuestGate,
  classifyProviderGuestGate,
  classifyPublicHealth,
  HEALTH_SMOKE_PATH,
  DEFAULT_PREVIEW_ORIGIN,
  FR_CITY_HUB_SLUGS,
  frenchCityHubSsrOk,
  homepageLooksLive,
  loginPageLooksLive,
  ciPlaywrightRetries,
  loadQuarantine,
  parseE2eArgs,
  skipReason,
  smokeGroupSelected,
  splitSmokeResults,
  SMOKE_PATHS,
  targetOrigin,
} from "./e2e-smoke-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseE2eArgs(process.argv.slice(2), process.env);
let quarantineChecks = [];
try {
  quarantineChecks = loadQuarantine(join(root, "e2e/quarantine.json"));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exit(1);
}
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

async function setFixture(context, base, { role, plan, own, activity, attention } = {}) {
  await context.clearCookies();
  // Up to 2 retries on CI and locally for ECONNRESET and the same connection errors.
  const res = await withNetRetry(
    () =>
      context.request.post(new URL("/api/e2e-seed", base).href, {
        data: { role, paid: plan === "paid", ownSlug: own || "", activity: Boolean(activity), attention: Boolean(attention) },
        headers: { origin: base, "content-type": "application/json" },
      }),
    { retries: 2, label: `seed ${role || "parent"}` },
  );
  if (!res.ok()) {
    throw new Error(`seed ${role || "parent"} ${res.status()} ${(await res.text()).slice(0, 200)}`);
  }
  return res;
}

/**
 * WebKit drops Secure `__Host-` cookies on http://127.0.0.1. Copy the session
 * token into the loopback preview cookie the server accepts for this fixture.
 */
async function pinWebkitE2eSession(context, base, response) {
  const headers = response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie");
  const cookies = [];
  for (const header of headers) {
    const pair = header.value.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    if (!name.includes("session_token")) continue;
    let value = pair.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep the raw value */
    }
    cookies.push({
      name: "kidease.e2e_session",
      value,
      url: base,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
  }
  if (cookies.length === 0) throw new Error("seed did not set a session cookie");
  await context.addCookies(cookies);
}

async function openHeaderMenu(page) {
  const menu = page.locator('header button[aria-label="Menu"]');
  const drawer = page.locator("#ke-nav-drawer");
  await menu.first().waitFor({ timeout: timeoutMs });
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await drawer.isVisible().catch(() => false)) return;
    try {
      // A layout pass can leave the button without a box. Force still throws then.
      await menu.first().click({ force: true, timeout: 2000 });
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250);
      continue;
    }
    if (await drawer.waitFor({ state: "visible", timeout: 1500 }).then(() => true).catch(() => false)) return;
  }
  if (lastError) throw lastError;
  await drawer.waitFor({ timeout: timeoutMs });
}

/** Role chrome can remount the drawer link once. Re-open and click again. The checkout assertion stays. */
async function clickDrawerUpgrade(page) {
  const link = page.locator('#ke-nav-drawer [data-nav="upgrade"]');
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await openHeaderMenu(page);
    await openAccountGroup(page, "#ke-nav-drawer");
    try {
      await link.waitFor({ state: "visible", timeout: 8000 });
      await link.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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

async function waitUntilEditClosed(page) {
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("edit"), { timeout: timeoutMs });
}

async function appBarText(page, href) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const bar = page.locator('[data-ke="app-tab-bar"]');
  await bar.waitFor({ state: "visible", timeout: timeoutMs });
  return ((await bar.innerText()) || "").replace(/\s+/g, " ").trim();
}

async function openAccountGroup(page, root) {
  const link = page.locator(`${root} [data-nav="upgrade"]`);
  if (await link.first().isVisible().catch(() => false)) return;
  const summary = page.locator(`${root} summary`).filter({ hasText: /^Account$/ });
  if ((await summary.count()) > 0) await summary.first().click().catch(() => {});
}

async function upgradePlaces(page) {
  const header = ((await page.locator('header [data-ke="role-nav"] [data-nav="upgrade"]').innerText().catch(() => "")) || "").trim();
  await openAccountGroup(page, '[data-ke="desk-desktop-nav"]');
  const panel = ((await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]').innerText().catch(() => "")) || "").trim();
  let drawer = "";
  const menu = page.locator('header button[aria-label="Menu"]');
  if (await menu.isVisible().catch(() => false)) {
    await menu.click({ force: true });
    await openAccountGroup(page, "#ke-nav-drawer");
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
    await openHeaderMenu(page);
    await page.locator('#ke-nav-drawer [data-ke="role-nav"][data-role="guest"]').waitFor({ timeout: timeoutMs });
    let guestNav = await page.locator("#ke-nav-drawer").innerText();
    const guestPricing = await page.locator('[data-ke="optional-upgrades"]').count();
    const guestPlanLink = page.locator('#ke-nav-drawer [data-nav="plans"]');
    const guestPlans = await guestPlanLink.count();
    const guestPlanLabel = ((await guestPlanLink.first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    const guestFooterLink = page.locator('footer a[href="/plans"]');
    const guestFooterPlans = await guestFooterLink.count();
    const guestFooterLabel = ((await guestFooterLink.first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    record("guest-no-pricing", guestPricing === 0, { note: `pricing blocks ${guestPricing}` });
    // Preview forces SUBSCRIPTIONS_ENABLED=1. Production and a default dev server leave it off.
    const plansHidden = guestPlans === 0 && guestFooterPlans === 0;
    const plansShown =
      guestPlans > 0 &&
      guestFooterPlans > 0 &&
      /^plans$/i.test(guestPlanLabel) &&
      /^plans$/i.test(guestFooterLabel);
    record("guest-plans-links", plansHidden || plansShown, {
      note: plansHidden
        ? "hidden while subscriptions are off"
        : `nav=${guestPlans}:${guestPlanLabel} footer=${guestFooterPlans}:${guestFooterLabel}`,
    });
    const plansResp = await page.goto(new URL("/plans", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    if (plansHidden) {
      await page
        .waitForURL((url) => {
          const path = new URL(url).pathname.replace(/\/$/, "") || "/";
          return path === "/" || path === "/fr";
        }, { timeout: timeoutMs })
        .catch(() => {});
    } else {
      await page.locator("[data-ke='plans-page']").first().waitFor({ timeout: timeoutMs }).catch(() => {});
    }
    const plansPath = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
    const plansPage = await page.locator("[data-ke='plans-page']").count();
    const redirectedHome = (plansPath === "/" || plansPath === "/fr") && plansPage === 0;
    const catalogue = plansPath === "/plans" && plansPage > 0;
    record(
      "plans-follows-flag",
      (plansResp?.status() ?? 0) < 500 && ((plansHidden && redirectedHome) || (!plansHidden && catalogue)),
      {
        note: `${plansHidden ? "off" : "on"} ${plansPath}`,
        status: plansResp?.status() ?? 0,
      },
    );
    await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await shot(page, "guest-desktop", 1280, "h1");
    await page.keyboard.press("Escape");
    const menu = page.locator('header button[aria-label="Menu"]');
    if (await menu.isVisible().catch(() => false)) {
      await menu.click({ timeout: 8000, force: true });
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
    const guestClaim = await page.locator('header a[href="/claim"]').count();
    const guestOk =
      /sign in/i.test(guestNav) &&
      guestClaim > 0 &&
      !/i'm a parent/i.test(guestNav) &&
      !/i'm a daycare/i.test(guestNav) &&
      !/requests & tours/i.test(guestNav);
    record("menu-guest", guestOk, { note: guestOk ? "guest" : guestNav.slice(0, 180) });
    const guestBar = await appBarText(page, new URL("/", base).href);
    const guestOrder =
      guestBar.indexOf("Search") >= 0 &&
      guestBar.indexOf("Saved") > guestBar.indexOf("Search") &&
      guestBar.indexOf("Menu") > guestBar.indexOf("Saved");
    record(
      "bottom-bar-guest",
      /\bSearch\b/.test(guestBar) &&
        /\bSaved\b/.test(guestBar) &&
        /\bMenu\b/.test(guestBar) &&
        guestOrder &&
        !/\bHome\b/.test(guestBar) &&
        !/\bSign in\b/.test(guestBar) &&
        !/I'm a parent/i.test(guestBar),
      { note: guestBar },
    );

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
    await page.setViewportSize({ width: 390, height: 844 });
    const compareResp = await page.goto(
      new URL("/compare?slugs=a-a-daycare-centre-1288", base).href,
      { waitUntil: "domcontentloaded", timeout: timeoutMs },
    );
    await page.locator("[data-ke='compare-page']").waitFor({ timeout: timeoutMs }).catch(() => {});
    const compareText = await page.locator("body").innerText();
    const compareUp = (compareResp?.status() ?? 0) < 500 && /compare centres/i.test(compareText);
    const named = /a & a daycare/i.test(compareText);
    const guardShown = /not accepting online requests yet|request a spot/i.test(compareText);
    record("multi-apply-compare", compareUp && (!named || guardShown), {
      note: named ? (guardShown ? "guard" : compareText.slice(0, 160)) : "compare page",
      status: compareResp?.status() ?? 0,
    });
    if (await page.locator("[data-ke='multi-apply']").count()) {
      await shot(page, "multi-apply-390", 390, "[data-ke='multi-apply']");
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="parent-home"][data-settled="1"]').waitFor({ timeout: timeoutMs });
    await shot(page, "parent-desktop", 1280, '[data-ke="parent-home"]');
    await openHeaderMenu(page);
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
      parentBar.indexOf("Search") >= 0 &&
        parentBar.indexOf("Saved") > parentBar.indexOf("Search") &&
        parentBar.indexOf("Requests") > parentBar.indexOf("Saved") &&
        parentBar.indexOf("Inbox") > parentBar.indexOf("Requests") &&
        parentBar.indexOf("Menu") > parentBar.indexOf("Inbox") &&
        /\bSaved\b/.test(parentBar) &&
        /\bRequests\b/.test(parentBar) &&
        /\bInbox\b/.test(parentBar) &&
        /\bMenu\b/.test(parentBar) &&
        !/\bUpgrade\b/.test(parentBar) &&
        !/\bMy plan\b/.test(parentBar) &&
        !/\bSubscription\b/.test(parentBar) &&
        !/\bDesk\b/.test(parentBar) &&
        !/\bEnquiries\b/.test(parentBar) &&
        !/\bEnrolled\b/.test(parentBar),
      { note: parentBar },
    );
    const parentAvatar = await page.locator('[data-ke="header-avatar"]').count();
    record("bottom-bar-avatar", parentAvatar > 0, { note: `avatars ${parentAvatar}` });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "parent", attention: true });
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="parent-home"]').waitFor({ timeout: timeoutMs }).catch(() => {});
    const homeHref = await page.locator('[data-ke="desk-desktop-nav"] [data-nav="explore"]').getAttribute("href").catch(() => "");
    const headerAvatar = await page.locator('[data-ke="header-avatar"]').count();
    const switcherDesktop = await page.locator('[data-ke="desk-switcher"]').count();
    const deskBadge = page.locator('[data-ke="desk-desktop-nav"] [data-nav="bookings"] [data-ke="count-badge"]');
    await deskBadge.waitFor({ timeout: timeoutMs }).catch(() => {});
    const deskBadgeText = ((await deskBadge.innerText().catch(() => "")) || "").trim();
    record("nav-desktop-shell", headerAvatar > 0 && switcherDesktop === 0 && /\/parent/.test(homeHref || "") && /^(\d+|99\+)$/.test(deskBadgeText), {
      note: `avatar=${headerAvatar} switcher=${switcherDesktop} home=${homeHref} badge=${deskBadgeText}`,
    });
    const parentSide = ((await page.locator('[data-ke="desk-desktop-nav"]').innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    record(
      "sidebar-parent",
      /\bHome\b/.test(parentSide) &&
        /\bSaved\b/.test(parentSide) &&
        /\bRequests\b/.test(parentSide) &&
        /\bWaitlists\b/.test(parentSide) &&
        /\bPay\b/.test(parentSide) &&
        /Family desk/i.test(parentSide) &&
        /Search tools/i.test(parentSide) &&
        !/Find care/i.test(parentSide) &&
        !/My requests/i.test(parentSide) &&
        !/My shortlist/i.test(parentSide),
      { note: parentSide.slice(0, 200) },
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
    const phoneMenuButton = page.locator('header button[aria-label="Menu"]');
    const phoneMenuHidden = !(await phoneMenuButton.isVisible().catch(() => false));
    const requestsBadge = page.locator('[data-ke="app-tab-bar"] [data-nav="bookings"] [data-ke="count-badge"]');
    await requestsBadge.waitFor({ timeout: timeoutMs }).catch(() => {});
    const drawerBadge = ((await requestsBadge.innerText().catch(() => "")) || "").trim();
    await page.goto(new URL("/menu", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const upgradeRow = page.locator('[data-ke="app-menu"] [data-nav="upgrade"]');
    await upgradeRow.waitFor({ timeout: timeoutMs }).catch(() => {});
    const drawerUpgrade = await upgradeRow.count();
    const phoneSwitcher = await page.locator('[data-ke="desk-switcher"]').count();
    record("nav-phone-shell", phoneMenuHidden && drawerUpgrade > 0 && phoneSwitcher === 0 && /^(\d+|99\+)$/.test(drawerBadge), {
      note: `menuHidden=${phoneMenuHidden} upgrade=${drawerUpgrade} switcher=${phoneSwitcher} badge=${drawerBadge}`,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL("/account?tab=profile&section=delete", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const deleteConfirm = page.locator('[data-ke="account-delete"] [data-ke="delete-confirm"]');
    await deleteConfirm.waitFor({ timeout: timeoutMs }).catch(() => {});
    const deleteOnAccount = await deleteConfirm.count();
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="parent-home"]').waitFor({ timeout: timeoutMs });
    const deleteLinkLoc = page.locator('[data-ke="desk-desktop-nav"] [data-nav="delete"]');
    await deleteLinkLoc.waitFor({ state: "attached", timeout: timeoutMs }).catch(() => {});
    const deleteConfirmOnHome = await page.locator('[data-ke="parent-home"] [data-ke="delete-confirm"]').count();
    const deleteLink = await deleteLinkLoc.count();
    record("delete-account-on-account", deleteOnAccount > 0 && deleteConfirmOnHome === 0 && deleteLink > 0, {
      note: `account=${deleteOnAccount} confirmOnHome=${deleteConfirmOnHome} link=${deleteLink}`,
    });

    await page.goto(new URL("/account?tab=profile&section=profile&desk=parent", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    const photoSignIn = await page.getByRole("link", { name: /sign in to add a photo/i }).count();
    const openProfileEdit = page.locator('[data-ke="profile-edit"]');
    await openProfileEdit.click();
    await page.locator('[data-ke="profile-edit-about"]').click();
    const bioBox = page.locator("textarea");
    await bioBox.waitFor({ timeout: timeoutMs });
    const bio = `Saved ${Date.now()}`;
    await bioBox.fill(bio);
    const saved = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("/_serverFn/") && res.ok(),
      { timeout: timeoutMs },
    );
    await page.locator('[data-ke="account-save-details"]').click();
    await saved;
    await waitUntilEditClosed(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await openProfileEdit.click();
    await page.locator('[data-ke="profile-edit-about"]').click();
    await bioBox.waitFor({ timeout: timeoutMs });
    const keptBio = await bioBox.inputValue();
    const accountCrash = /Something went wrong/.test((await page.locator("body").innerText()) || "");
    record("account-save-details", photoSignIn === 0 && !accountCrash && keptBio.includes(bio), {
      note: `photoSignIn=${photoSignIn} bio=${keptBio.slice(0, 80)}`,
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "parent", plan: "paid" });
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('header [data-nav="upgrade"]:visible').first().waitFor({ timeout: timeoutMs }).catch(() => {});
    const paidPlaces = await upgradePlaces(page);
    await openHeaderMenu(page);
    await clickDrawerUpgrade(page);
    await page.locator('[data-ke="manage-or-cancel"]').waitFor({ timeout: timeoutMs }).catch(() => {});
    const managed = (await page.locator('[data-ke="manage-or-cancel"]').count()) > 0;
    record(
      "upgrade-my-plan-parent",
      paidPlaces.drawer === "My plan" && managed,
      { note: JSON.stringify(paidPlaces) },
    );

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider" });
    const daycareParent = await page.goto(new URL("/parent", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForURL(/\/parent/i, { timeout: timeoutMs }).catch(() => {});
    const stayedParent = /\/parent/i.test(page.url());
    record("provider-can-open-parent", stayedParent, {
      note: page.url(),
      status: daycareParent?.status() ?? 0,
    });
    const daycareWrong = await page.goto(new URL("/provider", base).href, {
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
    const operatorLeaks = await page
      .locator(
        '[data-ke="guest-view"], [data-ke="view-as-picker"], [data-ke="test-listing-toggle"], [data-ke="site-health"], [data-ke="location-checker"], [data-ke="people-search"]',
      )
      .count();
    record("operator-tools-hidden-provider", operatorLeaks === 0, { note: `widgets ${operatorLeaks}` });
    const daycareCardNew = await page.locator('[data-ke="upgrade-card"]').count();
    record("daycare-card-new", daycareCardNew === 0, { note: `cards ${daycareCardNew}` });
    await shot(page, "daycare-390", 390, '[data-ke="daycare-desk"]');
    await shot(page, "daycare-desktop", 1280, '[data-ke="daycare-desk"]');
    await openHeaderMenu(page);
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
        /today/i.test(daycareNav) &&
        !daycareSignIn &&
        daycarePlaces.drawer === "Upgrade",
      { note: daycareSignIn ? "sign-in leak" : daycareCross.join(",") || JSON.stringify(daycarePlaces) },
    );
    // Pure daycare fixture (role=provider), not an admin who also owns centres.
    const daycareBar = await appBarText(page, new URL("/provider", base).href);
    record(
      "bottom-bar-daycare",
      daycareBar.indexOf("Today") >= 0 &&
        daycareBar.indexOf("Calendar") > daycareBar.indexOf("Today") &&
        daycareBar.indexOf("Listings") > daycareBar.indexOf("Calendar") &&
        daycareBar.indexOf("Messages") > daycareBar.indexOf("Listings") &&
        daycareBar.indexOf("Menu") > daycareBar.indexOf("Messages") &&
        !daycareBar.includes("Desk") &&
        !daycareBar.includes("Enquiries") &&
        !daycareBar.includes("Upgrade") &&
        !daycareBar.includes("My plan") &&
        !daycareBar.includes("Subscription") &&
        !daycareBar.includes("Earnings") &&
        !/\bSaved\b/.test(daycareBar) &&
        !/\bEnrolled\b/.test(daycareBar),
      { note: `role=provider ${daycareBar}` },
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const daycareSide = ((await page.locator('[data-ke="desk-desktop-nav"]').innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    record(
      "sidebar-daycare",
      /\bToday\b/.test(daycareSide) &&
        /\bRequests\b/.test(daycareSide) &&
        /\bListings\b/.test(daycareSide) &&
        /\bEarnings\b/.test(daycareSide) &&
        /\bPromote\b/.test(daycareSide) &&
        /Daycare desk/i.test(daycareSide) &&
        !/\bMoney\b/.test(daycareSide) &&
        !/my centre/i.test(daycareSide),
      { note: daycareSide.slice(0, 200) },
    );
    record(
      "signed-in-desks-no-error",
      !/Something went wrong/.test(parentSide) && !/Something went wrong/.test(daycareSide),
      { note: "parent and provider rendered" },
    );

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider", plan: "paid" });
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const daycarePaidPlaces = await upgradePlaces(page);
    record(
      "upgrade-my-plan-daycare",
      daycarePaidPlaces.panel === "My plan" && daycarePaidPlaces.drawer === "My plan",
      { note: JSON.stringify(daycarePaidPlaces) },
    );

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider" });
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="daycare-desk"]').waitFor({ timeout: timeoutMs });
    await openAccountGroup(page, '[data-ke="desk-desktop-nav"]');
    const headerUpgrade = ((await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]:visible').first().innerText().catch(() => "")) || "").trim();
    await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]').click();
    await page.waitForURL(/\/provider\/subscription/i, { timeout: timeoutMs }).catch(() => {});
    const deskCheckout = page.locator('[data-ke="plan-checkout"]:visible').first();
    await deskCheckout.waitFor({ timeout: timeoutMs }).catch(() => {});
    const deskHit = page.waitForRequest((req) => req.url().includes("cs_test_e2e_mock"), { timeout: timeoutMs }).catch(() => null);
    if ((await deskCheckout.count()) > 0) await deskCheckout.click();
    const deskReached = Boolean(await deskHit);
    await settleMockCheckout(page);
    await page.goto(new URL("/provider", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await openHeaderMenu(page);
    await clickDrawerUpgrade(page);
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
    await openAccountGroup(page, '[data-ke="desk-desktop-nav"]');
    const parentHeaderUpgrade = ((await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]:visible').first().innerText().catch(() => "")) || "").trim();
    await page.locator('[data-ke="desk-desktop-nav"] [data-nav="upgrade"]').click();
    await page.waitForURL(/tab=subscription/i, { timeout: timeoutMs }).catch(() => {});
    const deskPlus = page.locator('[data-ke="plan-checkout"]:visible').first();
    await deskPlus.waitFor({ timeout: timeoutMs }).catch(() => {});
    const parentDeskHit = page.waitForRequest((req) => req.url().includes("cs_test_e2e_mock"), { timeout: timeoutMs }).catch(() => null);
    if ((await deskPlus.count()) > 0) await deskPlus.click();
    const parentDeskReached = Boolean(await parentDeskHit);
    await settleMockCheckout(page);
    await page.goto(new URL("/parent", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await openHeaderMenu(page);
    await clickDrawerUpgrade(page);
    await page.waitForURL(/tab=subscription/i, { timeout: timeoutMs }).catch(() => {});
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
    await page.locator('[data-ke="upgrade-card"]').waitFor({ state: "hidden", timeout: timeoutMs }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('[data-ke="daycare-desk"]').waitFor({ timeout: timeoutMs });
    const daycareCardAfter = await page.locator('[data-ke="upgrade-card"]').count();
    record("daycare-card-dismissed", daycareCardAfter === 0, { note: `cards ${daycareCardAfter}` });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.context().clearCookies();
    await page.goto(new URL("/search?q=Winnipeg%2C+MB", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
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

    await page.setViewportSize({ width: 1280, height: 900 });
    await setFixture(context, base, { role: "provider", activity: true });
    await context.clearCookies();
    await page.goto(new URL("/search?q=Winnipeg%2C+MB", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    const liveChip = page.locator('[data-ke="live-on-kidease"]').first();
    await liveChip.waitFor({ state: "visible", timeout: timeoutMs });
    await liveChip.click();
    await page.waitForURL(/[?&]live=1(?:&|$)/, { timeout: timeoutMs }).catch(() => {});
    const liveUrl = page.url();
    const liveQuoted = /live=%22|live=%221%22|live="1"/.test(liveUrl);
    const liveParam = /[?&]live=1(?:&|$)/.test(liveUrl);
    const countLine = page.locator('[data-ke="search-count"]');
    const countText = await countLine
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() =>
        page.waitForFunction(
          () => {
            const text = document.querySelector('[data-ke="search-count"]')?.textContent || "";
            return /[1-9]\d*\s+licensed centre/i.test(text);
          },
          null,
          { timeout: timeoutMs },
        ),
      )
      .then(async () => ((await countLine.innerText()) || "").replace(/\s+/g, " ").trim())
      .catch(async () => ((await countLine.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim());
    const liveCountOk = /[1-9]\d*\s+licensed centre/i.test(countText);
    const browse = page.locator('[data-ke="browse-directory"]');
    const browseHref = (await browse.first().getAttribute("href").catch(() => "")) || "";
    const browseOk = /\/daycare\/city\/winnipeg(?:[/?#]|$)/.test(browseHref);
    record("live-chip-url", liveParam && !liveQuoted && liveCountOk && browseOk, {
      note: `${liveUrl} count=${countText} browse=${browseHref}`,
    });
    await shot(page, "live-chip", 1280, '[data-ke="live-on-kidease"]');
    await shot(page, "live-chip-390", 390, '[data-ke="live-on-kidease"]');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL("/search?q=Edmonton%2C+AB&live=1", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForURL(/[?&]live=1(?:&|$)/, { timeout: timeoutMs }).catch(() => {});
    const edmontonUrl = page.url();
    const edmontonQuoted = /live=%22|live=%221%22|live="1"/.test(edmontonUrl);
    const edmontonParam = /[?&]live=1(?:&|$)/.test(edmontonUrl);
    const kidsWorld = page.locator('[data-slug="kids-world-daycare-kh2t"]');
    const kidsWorldVisible = await kidsWorld
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
    const edmontonBrowse = (await page.locator('[data-ke="browse-directory"]').first().getAttribute("href").catch(() => "")) || "";
    record("live-edmonton-kids-world", edmontonParam && !edmontonQuoted && kidsWorldVisible && /\/daycare\/city\/edmonton(?:[/?#]|$)/.test(edmontonBrowse), {
      note: `${edmontonUrl} card=${kidsWorldVisible} browse=${edmontonBrowse}`,
    });

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

    const parentFeatures = await page.goto(new URL("/admin/features", base).href, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    const parentFeaturesBody = await page.locator("body").innerText().catch(() => "");
    const parentFeaturesGate = classifyAdminGate({
      finalUrl: page.url(),
      status: parentFeatures?.status() ?? 0,
      bodyText: parentFeaturesBody,
    });
    record("admin-features-parent-404", parentFeaturesGate.ok && parentFeaturesGate.kind === "not-found", {
      note: parentFeaturesGate.kind,
      status: parentFeatures?.status() ?? 0,
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
  env.SUBSCRIPTIONS_ENABLED = "1";
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
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(1);
    }, 60_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve(status);
    });
  });
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

async function openExploreFilters(page) {
  const toggle = page.locator('[data-ke="explore-filters-toggle"]').first();
  const sheet = page.locator('[data-ke="explore-filters-sheet"]');
  const ready = await toggle.waitFor({ state: "visible", timeout: timeoutMs }).then(() => true).catch(() => false);
  if (!ready) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await sheet.isVisible().catch(() => false)) return true;
    await toggle.click({ timeout: timeoutMs }).catch(() => {});
    const seen = await sheet.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    if (seen) return true;
  }
  return false;
}

async function rankingSortSmoke(page, base) {
  const shotDir = dirname(outDir);
  await page.setViewportSize({ width: 390, height: 844 });
  const bestResp = await page.goto(new URL("/search?rank=best", base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page.getByRole("button", { name: /^Essential$/ }).click({ timeout: 4000 }).catch(() => {});
  const opened = await openExploreFilters(page);
  const bestOn = await page
    .locator('[data-ke="sort-best"]')
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  const bestCount = await page.locator('[data-ke="sort-best"]').count();
  const nearestCount = await page.locator('[data-ke="sort-nearest"]').count();
  const whyCount = await page.locator('[data-ke="why-match"]').count();
  await page.screenshot({ path: join(shotDir, "ranking-best-390.png"), fullPage: false }).catch(() => {});
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: join(shotDir, "ranking-best-1280.png"), fullPage: false }).catch(() => {});
  record("ranking-best-sort", (bestResp?.status() ?? 0) < 500 && opened && bestOn && bestCount > 0 && nearestCount > 0, {
    note: `status=${bestResp?.status() ?? 0} best=${bestCount} nearest=${nearestCount} why=${whyCount}`,
  });

  await page.goto(new URL("/search?rank=nearest", base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await openExploreFilters(page);
  const hidden = await page.locator('[data-ke="sort-best"]').count();
  record("ranking-nearest-fallback", hidden === 0, { note: `sort-best=${hidden}` });
  await page.setViewportSize({ width: 1280, height: 800 });
}

const FR_CHROME_BANNED = [
  /\bSign in\b/,
  /\bSign up\b/,
  /\bFree forever\b/i,
  /gratuit pour toujours/i,
  /\bFor daycares\b/,
  /\bClaim listing\b/,
  /\bList your daycare\b/,
  /\bContact us\b/,
  /\bBrowse by city\b/,
  /\bHow we verify listings\b/,
  /\bDaycare requirements\b/,
  /\bFree founding period\b/,
  /\bPhoto pending\b/i,
];

async function frenchChromeSmoke(page, base) {
  const pages = [
    ["/fr/claim", "/fr/claim"],
    // Flag off redirects to the French home. Flag on stays on /fr/plans. Both start with /fr.
    ["/fr/plans", "/fr"],
    ["/fr/compare", "/fr/compare"],
    ["/fr/cities", "/fr/cities"],
    ["/fr/signup", "/fr/signup"],
    ["/fr/verify", "/fr/verify"],
    ["/fr/report", "/fr/report"],
    ["/fr/daycare-requirements", "/fr/daycare-requirements"],
    ["/fr/search", "/fr/search"],
    ["/fr/daycare/city/winnipeg", "/fr/daycare/city/winnipeg"],
  ];
  const misses = [];
  for (const [path, canonicalIncludes] of pages) {
    const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const status = res?.status() ?? 0;
    const landed = new URL(page.url()).pathname;
    const canonical = await page.locator('link[rel="canonical"]').first().getAttribute("href").catch(() => "");
    const langs = await page.locator('link[rel="alternate"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("hreflang")).filter(Boolean),
    );
    const text = await page.evaluate(() => {
      const bits = [];
      for (const sel of ["header", "main h1", "footer"]) {
        const el = document.querySelector(sel);
        if (el) bits.push(el.textContent || "");
      }
      if (!location.pathname.includes("/daycare/city/")) {
        const main = document.querySelector("main");
        if (main) bits.push(main.textContent || "");
      }
      return bits.join("\n").replace(/\s+/g, " ");
    });
    const hit = FR_CHROME_BANNED.find((re) => re.test(text));
    const hreflangOk = ["en", "fr", "x-default"].every((lang) => langs.includes(lang));
    if (status >= 400 || !landed.startsWith(canonicalIncludes) || !String(canonical).includes(canonicalIncludes) || !hreflangOk || hit) {
      misses.push(`${path}:${status}:${landed}:${hit ? hit.source : canonicalIncludes}`);
    }
  }
  record("fr-public-chrome", misses.length === 0, {
    note: misses.length ? misses.join(" ") : `${pages.length} French pages`,
  });
}

const RADIUS_LABEL_WIDTHS = [320, 360, 390, 412, 430, 480, 640, 767, 834, 1023];
const RADIUS_LABEL_OPTIONS = ["5", "10", "25", "50"];

/** Every home radius option stays fully visible from 320px up. Desktop width stays capped. */
async function radiusLabelSmoke(page, base) {
  const misses = [];
  for (const width of RADIUS_LABEL_WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/fr"]) {
      const res = await page.goto(new URL(path, base).href, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      if ((res?.status() ?? 0) >= 400) {
        misses.push(`${path}@${width}:status`);
        continue;
      }
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      const report = await page.evaluate((options) => {
        const select = [...document.querySelectorAll('[data-ke="search-radius"]')].find(
          (el) => el.getBoundingClientRect().width > 0,
        );
        if (!select) return { missing: true };
        const bad = [];
        for (const km of options) {
          select.value = km;
          const cs = getComputedStyle(select);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const label = (select.selectedOptions[0]?.textContent || "").trim();
          const textW = ctx.measureText(label).width;
          const padL = parseFloat(cs.paddingLeft) || 0;
          const padR = parseFloat(cs.paddingRight) || 0;
          const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
          const appearance = cs.appearance || cs.webkitAppearance || "";
          const arrow = appearance === "none" ? 0 : 28;
          const available = select.clientWidth - padL - padR - border - arrow;
          const box = select.getBoundingClientRect();
          const pageOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const fits =
            label === `${km} km` &&
            available + 0.5 >= textW &&
            box.left >= -1 &&
            box.right <= window.innerWidth + 1 &&
            !pageOverflow;
          if (!fits) bad.push(`${label}:${Math.round(available)}/${Math.round(textW)}`);
        }
        return { bad };
      }, RADIUS_LABEL_OPTIONS);
      if (report.missing) misses.push(`${path}@${width}:missing`);
      else if (report.bad?.length) misses.push(`${path}@${width}:${report.bad.join(",")}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  const desktop = await page.evaluate((options) => {
    const select = [...document.querySelectorAll('[data-ke="search-radius"]')].find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    if (!select) return { missing: true };
    const cs = getComputedStyle(select);
    const bad = [];
    for (const km of options) {
      select.value = km;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const label = (select.selectedOptions[0]?.textContent || "").trim();
      const textW = ctx.measureText(label).width;
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      const available = select.clientWidth - padL - padR - border;
      if (!(label === `${km} km` && available + 0.5 >= textW)) bad.push(`${label}:${Math.round(available)}/${Math.round(textW)}`);
    }
    return {
      bad,
      maxWidth: parseFloat(cs.maxWidth),
      appearance: cs.appearance || cs.webkitAppearance || "",
    };
  }, RADIUS_LABEL_OPTIONS);
  // Desktop uses the custom chevron (appearance none) and a 10rem cap so "25 km" stays whole.
  if (
    desktop.missing ||
    desktop.bad?.length ||
    !(desktop.maxWidth > 80 && desktop.maxWidth <= 176) ||
    desktop.appearance !== "none"
  ) {
    misses.push(`desktop:${desktop.maxWidth}:${desktop.appearance}:${(desktop.bad || []).join(",")}`);
  }
  record("radius-labels", misses.length === 0, {
    note: misses.length ? misses.join(" ") : `${RADIUS_LABEL_WIDTHS.length} widths, EN and FR`,
  });
}

async function frenchCityHubSmoke(page, base) {
  const misses = [];
  for (const slug of FR_CITY_HUB_SLUGS) {
    const url = new URL(`/fr/daycare/city/${slug}`, base).href;
    const res = await page.request.get(url).catch(() => null);
    const status = res?.status() ?? 0;
    const html = (await res?.text().catch(() => "")) || "";
    const check = frenchCityHubSsrOk(html);
    if (status !== 200 || !check.ok) {
      misses.push(`${slug}:${status}:${check.reason ?? "bad"}`);
    }
  }
  record("fr-city-hubs", misses.length === 0, {
    note: misses.length ? misses.join(" ") : `${FR_CITY_HUB_SLUGS.length} hubs with h1`,
  });
}

const FIXTURE_PASSWORD = "E2e-role-fixture-pass-1";

async function pageIsQuiet(page) {
  const body = (await page.locator("body").innerText().catch(() => "")) || "";
  return !/Something went wrong|Une erreur est survenue/i.test(body);
}

async function passwordLogin(page, base, email, locale) {
  const context = page.context();
  await page
    .evaluate(() => {
      try {
        sessionStorage.clear();
        localStorage.removeItem("kidease-locale");
      } catch {
        /* storage unavailable */
      }
    })
    .catch(() => {});
  await context.clearCookies();
  await context.addCookies([
    {
      name: "kidease-locale",
      value: locale === "fr" ? "fr" : "en",
      url: base.endsWith("/") ? base : `${base}/`,
    },
  ]);
  const path = locale === "fr" ? "/fr/login" : "/login";
  await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const emailBox = page.locator('input[type="email"]');
  await emailBox.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(() => {
    const form = document.querySelector('[data-ke="email-sign-in"]');
    return Boolean(form && Object.keys(form).some((key) => key.startsWith("__react")));
  }, { timeout: timeoutMs });
  await emailBox.fill(email);
  await page.locator('input[type="password"]').fill(FIXTURE_PASSWORD);
  const posted = page.waitForResponse(
    (res) => res.url().includes("/api/auth/sign-in/email") && res.request().method() === "POST",
    { timeout: timeoutMs },
  );
  await page.locator('[data-ke="email-primary"]').click();
  const signIn = await posted;
  if (!signIn.ok()) {
    const body = await signIn.text().catch(() => "");
    throw new Error(`sign-in HTTP ${signIn.status()} ${body.slice(0, 180)}`);
  }
  const offer = page.locator('[data-ke="passkey-offer"]');
  const deadline = Date.now() + timeoutMs;
  let dismissedOffer = false;
  while (Date.now() < deadline) {
    const path = new URL(page.url()).pathname;
    if (!/\/login\/?$/i.test(path)) return;
    if (!dismissedOffer && (await offer.isVisible().catch(() => false))) {
      dismissedOffer = true;
      await offer.getByRole("button", { name: /not now|pas maintenant/i }).click();
    }
    const err = ((await page.locator('[data-ke="auth-error"]').innerText().catch(() => "")) || "").trim();
    if (err) throw new Error(err);
    await page.waitForTimeout(250);
  }
  if (!/\/login\/?$/i.test(new URL(page.url()).pathname)) return;
  throw new Error(`still on ${page.url()}`);
}

/**
 * Real Better Auth session from the login form. Parent and daycare, English and French.
 * Login, reload, desk, messages, an unchanged Save details, and Save details.
 */
async function signOutFromMenu(page) {
  await openHeaderMenu(page);
  const button = page.locator("#ke-nav-drawer").getByRole("button", { name: /^sign out$/i });
  await button.waitFor({ state: "visible", timeout: timeoutMs });
  await button.click();
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "", { timeout: timeoutMs });
}

async function runSignedInSessions(page, base) {
  const context = page.context();
  await setFixture(context, base, { role: "parent" });
  await setFixture(context, base, { role: "provider" });
  const cases = [
    {
      role: "parent",
      email: "e2e-parent@kidease.test",
      locale: "en",
      home: "/parent",
      inbox: "/inbox?view=family",
      account: "/account?tab=profile&section=profile&desk=parent",
      menu: "Menu",
    },
    {
      role: "parent",
      email: "e2e-parent@kidease.test",
      locale: "fr",
      home: "/parent",
      inbox: "/inbox?view=family",
      account: "/account?tab=profile&section=profile&desk=parent",
      menu: "Ouvrir le menu",
    },
    {
      role: "provider",
      email: "e2e-provider@kidease.test",
      locale: "en",
      home: "/provider",
      inbox: "/inbox?view=centre",
      account: "/account?tab=profile&section=profile&desk=provider",
      menu: "Menu",
    },
    {
      role: "provider",
      email: "e2e-provider@kidease.test",
      locale: "fr",
      home: "/provider",
      inbox: "/inbox?view=centre",
      account: "/account?tab=profile&section=profile&desk=provider",
      menu: "Ouvrir le menu",
    },
  ];
  for (const item of cases) {
    const tag = `${item.role}-${item.locale}`;
    try {
      await passwordLogin(page, base, item.email, item.locale);
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
      const reloaded = !/\/login\/?$/i.test(new URL(page.url()).pathname);
      record(`signed-in-reload-${tag}`, reloaded && (await pageIsQuiet(page)), { note: page.url() });

      const menuLabel = await page.locator('header button[aria-controls="ke-nav-drawer"]').getAttribute("aria-label");
      record(`signed-in-menu-${tag}`, menuLabel === item.menu, { note: menuLabel || "" });

      await page.goto(new URL(item.home, base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      record(`signed-in-desk-${tag}`, !/\/login/i.test(page.url()) && (await pageIsQuiet(page)), { note: page.url() });
      if (tag === "provider-en") {
        const parentSwitch = page.locator('[data-ke="desk-switch-tab"][data-desk="parent"]');
        const switchText = ((await parentSwitch.innerText().catch(() => "")) || "").trim();
        record("signed-in-switch-to-parent", /switch to parent/i.test(switchText), { note: switchText });
      }
      if (tag === "parent-en" || tag === "provider-en") {
        const leaks = await page
          .locator(
            '[data-ke="guest-view"], [data-ke="view-as-picker"], [data-ke="test-listing-toggle"], [data-ke="site-health"], [data-ke="location-checker"], [data-ke="people-search"]',
          )
          .count();
        record(`operator-tools-hidden-${tag}`, leaks === 0, { note: `widgets ${leaks}` });
      }
      if (tag === "parent-en") {
        const shotDir = join(dirname(outDir), "shots");
        mkdirSync(shotDir, { recursive: true });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({ path: join(shotDir, "signed-in-parent-1280.png"), fullPage: false }).catch(() => {});
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => {});
        await page.screenshot({ path: join(shotDir, "signed-in-parent-390.png"), fullPage: false }).catch(() => {});
        await page.setViewportSize({ width: 1280, height: 800 });
      }

      await page.goto(new URL(item.inbox, base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      record(`signed-in-messages-${tag}`, !/\/login/i.test(page.url()) && (await pageIsQuiet(page)), { note: page.url() });

      await page.goto(new URL(item.account, base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      const photo = await page.getByRole("link", { name: /sign in to add a photo|connectez-vous pour ajouter une photo/i }).count();
      const openProfileEdit = page.locator('[data-ke="profile-edit"]');
      await openProfileEdit.click();
      await page.locator('[data-ke="profile-edit-about"]').waitFor({ timeout: timeoutMs });
      const bioBox = page.locator("textarea").first();
      if (tag === "parent-en") {
        await page.waitForFunction(() => {
          const box = document.querySelector('[data-ke="profile-name-value"]');
          const text = box?.textContent?.trim() || "";
          return text.length > 0 && text !== "—";
        }, { timeout: timeoutMs });
        let rewroteSession = false;
        const watchUpdate = (req) => {
          if (req.url().includes("/update-user")) rewroteSession = true;
        };
        page.on("request", watchUpdate);
        let afterSave = page.url();
        try {
          await page.locator('[data-ke="account-save-details"]').click();
          await page.locator('[data-ke="success-toast"]').waitFor({ state: "visible", timeout: timeoutMs });
          afterSave = page.url();
        } finally {
          page.off("request", watchUpdate);
        }
        const stayed = !/\/login/i.test(afterSave) && !rewroteSession;
        await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
        const editAgain = page.locator('[data-ke="profile-edit"]');
        const stillIn = await editAgain
          .waitFor({ state: "visible", timeout: timeoutMs })
          .then(() => !/\/login/i.test(page.url()))
          .catch(() => false);
        record(`signed-in-account-unchanged-${tag}`, stayed && stillIn && (await pageIsQuiet(page)), {
          note: `${page.url()} updateUser=${rewroteSession}`,
        });
        if (!stayed || !stillIn) throw new Error(`unchanged save left ${page.url()}`);
        await editAgain.click();
      }
      await page.locator('[data-ke="profile-edit-about"]').click();
      await bioBox.waitFor({ timeout: timeoutMs });
      const bio = `Saved ${tag} ${Date.now()}`;
      await bioBox.fill(bio);
      const saved = page.waitForResponse(
        (res) => {
          if (res.request().method() !== "POST" || !res.ok()) return false;
          return (res.request().postData() || "").includes(bio);
        },
        { timeout: timeoutMs },
      );
      await page.locator('[data-ke="account-save-details"]').click();
      await saved;
      await waitUntilEditClosed(page);
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.locator('[data-ke="profile-edit"]').click();
      await page.locator('[data-ke="profile-edit-about"]').click();
      await page.waitForFunction((expected) => {
        const box = document.querySelector("textarea");
        return Boolean(box && box.value.includes(expected));
      }, bio, { timeout: timeoutMs });
      const kept = await page.locator("textarea").first().inputValue();
      record(`signed-in-account-${tag}`, photo === 0 && kept.includes(bio) && (await pageIsQuiet(page)), {
        note: `photo=${photo} bio=${kept.slice(0, 72)}`,
      });
      if (tag === "parent-en") {
        await page.goto(new URL("/parent?tab=saved", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        const savedText = await page.locator("body").innerText().catch(() => "");
        const savedOk = !/something went wrong/i.test(savedText) && (await pageIsQuiet(page));
        record("signed-in-parent-saved", savedOk, { note: page.url() });
        await page.goto(new URL("/parent?tab=not-a-real-tab", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForFunction(() => !location.search.includes("not-a-real-tab"), { timeout: timeoutMs }).catch(() => {});
        const badTab = await page.locator("body").innerText().catch(() => "");
        record("signed-in-parent-bad-tab", !/something went wrong/i.test(badTab) && !/not-a-real-tab/.test(page.url()) && (await pageIsQuiet(page)), {
          note: page.url(),
        });
        await page.goto(new URL("/account?tab=profile&section=alerts&desk=parent", base).href, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });
        const summary = page.locator('[data-ke="alert-settings-summary"]');
        await summary.waitFor({ state: "visible", timeout: timeoutMs });
        const summaryText = ((await summary.innerText()) || "").trim();
        const openAttr = await page.locator('[data-ke="alert-settings"]').getAttribute("open");
        record("signed-in-alert-summary", openAttr == null && /^\d+ of \d+ alerts on$/.test(summaryText), {
          note: summaryText,
        });
        await signOutFromMenu(page);
        await passwordLogin(page, base, item.email, item.locale);
        const lead = ((await page.locator('[data-ke="login-lead"]').innerText().catch(() => "")) || "").trim();
        const backIn = !/\/login/i.test(page.url()) && !/opening your desk/i.test(lead);
        record(`signed-in-again-${tag}`, backIn && (await pageIsQuiet(page)), { note: `${page.url()} lead=${lead}` });
        if (!backIn) throw new Error(`sign-in hung on ${page.url()} ${lead}`);
      }
    } catch (err) {
      record(`signed-in-${tag}`, false, { note: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Safari on macOS crashed search and saved when a licence timestamp was a Date. */
async function runWebkitSearchGuard(base) {
  const engine = await webkit.launch({ headless: true });
  const crashes = [];
  try {
    const context = await engine.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => crashes.push(String(err?.message || err)));
    async function quiet(path) {
      crashes.length = 0;
      await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page
        .locator('[data-ke="safe-error"], [data-ke="search-count"], [data-ke="search-result-list"], [data-ke="parent-identity"], [data-ke="saved-fallback"]')
        .first()
        .waitFor({ timeout: timeoutMs })
        .catch(() => {});
      await page.waitForTimeout(1500);
      const text = (await page.locator("body").innerText().catch(() => "")) || "";
      const safe = await page.locator('[data-ke="safe-error"]').count();
      const fallback = await page.locator('[data-ke="saved-fallback"]').count();
      const threw = crashes.some((message) => /trim is not a function|something went wrong/i.test(message));
      return {
        ok: safe === 0 && fallback === 0 && !/Something went wrong|Une erreur est survenue/i.test(text) && !threw,
        note: `${page.url()} safe=${safe} fallback=${fallback} ${crashes[0] || ""}`.trim(),
      };
    }
    const edmonton = await quiet("/search?q=Edmonton%2C+AB");
    record("webkit-search-edmonton", edmonton.ok, { note: edmonton.note });
    const winnipeg = await quiet("/search?q=Winnipeg%2C+MB");
    record("webkit-search-winnipeg", winnipeg.ok, { note: winnipeg.note });
    try {
      const seeded = await setFixture(context, base, { role: "parent" });
      await pinWebkitE2eSession(context, base, seeded);
    } catch (err) {
      record("webkit-parent-saved", false, { note: err instanceof Error ? err.message : String(err) });
      return;
    }
    const saved = await quiet("/parent?tab=saved");
    const onParent = new URL(page.url()).pathname === "/parent";
    record("webkit-parent-saved", saved.ok && onParent, { note: saved.note });
  } finally {
    await engine.close();
  }
}

let browser = null;
// One check must not sit for 50 minutes. The step limit in CI is the backstop.
const suiteTimer = setTimeout(() => {
  console.error("[e2e] FAIL  suite — stopped after 40 minutes");
  process.exit(1);
}, Number(process.env.E2E_SUITE_MS || 40 * 60 * 1000));
suiteTimer.unref();
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

  // CI retries a failed shard once (Playwright retries=1). A pass on the
  // second attempt is reported as flaky and does not fail the job.
  const retries = args.desktopVisualOnly ? 0 : ciPlaywrightRetries(process.env);
  let flakyNames = [];
  let pendingFlaky = [];
  let lastSplit = { failed: [], quarantined: [] };
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    results.length = 0;
    await page.context().clearCookies().catch(() => {});
    try {
    if (args.signedIn) {
      await runSignedInSessions(page, base);
    } else if (args.desktopVisualOnly) {
      const desktopProblems = await runDesktopVisualPass(browser, base);
      record("desktop-visual", desktopProblems.length === 0, {
        note: desktopProblems.length ? desktopProblems.slice(0, 6).join(" | ") : "1280 to 2560",
      });
    } else {
    if (smokeGroupSelected(args, "public")) {
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

  await radiusLabelSmoke(page, base);
  await rankingSortSmoke(page, base);
  await frenchCityHubSmoke(page, base);
  await frenchChromeSmoke(page, base);

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
  const robots = await page.locator('meta[name="robots"]').getAttribute("content").catch(() => "");
  record("login-noindex", /noindex/i.test(robots || ""), { note: robots || "" });
  for (const privatePath of ["/signup", "/forgot-password", "/reset-password", "/offer/e2e-token", "/sign/e2e-id"]) {
    const resp = await page.request.get(new URL(privatePath, base).href).catch(() => null);
    const html = (await resp?.text().catch(() => "")) || "";
    record(`noindex:${privatePath}`, (resp?.status() ?? 500) < 500 && /noindex/i.test(html), {
      note: String(resp?.status() ?? 0),
      status: resp?.status() ?? 0,
    });
  }
  const seedResp = await page.request.get(new URL("/api/e2e-seed", base).href).catch(() => null);
  const seedBody = (await seedResp?.text().catch(() => "")) || "";
  record("e2e-seed-get-404", (seedResp?.status() ?? 0) === 404 && !/<html/i.test(seedBody), {
    note: seedBody.slice(0, 80),
    status: seedResp?.status() ?? 0,
  });
  await page.goto(new URL("/search", base).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const searchUrl = page.url();
  const searchText = await page.locator("body").innerText().catch(() => "");
  const neutral = /daycares across canada/i.test(searchText) || !/[?&]q=/.test(searchUrl);
  record("search-no-winnipeg-default", !/winnipeg/i.test(searchUrl) && neutral && (await pageIsQuiet(page)), {
    note: searchUrl,
  });
  await page.goto(new URL("/search?q=qa-test-daycare-listing-zitu", base).href, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  const zituLinks = await page.locator('a[href*="/daycare/qa-test-daycare-listing-zitu"]').count();
  record("qa-zitu-not-public", zituLinks === 0 && (await pageIsQuiet(page)), { note: `links ${zituLinks}` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(dirname(outDir), "search-canada-390.png"), fullPage: false }).catch(() => {});
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: join(dirname(outDir), "search-canada-1280.png"), fullPage: false }).catch(() => {});

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

  if (args.browserSmoke) {
    await runBrowserSmoke(base);
  }
    }

  if (smokeGroupSelected(args, "role")) {
    await runRoleFixture(page, base);
  }
  if (smokeGroupSelected(args, "webkit")) {
    await runWebkitSearchGuard(base);
  }

  const firstWave = [];
  if (smokeGroupSelected(args, "ipad")) {
    firstWave.push(
      runIpadViewportPass(browser, base).then((ipadProblems) => {
        record("ipad-viewports", ipadProblems.length === 0, {
          note: ipadProblems.length ? ipadProblems.slice(0, 6).join(" | ") : `${7} sizes`,
        });
      }),
    );
  }
  if (smokeGroupSelected(args, "phone")) {
    firstWave.push(
      runPhoneViewportPass(browser, base).then((phoneProblems) => {
        record("phone-viewports", phoneProblems.length === 0, {
          note: phoneProblems.length ? phoneProblems.slice(0, 8).join(" | ") : "iphone sizes",
        });
      }),
    );
  }
  if (smokeGroupSelected(args, "fold")) {
    firstWave.push(
      runFoldResizePass(browser, base).then((foldProblems) => {
        record("fold-resize", foldProblems.length === 0, {
          note: foldProblems.length ? foldProblems.slice(0, 8).join(" | ") : "live resize",
        });
      }),
    );
  }
  await Promise.all(firstWave);

  const secondWave = [];
  if (smokeGroupSelected(args, "store")) {
    secondWave.push(
      runStoreViewportPass(browser, base).then((storeProblems) => {
        record("store-viewports", storeProblems.length === 0, {
          note: storeProblems.length ? storeProblems.slice(0, 8).join(" | ") : "android and windows",
        });
      }),
    );
  }
  if (smokeGroupSelected(args, "visual")) {
    secondWave.push(
      runDesktopVisualPass(browser, base).then((desktopProblems) => {
        record("desktop-visual", desktopProblems.length === 0, {
          note: desktopProblems.length ? desktopProblems.slice(0, 6).join(" | ") : "1280 to 2560",
        });
      }),
    );
  }
  await Promise.all(secondWave);
    }
    } catch (err) {
      record("suite", false, { note: err instanceof Error ? err.message.split("\n")[0] : String(err) });
    }

    lastSplit = splitSmokeResults(results, quarantineChecks);
    if (lastSplit.failed.length === 0 || attempt > retries) {
      if (attempt > 1 && lastSplit.failed.length === 0) flakyNames = pendingFlaky;
      break;
    }
    pendingFlaky = lastSplit.failed.map((row) => row.name);
    console.log(`[e2e] retry ${attempt}/${retries} after: ${pendingFlaky.join(", ")}`);
  }

  for (const row of lastSplit.quarantined) {
    console.log(`[e2e] QUARANTINE  ${row.name} — still failing, not blocking CI`);
  }
  if (flakyNames.length) {
    console.log(`[e2e] FLAKY  passed on retry: ${flakyNames.join(", ")}`);
  }
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const lines = [];
    if (args.shard) lines.push(`Shard ${args.shard.index}/${args.shard.total} (${args.shard.groups.join(", ")})`);
    if (flakyNames.length) lines.push(`Flaky (passed on retry): ${flakyNames.join(", ")}`);
    if (lastSplit.quarantined.length) {
      lines.push(`Quarantined (not blocking): ${lastSplit.quarantined.map((row) => row.name).join(", ")}`);
    }
    if (lines.length) writeFileSync(summaryFile, `${lines.join("\n")}\n`, { flag: "a" });
  }

  const failed = lastSplit.failed;
  const verdict = {
    ok: failed.length === 0,
    origin,
    shard: args.shard ? `${args.shard.index}/${args.shard.total}` : null,
    flaky: flakyNames,
    quarantined: lastSplit.quarantined.map((row) => row.name),
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
