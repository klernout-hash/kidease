/**
 * Axe on the key pages, English and French.
 * Fails on serious and critical violations only.
 *
 *   node scripts/a11y-axe.mjs --start-preview
 *   BASE_URL=http://127.0.0.1:8081 node scripts/a11y-axe.mjs
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { AXE_PAGES, blockingViolations, listingPathFromHref } from "./a11y-axe-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const startPreview = process.argv.includes("--start-preview");
const origin = (process.env.BASE_URL || "http://127.0.0.1:8081").replace(/\/$/, "");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function originReady(url) {
  const deadline = Date.now() + Number(process.env.E2E_PREVIEW_WAIT_MS || 90000);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      /* preview still booting */
    }
    await wait(500);
  }
  throw new Error(`Preview did not answer ${url}`);
}

function bootPreview() {
  const env = { ...process.env };
  if (!String(env.DATABASE_URL || "").trim()) delete env.VERCEL;
  const child = spawn("npm", ["run", "preview"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env,
    detached: true,
  });
  child.stdout.on("data", (buf) => process.stdout.write(buf));
  child.stderr.on("data", (buf) => process.stderr.write(buf));
  return child;
}

function stopPreview(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function scan(page, id, path) {
  const url = new URL(path, origin).href;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  const status = response?.status() ?? 0;
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = blockingViolations(results.violations);
  return {
    id,
    path,
    status,
    blocking: blocking.map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      nodes: (item.nodes || []).slice(0, 3).map((node) => node.target?.join(" ") || ""),
    })),
  };
}

async function firstListing(page, searchPath) {
  await page.goto(new URL(searchPath, origin).href, { waitUntil: "domcontentloaded", timeout: 45000 });
  const hrefs = await page.locator('a[href*="/daycare/"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("href") || ""),
  );
  return hrefs.map(listingPathFromHref).find(Boolean) || null;
}

async function main() {
  let preview = null;
  if (startPreview) {
    preview = bootPreview();
    await originReady(`${origin}/`);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const reports = [];
  try {
    for (const item of AXE_PAGES) reports.push(await scan(page, item.id, item.path));
    const listing = await firstListing(page, "/search");
    const listingFr = await firstListing(page, "/fr/search");
    if (listing) reports.push(await scan(page, "listing", listing));
    else reports.push({ id: "listing", path: "/search", status: 0, blocking: [{ id: "missing-listing", impact: "critical", help: "Search did not link to a listing.", nodes: [] }] });
    if (listingFr) reports.push(await scan(page, "listing-fr", listingFr));
    else reports.push({ id: "listing-fr", path: "/fr/search", status: 0, blocking: [{ id: "missing-listing", impact: "critical", help: "French search did not link to a listing.", nodes: [] }] });
  } finally {
    await browser.close();
    stopPreview(preview);
  }
  const failed = reports.filter((item) => item.blocking.length > 0);
  console.log(JSON.stringify({ ok: failed.length === 0, pages: reports.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
