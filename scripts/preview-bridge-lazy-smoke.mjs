#!/usr/bin/env node
/** Loopback-only browser proof of the actual built bridge and strict script CSP. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { localAuditUrl } from "./polish-coverage.mjs";

const base = new URL(localAuditUrl(process.argv[2] || "http://127.0.0.1:8081"));
const out = resolve(process.argv[3] || "artifacts/performance-polish/preview-bridge-lazy");
const inside = relative(process.cwd(), out);
if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error("Evidence must stay inside this checkout.");
mkdirSync(out, { recursive: true });
const report = {
  ok: false, base: base.origin, servedRevision: process.env.POLISH_SERVED_REVISION || null,
  methodology: {
    externalRequests: "blocked", writes: "blocked", healthAndStatus: "blocked",
    physicalDevice: false, engine: "Chromium headless", network: "unthrottled functional proof",
    screenshotReadiness: "Hydrated header/bridge ready only; home listing data may still be pending. These are functional evidence, not settled-page layout captures.",
    framePolicy: "Only the child fixture response replaces frame-ancestors none with self; actual script-src and nonces remain unchanged.",
    cspProof: "No Function proxy is used in the browser. Actual securitypolicyviolation events are recorded during hydration and framed schema construction/hello parsing.",
  }, rows: [],
};
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});

async function ready(page) {
  const button = page.locator('button[aria-controls="ke-nav-drawer"]').first();
  await button.waitFor({ state: "visible" });
  await page.waitForFunction((element) => {
    const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
    return Boolean(key && typeof element[key]?.onClick === "function");
  }, await button.elementHandle(), { timeout: 30_000 });
}

try {
  for (const framed of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      window.__bridgeProof = { messages: [], violations: [] };
      window.addEventListener("message", (event) => {
        if (event.data?.channel === "grok-preview-bridge") window.__bridgeProof.messages.push(event.data);
      });
      window.addEventListener("securitypolicyviolation", (event) => {
        window.__bridgeProof.violations.push({ directive: event.violatedDirective, blocked: event.blockedURI });
      });
    });
    const requests = [];
    let scriptCsp = null;
    context.on("request", (request) => {
      if (request.resourceType() === "script") requests.push(new URL(request.url()).pathname);
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if ((["http:", "https:"].includes(url.protocol) && url.origin !== base.origin) ||
          !["GET", "HEAD"].includes(request.method()) ||
          /^\/(?:api\/health|(?:fr\/)?status)(?:\/|$)/.test(url.pathname)) return route.abort();
      if (url.pathname === "/__preview-bridge-proof-parent") {
        return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><title>Local bridge fixture</title><iframe title="KidEase preview" width="1200" height="800" src="${base.origin}/?look=classic"></iframe>` });
      }
      if (request.isNavigationRequest() && url.pathname === "/") {
        const response = await route.fetch();
        const headers = response.headers();
        const csp = headers["content-security-policy"] || "";
        assert.match(csp, /script-src/);
        assert.ok(!csp.includes("'unsafe-eval'"), "actual child script CSP must block eval");
        scriptCsp = csp.match(/script-src[^;]+/)?.[0].replace(/'nonce-[^']+'/g, "'nonce-[redacted]'") || null;
        if (framed) {
          headers["content-security-policy"] = csp.replace(/frame-ancestors[^;]+/, "frame-ancestors 'self'");
          delete headers["x-frame-options"];
        }
        report.servedRevision ??= headers["x-polish-source-sha"] || headers["x-source-revision"] || null;
        return route.fulfill({ response, headers });
      }
      return route.continue();
    });
    const page = await context.newPage();
    try {
      await page.goto(new URL(framed ? "/__preview-bridge-proof-parent" : "/?look=classic", base).href, { waitUntil: "domcontentloaded" });
      const child = framed ? page.frames().find((frame) => frame.parentFrame()) : page.mainFrame();
      assert.ok(child, "actual app frame exists");
      await ready(child);
      if (framed) {
        await page.waitForFunction(() => window.__bridgeProof.messages.some((message) => message.type === "ready"), null, { timeout: 30_000 });
        const before = await page.evaluate(() => window.__bridgeProof.messages.filter((message) => message.type === "ready").length);
        await page.evaluate(() => document.querySelector("iframe").contentWindow.postMessage({ channel: "grok-preview-bridge", version: 1, type: "hello" }, location.origin));
        await page.waitForFunction((count) => window.__bridgeProof.messages.filter((message) => message.type === "ready").length > count, before);
        await page.evaluate(() => document.querySelector("iframe").contentWindow.postMessage({ channel: "grok-preview-bridge", version: 1, type: "navigate", path: "/?look=classic&change=1" }, location.origin));
        await child.waitForFunction(() => location.search.includes("change=1"));
      }
      const state = await child.evaluate(() => ({ path: location.pathname + location.search, ...window.__bridgeProof }));
      assert.deepEqual(state.violations.filter((row) => /script-src|unsafe-eval/.test(row.directive)), []);
      const bridgeRequests = requests.filter((path) => /\/preview-host-bridge-[^/]+\.js$/.test(path));
      assert.equal(bridgeRequests.length, framed ? 1 : 0);
      const parentMessages = framed ? await page.evaluate(() => window.__bridgeProof.messages) : [];
      if (framed) assert.ok(parentMessages.some((message) => message.type === "routes" && message.paths.includes("/search")));
      const row = { framed, scriptCsp, bridgeRequests, scriptRequests: [...new Set(requests)], state, parentMessages, cspEvalViolations: 0 };
      report.rows.push(row);
      await page.screenshot({ path: resolve(out, framed ? "framed-bridge-ready.png" : "top-level-handler-ready.png"), fullPage: false });
    } finally {
      await context.close();
    }
  }
  report.ok = true;
} catch (error) {
  report.error = String(error?.stack || error);
  throw error;
} finally {
  await browser.close();
  writeFileSync(resolve(out, "preview-bridge-proof.json"), JSON.stringify(report, null, 2) + "\n");
}
