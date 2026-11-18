#!/usr/bin/env node
/** Synthetic public-form QA. No credentials, database, Turnstile service, or messages. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { en } from "../src/lib/copy-en.ts";
import { fr } from "../src/lib/copy-fr.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts/a11y-en-fr/public-form");
const fixture = join(artifacts, "fixture");
const virtual = {
  "@/components/shell": "export function Shell({children}){return children;}",
  "@/components/building-photo": "export function FeelBanner(){return null;}",
  "@/lib/server/turnstile":
    "export async function getTurnstileSiteKey(){return 'synthetic-site-key';}",
  "@/lib/server/notify": `export async function submitPublicMessage(){
    window.__publicFormQa.rejectedSubmissions++;
    throw new Error('Synthetic Turnstile rejection; no message sent');
  }`,
  "@/lib/success-confirm":
    "export function confirmAction(){throw new Error('Unexpected successful send');}",
  "@/lib/page-seo":
    "export const MARKETING_PAGE_SEO={contact:{}};export function pageSeoHead(){return {};}",
  "@/lib/use-copy": `
    import {tx,installFrenchCopy} from ${JSON.stringify(join(root, "src/lib/copy-runtime.ts"))};
    import {fr} from ${JSON.stringify(join(root, "src/lib/copy-fr.ts"))};
    installFrenchCopy(fr);
    export function useCopy(){const locale=document.documentElement.lang==='fr'?'fr':'en';return {locale,t:key=>tx(locale,key)};}
  `,
  sonner: "export const toast={error(){}};",
  "@tanstack/react-router": `
    import {createElement} from 'react';
    export const createFileRoute=()=>options=>options;
    export function useSearch(){return {};}
    export function Link({to,children,hash,...props}){return createElement('a',{...props,href:to+(hash?'#'+hash:'')},children);}
  `,
};

function syntheticEdges() {
  return {
    name: "public-form-synthetic-edges",
    enforce: "pre",
    resolveId(id) {
      const key = Object.keys(virtual).find(
        (name) =>
          name === id ||
          (name.startsWith("@/") &&
            ["", ".ts", ".tsx"].some((ext) => join(root, "src", name.slice(2)) + ext === id)),
      );
      if (key) return `\0public-form-qa:${key}`;
      if (id.startsWith("@/lib/server/") || id.includes("/src/lib/server/")) {
        throw new Error(`Unexpected server dependency in synthetic form QA: ${id}`);
      }
    },
    load(id) {
      const prefix = "\0public-form-qa:";
      if (id.startsWith(prefix)) return virtual[id.slice(prefix.length)];
    },
  };
}

let server;
let browser;
const results = [];
try {
  await mkdir(fixture, { recursive: true });
  await writeFile(
    join(fixture, "index.html"),
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>`,
  );
  await writeFile(
    join(fixture, "entry.tsx"),
    `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {Contact} from ${JSON.stringify(join(root, "src/routes/contact.tsx"))};
    import './fixture.css';
    document.documentElement.lang=new URLSearchParams(location.search).get('locale')==='fr'?'fr':'en';
    document.documentElement.style.setProperty('--ke-text-scale',new URLSearchParams(location.search).get('scale')||'1');
    createRoot(document.getElementById('root')!).render(<Contact/>);
  `,
  );
  await writeFile(
    join(fixture, "fixture.css"),
    `@import ${JSON.stringify(join(root, "src/styles.css"))};\n@source ${JSON.stringify(join(root, "src/routes/contact.tsx"))};\n@source ${JSON.stringify(join(root, "src/components/turnstile-field.tsx"))};\n@source ${JSON.stringify(join(root, "src/components/ui/button.tsx"))};`,
  );
  server = await createServer({
    configFile: false,
    envDir: false,
    root: fixture,
    cacheDir: join(fixture, ".vite-cache"),
    publicDir: join(root, "public"),
    resolve: { alias: { "@": join(root, "src") } },
    plugins: [syntheticEdges(), react(), tailwindcss()],
    server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root] } },
    optimizeDeps: {
      noDiscovery: true,
      include: [
        "react",
        "react-dom/client",
        "react/jsx-runtime",
        "@radix-ui/react-slot",
        "lucide-react",
        "clsx",
        "tailwind-merge",
        "class-variance-authority",
      ],
    },
    logLevel: "warn",
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const chromePath =
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });

  for (const locale of ["en", "fr"]) {
    const pack = locale === "fr" ? fr : en;
    for (const width of [390, 1280]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        serviceWorkers: "block",
      });
      const networkMutations = [];
      const pageErrors = [];
      await context.route("**/*", (route) => {
        const request = route.request();
        if (request.method() !== "GET") {
          networkMutations.push(`${request.method()} ${request.url()}`);
          return route.abort("blockedbyclient");
        }
        if (!request.url().startsWith(`${origin}/`) && !request.url().startsWith("data:"))
          return route.abort("blockedbyclient");
        return route.continue();
      });
      await context.addInitScript(() => {
        window.__publicFormQa = { rejectedSubmissions: 0 };
        if (new URLSearchParams(location.search).has("load-failure")) return;
        window.turnstile = {
          render(element, options) {
            window.__publicFormQa.options = options;
            element.textContent = "Synthetic security check";
            return "synthetic-widget";
          },
          reset() {},
          remove() {},
        };
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${origin}/?locale=${locale}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean(window.__publicFormQa.options));
      await page.getByLabel(pack.name, { exact: true }).fill("Synthetic QA");
      await page.getByLabel(pack.email, { exact: true }).fill("synthetic@example.invalid");
      await page
        .getByLabel(pack.messageLabel, { exact: true })
        .fill("Synthetic accessibility check; no message sent.");
      await page.getByRole("button", { name: pack.submit, exact: true }).click();
      assert.equal(
        await page.locator("[data-ke=contact-error]").innerText(),
        pack.turnstileRequired,
      );
      assert.equal(
        await page.evaluate(() => window.__publicFormQa.rejectedSubmissions),
        0,
        "Missing challenge must stop before any submission",
      );

      for (const [callback, key] of [
        ["expired-callback", "turnstileExpired"],
        ["error-callback", "turnstileFailed"],
        ["timeout-callback", "turnstileExpired"],
      ]) {
        await page.evaluate((name) => window.__publicFormQa.options[name](), callback);
        const alert = page.locator("[data-ke=turnstile]").getByRole("alert");
        await alert.waitFor();
        assert.equal(await alert.innerText(), pack[key]);
        await page.evaluate(() =>
          window.__publicFormQa.options.callback("synthetic-cleared-token"),
        );
        await alert.waitFor({ state: "detached" });
      }
      // The only submit handler is a local rejecting stub. No message service is loaded.
      await page.getByRole("button", { name: pack.submit, exact: true }).click();
      await page.waitForFunction(() => window.__publicFormQa.rejectedSubmissions === 2);
      assert.equal(
        await page.locator("[data-ke=contact-error]").innerText(),
        pack.turnstileRequired,
      );
      await page.locator("[data-ke=contact-error]").scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(artifacts, `contact-${locale}-${width}.png`) });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      // Repeat in the same tab at 200% root text sizing and a fresh widget lifecycle.
      await page.goto(`${origin}/?locale=${locale}&scale=2&load-failure=1`, {
        waitUntil: "networkidle",
      });
      const failed = page.locator("[data-ke=turnstile]").getByRole("alert");
      await failed.waitFor();
      assert.equal(await failed.innerText(), pack.turnstileLoadFailed);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      assert.equal(await page.evaluate(() => window.__publicFormQa.rejectedSubmissions), 0);
      assert.deepEqual(
        networkMutations,
        [],
        "No browser POST or other network mutation is allowed",
      );
      assert.deepEqual(pageErrors, []);
      results.push({
        locale,
        width,
        requiredError: true,
        callbacks: ["expired", "failed", "timeout"],
        clearedAfterSuccess: true,
        localRejectedSubmissions: 2,
        loadFailureAlertAt200Percent: true,
        networkMutations: 0,
      });
      await context.close();
    }
  }
  await writeFile(join(artifacts, "results.json"), JSON.stringify({ ok: true, results }, null, 2));
  console.log(JSON.stringify({ ok: true, results, artifacts }, null, 2));
} finally {
  await browser?.close();
  await server?.close();
  await rm(fixture, { recursive: true, force: true });
}
