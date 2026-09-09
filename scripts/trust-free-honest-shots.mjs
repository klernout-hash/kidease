/**
 * Acceptance screenshots for TRUST FREE HONEST: 390 + 1280, light + dark.
 * Public pages hit the local (or BASE_URL) app. Signed-in surfaces use
 * in-page fixtures with the same transactional copy.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const origin = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const outDir = process.env.SHOT_DIR || "/opt/cursor/artifacts/screenshots";
const listingPath = process.env.LISTING_PATH || "/daycare/action-centre-day-nursery-inc-1150";

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 800 },
];
const THEMES = ["light", "dark"];

function fixtureHtml(theme, title, body) {
  const bg = theme === "dark" ? "#14161c" : "#f6f3ee";
  const fg = theme === "dark" ? "#f4f1ea" : "#1c2438";
  const card = theme === "dark" ? "#1c1f28" : "#fffcf8";
  const muted = theme === "dark" ? "#a8b0c0" : "#5c6578";
  const ring = theme === "dark" ? "#2a3140" : "#e3ddd3";
  const navy = "#1a3790";
  return `<!doctype html>
<html data-theme="${theme}" data-resolved-theme="${theme}" style="color-scheme:${theme}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} · KidEase</title>
<style>
  body { margin:0; font-family:"Plus Jakarta Sans",Segoe UI,sans-serif; background:${bg}; color:${fg}; }
  .wrap { max-width:720px; margin:0 auto; padding:24px 16px 40px; }
  h1 { font-size:28px; margin:0 0 8px; }
  h2 { font-size:22px; margin:0 0 8px; }
  p { margin:0; }
  .muted { color:${muted}; font-size:14px; line-height:1.45; }
  .card { background:${card}; border:1px solid ${ring}; border-radius:16px; padding:20px; margin-top:16px; }
  .chip { display:inline-block; font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:${muted}; }
  .url { color:${navy}; word-break:break-all; font-size:14px; margin:10px 0; }
  label { display:flex; gap:12px; align-items:flex-start; margin:10px 0; font-size:14px; }
  .hint { font-size:12px; color:${muted}; margin:4px 0 0 28px; }
  .btn { display:inline-flex; align-items:center; gap:6px; border:1px solid ${ring}; background:${card}; color:${fg}; border-radius:999px; padding:10px 14px; font-size:14px; margin-right:8px; margin-top:8px; }
  .todo { margin:6px 0; font-size:14px; }
</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

const FIXTURES = {
  "claim-success": (theme) =>
    fixtureHtml(
      theme,
      "Claim success",
      `<p class="chip">Director</p>
       <h1>Your free KidEase page is live</h1>
       <p class="muted">Add this link on Google Business and Facebook so families see licence, ages, and photo. Listing and claim stay free.</p>
       <div class="card">
         <h2>Your free KidEase page</h2>
         <p class="url">https://www.kidease.ca/daycare/action-centre-day-nursery-inc-1150</p>
         <p class="muted">Share it on Instagram or a flyer too. KidEase does not auto-post to Facebook or Google Business.</p>
         <button class="btn">Copy link</button>
         <button class="btn">Directions</button>
         <button class="btn">Email this page</button>
         <p style="margin-top:12px;font-weight:600;">Listing and claim stay free.</p>
       </div>
       <div class="card">
         <h2>Public listing checklist</h2>
         <p class="muted">Parents only see facts you confirm. Never invent a fee or age.</p>
         <p class="todo">– Add ages the licence covers</p>
         <p class="todo">– Add a real storefront photo</p>
         <p class="todo">✓ Licence number on file</p>
       </div>`,
    ),
  "save-search-prefs": (theme) =>
    fixtureHtml(
      theme,
      "Save-search prefs",
      `<p class="chip">Family desk</p>
       <h1>Alert preferences</h1>
       <p class="muted">Email and in-app notices are free. SMS is optional and off until you tick CASL. Push comes in the iPhone/Android app later — www never asks for notification permission.</p>
       <div class="card">
         <label><input type="checkbox" checked/> Email me when something matches</label>
         <label><input type="checkbox" checked/> Show notices on the family desk</label>
         <p class="hint">Push alerts come in the iPhone/Android app later. This website never asks for notification permission.</p>
         <label><input type="checkbox"/> Text me (CASL). Optional. Off by default.</label>
         <p class="hint">Consent is stored. KidEase does not text until SMS is enabled and Twilio is connected on this environment.</p>
       </div>`,
    ),
  "in-app-notice": (theme) =>
    fixtureHtml(
      theme,
      "In-app notice",
      `<p class="chip">Family desk</p>
       <h1>Recent alerts</h1>
       <div class="card">
         <p class="muted">A spot may be open — confirm with the centre</p>
         <p style="font-weight:600;margin-top:6px;">A spot may be open at Action Centre Day Nursery Inc. · 2.4 km · infant. Confirm with the centre.</p>
         <p class="muted" style="margin-top:6px;">This is not a guaranteed opening. Confirm with the centre.</p>
         <button class="btn">Open</button>
       </div>
       <div class="card">
         <p class="muted">New licensed centre nearby</p>
         <p style="font-weight:600;margin-top:6px;">New licensed centre near River Heights.</p>
         <p class="muted" style="margin-top:6px;">Sunny Side Child Care · 3 km</p>
       </div>`,
    ),
};

async function waitForOrigin(url, ms = 90_000) {
  const deadline = Date.now() + ms;
  let last = "not tried";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0 && res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err?.message || err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`origin not ready: ${url} (${last})`);
}

async function shot(page, path, name) {
  await page.screenshot({ path, fullPage: true });
  console.log(`[shot] ${name}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  await waitForOrigin(origin);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });
      const page = await context.newPage();
      await page.addInitScript((pref) => {
        try {
          localStorage.setItem("kidease-theme", pref);
        } catch {
          /* ignore */
        }
      }, theme);

      await page.goto(`${origin}/search`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(800);
      const searchText = await page.locator("body").innerText();
      if (/\bUpgrade\b|\bPro \$49\b|\bParent Plus\b|\bGo Premium\b/.test(searchText)) {
        throw new Error("Pay chrome leaked on /search");
      }
      await shot(page, join(outDir, `search-${vp.name}-${theme}.png`), `search ${vp.name} ${theme}`);

      await page.goto(`${origin}${listingPath}`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(800);
      const listingText = await page.locator("body").innerText();
      if (/\bPro \$49\b|\b\$7\.99\b/.test(listingText)) {
        throw new Error("Plan prices leaked on listing");
      }
      await shot(page, join(outDir, `listing-${vp.name}-${theme}.png`), `listing ${vp.name} ${theme}`);

      for (const [key, html] of Object.entries(FIXTURES)) {
        await page.setContent(html(theme), { waitUntil: "domcontentloaded" });
        await shot(page, join(outDir, `${key}-${vp.name}-${theme}.png`), `${key} ${vp.name} ${theme}`);
      }
      await context.close();
    }
  }

  await browser.close();
  console.log(JSON.stringify({ ok: true, outDir, origin }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
