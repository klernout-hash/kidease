/** Actual public-route captures. CI uploads this directory through its existing desktop artifact. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export async function captureAppStoreAvailability(browser, base, outDir) {
  const origin = new URL(base);
  // Never extend this regression to production, including manual external-URL smoke runs.
  if (!LOOPBACK.has(origin.hostname) || !["http:", "https:"].includes(origin.protocol)) {
    return { skipped: true, reason: "Public app-store captures require a loopback preview." };
  }
  mkdirSync(outDir, { recursive: true });
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const manifest = {
    kind: "Actual isolated local public routes; not production or authenticated acceptance",
    capturedAt: new Date().toISOString(),
    prHeadSha: event.pull_request?.head?.sha ?? null,
    checkoutSha: git("rev-parse", "HEAD"),
    treeSha: git("rev-parse", "HEAD^{tree}"),
    browser: browser.version(),
    sourceFiles: [
      "scripts/app-store-availability.mjs", "scripts/e2e-smoke.mjs", "src/routes/get-app.tsx",
      "src/components/store-badges.tsx", "src/components/app-store-status.tsx", "src/lib/app-stores.ts",
      "src/lib/copy-en.ts", "src/lib/copy-fr.ts", "src/styles.css", "public/look-boot.js", "public/theme-boot.js",
    ].map((path) => ({ path, sha256: hash(readFileSync(path)) })),
    network: "Only the loopback preview origin is allowed; no links or forms are activated.",
    captures: [],
  };
  try {
    for (const locale of ["en", "fr"]) for (const look of ["classic", "clean"]) {
      for (const theme of ["light", "dark"]) for (const width of [390, 1280]) {
        const height = width === 390 ? 844 : 900;
        const path = locale === "fr" ? "/fr/get-app" : "/get-app";
        const file = `${locale}-${look}-${theme}-${width}.png`;
        const row = { file, path, locale, look, theme, viewport: { width, height }, ok: false };
        manifest.captures.push(row);
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce", locale: locale === "fr" ? "fr-CA" : "en-CA" });
        try {
          await context.route("**/*", (route) => new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort());
          await context.addInitScript(({ locale, theme }) => {
            localStorage.setItem("kidease-theme", theme);
            localStorage.setItem("kidease-locale", locale);
            localStorage.setItem("kidease-analytics-consent", "denied");
          }, { locale, theme });
          const page = await context.newPage();
          const response = await page.goto(new URL(`${path}?look=${look}`, base).href, { waitUntil: "domcontentloaded", timeout: 45000 });
          row.status = response?.status() ?? 0;
          assert.equal(row.status, 200, `${file}: public route HTTP status`);
          row.url = page.url();
          assert.equal(new URL(row.url).origin, origin.origin);
          assert.equal(new URL(page.url()).pathname, path);
          await page.locator("main [data-ke='app-store-status']").waitFor({ state: "visible" });
          await page.locator("#stores").waitFor({ state: "visible" });
          await page.waitForFunction(({ theme, look }) => document.documentElement.dataset.resolvedTheme === theme && (document.documentElement.dataset.look || "classic") === look, { theme, look });
          await page.evaluate(() => document.fonts.ready);
          await page.locator("#stores").scrollIntoViewIfNeeded();
          await page.waitForFunction(() => [...document.querySelectorAll("#stores img")].every((img) => img.complete && img.naturalWidth > 0));
          const available = locale === "fr" ? "Offert maintenant" : "Available now";
          const soon = locale === "fr" ? "Bientôt offert" : "Coming soon";
          const unavailable = locale === "fr" ? "Téléchargement indisponible" : "Download unavailable";
          row.observed = await page.evaluate(({ available, soon, unavailable }) => {
            const panels = [document.querySelector("main [data-ke='app-store-status']"), document.querySelector("#stores")];
            return {
              width: innerWidth, height: innerHeight, language: document.documentElement.lang, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
              dpr: devicePixelRatio, theme: document.documentElement.dataset.resolvedTheme, look: document.documentElement.dataset.look || "classic",
              panels: panels.map((panel) => {
                const tiles = [...panel.querySelectorAll("li")];
                const huawei = tiles.find((li) => li.textContent.includes("Huawei AppGallery"));
                const pending = tiles.filter((li) => /^(App Store|Galaxy Store|Samsung Galaxy Store|Microsoft Store)/.test(li.textContent.trim()));
                return {
                  huaweiText: huawei?.textContent.trim(), available: huawei?.textContent.includes(available), soon: huawei?.textContent.includes(soon), links: huawei?.querySelectorAll("a").length,
                  pendingCount: pending.length, pendingUnlinked: pending.every((li) => li.textContent.includes(unavailable) && !li.querySelector("a")),
                  playLink: tiles.find((li) => li.textContent.includes("Google Play"))?.querySelector("a")?.getAttribute("href"),
                };
              }),
            };
          }, { available, soon, unavailable });
          const observed = row.observed;
          assert.equal(observed.width, width);
          assert.equal(observed.height, height);
          assert.equal(observed.clientWidth, width);
          assert.ok(observed.scrollWidth <= width + 1, `${file}: horizontal overflow`);
          assert.equal(observed.dpr, 1);
          assert.equal(observed.theme, theme);
          assert.equal(observed.look, look);
          for (const panel of observed.panels) {
            assert.equal(panel.available, true, `${file}: Huawei availability`);
            assert.equal(panel.soon, false, `${file}: stale Huawei label`);
            assert.equal(panel.links, 0, `${file}: unknown Huawei URL`);
            assert.equal(panel.pendingCount, 3);
            assert.equal(panel.pendingUnlinked, true, `${file}: unavailable downloads retain their status and have no link`);
            assert.equal(panel.playLink, "https://play.google.com/store/apps/details?id=ca.kidease.app");
          }
          await page.screenshot({ path: join(outDir, file), fullPage: true, animations: "disabled" });
          row.sha256 = hash(readFileSync(join(outDir, file)));
          row.ok = true;
        } catch (error) {
          row.error = String(error);
          throw error;
        } finally {
          await context.close();
        }
      }
    }
    assert.equal(manifest.captures.length, 16);
    return { skipped: false, captures: manifest.captures.length };
  } finally {
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
}
