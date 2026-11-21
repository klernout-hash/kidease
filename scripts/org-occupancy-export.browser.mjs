import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { gapCopy } from "../src/lib/gap-features.ts";
import { orgCopy } from "../src/lib/org-occupancy-copy.ts";
import { orgOccupancyCsv } from "../src/lib/org-occupancy-csv.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "artifacts/org-occupancy-export");
const fixture = join(out, "fixture");
const entry = join(fixture, "entry.tsx");
const sourceFiles = [
  "src/components/org-occupancy-desk.tsx",
  "src/components/ui/button.tsx",
  "src/components/empty-state.tsx",
  "src/lib/org-occupancy-copy.ts",
  "src/lib/org-occupancy-csv.ts",
  "src/lib/gap-features.ts",
  "src/lib/gov/filtered-export.ts",
  "src/lib/utils.ts",
  "src/lib/html-text.ts",
  "src/lib/languages.ts",
];
const allowedSources = new Set(sourceFiles.map((file) => join(root, file)));
const report = {
  enabled: true,
  sites: [
    {
      id: "synthetic-centre-2",
      name: 'Synthetic "Maple", North',
      city: "Winnipeg",
      province: "MB",
      licensedCapacity: 20,
      enrolled: 0,
      openSpots: 0,
      requests: 0,
      staff: 2,
      occupancyPercent: 0,
      note: "ready",
    },
    {
      id: "synthetic-centre-1",
      name: "Synthetic Cedar",
      city: "Montréal",
      province: "QC",
      licensedCapacity: null,
      enrolled: null,
      openSpots: null,
      requests: null,
      staff: null,
      occupancyPercent: null,
      note: "capacity-missing",
    },
  ],
  totals: {
    sites: 2,
    ready: 1,
    capacity: 999,
    enrolled: 888,
    occupancyPercent: 12.5,
    requests: 17,
    staff: 5,
    openSpots: 4,
  },
};
const virtual = {
  "@/components/ece-job-desk": "export function EceJobDesk(){return null;}",
  "@/lib/use-copy":
    "export function useCopy(){return {locale:window.__orgCsvFixture.locale,t:key=>key};}",
  "@/lib/server/org-occupancy": `
    export function listOrgOccupancy(){
      const fixture=window.__orgCsvFixture;fixture.loads++;
      if(fixture.state==='loading')return new Promise(()=>{});
      if(fixture.state==='off')return Promise.resolve({...fixture.report,enabled:false});
      if(fixture.state==='empty')return Promise.resolve({...fixture.report,sites:[]});
      return Promise.resolve(fixture.report);
    }
    export function setOrgCentre(){window.__orgCsvFixture.centreChanges++;throw new Error('Not part of downloading the report');}
  `,
  "@tanstack/react-router":
    "import{createElement}from'react';export function Link({to,search,children,...props}){return createElement('a',{...props,href:to},children);}",
};

function compiledCssPath() {
  const directories = [
    ".vercel/output/static/assets",
    ".output/public/assets",
    "dist/client/assets",
  ].map((path) => join(root, path));
  if (process.env.ORG_OCCUPANCY_CSS_FILE) {
    const path = realpathSync(resolve(process.env.ORG_OCCUPANCY_CSS_FILE));
    assert(
      directories.some((directory) => path.startsWith(directory + sep)) && path.endsWith(".css"),
      "Use compiled CSS from this checkout's build assets",
    );
    return path;
  }
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    const file = readdirSync(directory).find((name) =>
      /^(?:styles|index|main|__root__|globals).*\.css$/.test(name),
    );
    if (file) return join(directory, file);
  }
  throw new Error("Build this checkout first, then run the occupancy browser check");
}

test(
  "actual loaded occupancy view downloads its seven columns in EN/FR at390/1280",
  { timeout: 90_000 },
  async () => {
    await mkdir(fixture, { recursive: true });
    let browser;
    const results = [];
    try {
      const cssFile = compiledCssPath();
      const cssBytes = readFileSync(cssFile);
      await writeFile(
        entry,
        `import React from 'react';import{createRoot}from'react-dom/client';import{OrgOccupancyDesk}from${JSON.stringify(join(root, "src/components/org-occupancy-desk.tsx"))};createRoot(document.getElementById('root')).render(<OrgOccupancyDesk/>);`,
      );
      // Bundle only the actual report UI and pure helpers. No app server or RPC is started.
      const built = await build({
        configFile: false,
        envDir: false,
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        root: fixture,
        publicDir: false,
        logLevel: "error",
        resolve: { alias: { "@": join(root, "src") } },
        plugins: [
          {
            name: "synthetic-occupancy-view",
            enforce: "pre",
            resolveId(id) {
              const key = id.startsWith(join(root, "src") + sep)
                ? `@/${relative(join(root, "src"), id)}`
                : id;
              return Object.hasOwn(virtual, key) ? `\0org-csv:${key}` : null;
            },
            load(id) {
              if (id.startsWith("\0org-csv:")) return virtual[id.slice(9)];
              const file = id.split("?")[0];
              if (
                file.startsWith(join(root, "src") + "/") &&
                file !== join(root, "src/styles.css") &&
                !allowedSources.has(file)
              )
                throw new Error("Unexpected occupancy fixture source");
              return null;
            },
          },
          react(),
        ],
        build: {
          write: false,
          minify: false,
          sourcemap: false,
          lib: { entry, formats: ["iife"], name: "OrgCsvFixture" },
        },
      });
      const output = (Array.isArray(built) ? built : [built]).flatMap((result) => result.output);
      const script = output
        .filter((file) => file.type === "chunk")
        .map((file) => file.code)
        .join("\n");
      let css = cssBytes.toString("utf8");
      assert(script.length > 0 && css.length > 0);
      assert.doesNotMatch(script, /process\.env\.NODE_ENV/, "The static browser fixture must resolve its production runtime");
      css = css.replace(
        /url\((['"]?)(\/fonts\/[^)'"\s]+)\1\)/g,
        (_, _quote, font) =>
          `url(data:font/woff2;base64,${readFileSync(join(root, "public", font)).toString("base64")})`,
      );
      const chrome =
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      browser = await chromium.launch({
        headless: true,
        ...(existsSync(chrome) ? { executablePath: chrome } : {}),
        args: ["--disable-background-networking"],
      });

      async function pageFor(locale, width, state = "ready") {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          acceptDownloads: true,
          serviceWorkers: "block",
        });
        const requests = [];
        await context.route("**/*", (route) => {
          requests.push(route.request().url());
          return route.abort("blockedbyclient");
        });
        await context.routeWebSocket("**/*", (socket) => socket.close());
        const page = await context.newPage();
        await page.setContent(
          `<!doctype html><html lang="${locale}" data-look="clean" data-resolved-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main style="padding:1rem;max-width:70rem;margin:auto"><div id="root"></div></main></body></html>`,
        );
        await page.evaluate(
          ({ locale, state, report }) => {
            window.__orgCsvFixture = {
              locale,
              state,
              report,
              loads: 0,
              centreChanges: 0,
              revoked: 0,
            };
            const revoke = URL.revokeObjectURL.bind(URL);
            URL.revokeObjectURL = (url) => {
              window.__orgCsvFixture.revoked++;
              revoke(url);
            };
          },
          { locale, state, report },
        );
        await page.addScriptTag({ content: script });
        await page.waitForFunction(() => window.__orgCsvFixture.loads === 1);
        return { context, page, requests };
      }

      for (const locale of ["en", "fr"])
        for (const width of [390, 1280]) {
          const { context, page, requests } = await pageFor(locale, width);
          try {
            const copy = orgCopy(locale);
            const gap = gapCopy(locale);
            const button = page.getByRole("button", { name: copy.downloadCsv, exact: true });
            await button.waitFor();
            await page.evaluate(() => document.fonts.ready);
            const bounds = await button.boundingBox();
            assert(bounds && bounds.width >= 44 && bounds.height >= 44);
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
              false,
            );
            const headers = await page.locator("thead th").allTextContents();
            assert.deepEqual(headers, [
              copy.centre,
              copy.capacity,
              copy.enrolled,
              copy.openSpots,
              gap.orgRequests,
              gap.orgStaff,
              copy.occupancy,
            ]);
            const names = await page
              .locator("tbody tr td:first-child > p:first-child")
              .allTextContents();
            assert.deepEqual(
              names,
              report.sites.map((site) => site.name),
            );
            const summary = await page.locator("section > div.flex > p").innerText();
            assert.equal(summary, `${copy.total}: 1 ${copy.readyOf} 2. ${copy.occupancy} 12.5%`);
            const providedTotals = await page.locator("section > p").innerText();
            assert.equal(
              providedTotals,
              `${gap.orgRequests}: 17 · ${gap.orgStaff}: 5 · ${gap.orgSpots}: 4`,
            );
            await page.keyboard.press("Tab");
            assert(await button.evaluate((element) => document.activeElement === element));
            const focus = await button.evaluate((element) => ({
              outline: getComputedStyle(element).outlineStyle,
              shadow: getComputedStyle(element).boxShadow,
            }));
            assert(focus.outline !== "none" || focus.shadow !== "none");
            const [download] = await Promise.all([
              page.waitForEvent("download"),
              page.keyboard.press("Enter"),
            ]);
            assert.equal(download.suggestedFilename(), "kidease-centre-occupancy.csv");
            const stream = await download.createReadStream();
            const parts = [];
            for await (const part of stream) parts.push(part);
            const csv = Buffer.concat(parts).toString("utf8");
            assert.equal(csv, orgOccupancyCsv(report, locale));
            await writeFile(join(out, `occupancy-${locale}-${width}.csv`), csv);
            await page.waitForFunction(() => window.__orgCsvFixture.revoked === 1);
            assert.deepEqual(
              await page.evaluate(() => ({
                loads: window.__orgCsvFixture.loads,
                centreChanges: window.__orgCsvFixture.centreChanges,
              })),
              { loads: 1, centreChanges: 0 },
            );
            assert.deepEqual(requests, []);
            await page.screenshot({
              path: join(out, `occupancy-${locale}-${width}.png`),
              fullPage: true,
            });
            results.push({
              locale,
              width,
              state: "ready",
              download: "PASS",
              bounds,
              focus,
              headers,
              names,
              summary,
              providedTotals,
              requests: requests.length,
            });
          } finally {
            await context.close();
          }
        }
      for (const state of ["loading", "off", "empty"]) {
        const { context, page, requests } = await pageFor("en", 390, state);
        try {
          if (state === "off")
            await page.getByText(orgCopy("en").offTitle, { exact: true }).waitFor();
          if (state === "empty")
            await page.getByText(orgCopy("en").empty, { exact: true }).waitFor();
          assert.equal(
            await page
              .getByRole("button", { name: orgCopy("en").downloadCsv, exact: true })
              .count(),
            0,
          );
          assert.deepEqual(requests, []);
          results.push({ state, noDownload: "PASS" });
        } finally {
          await context.close();
        }
      }
      await writeFile(
        join(out, "results.json"),
        JSON.stringify(
          {
            result: "PASS",
            component: "actual OrgOccupancyDesk and Button",
            scope: "synthetic aggregate report; built application CSS; no app server/API/records",
            css: {
              path: relative(root, cssFile),
              sha256: createHash("sha256").update(cssBytes).digest("hex"),
            },
            results,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await browser?.close();
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
