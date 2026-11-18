import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { build } from "vite";
import { chromium } from "playwright";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cn } from "../src/lib/utils.ts";
import { canVisitDesk } from "../src/lib/desks.ts";
import { withTimeout } from "../src/lib/timeout.ts";
import {
  adminQueueProofMatches,
  createAdminQueueRequestGuard,
} from "../src/lib/admin-queue-bootstrap-state.ts";

// Explicitly scoped to authorization presentation. No financial test fixtures,
// app endpoints, database clients, or production auth modules are imported.
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "artifacts/admin-bootstrap-client");
const require = createRequire(import.meta.url);
const proof = (extra = {}) => {
  const checkedAt = Date.now();
  return {
    viewerId: "synthetic-a",
    sessionId: "session-a",
    checkedAt,
    expiresAt: checkedAt + 15_000,
    counts: { status: "ready", waiting: 7, approved: 4, declined: 2, all: 13 },
    ...extra,
  };
};
function compile(path, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(join(root, path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new vm.Script(code).runInNewContext({
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return module.exports;
}
const Link = ({ to, search, children, ...props }) =>
  createElement(
    "a",
    { ...props, href: to + (search ? `?${new URLSearchParams(search)}` : "") },
    children,
  );
function renderFixture(initial, locale = "en", overrides = {}) {
  const { Button } = compile("src/components/ui/button.tsx", { "@/lib/utils": { cn } });
  const { AdminQueueBootstrapFallback } = compile("src/components/admin-queue-bootstrap.tsx", {
    "@tanstack/react-router": { Link },
    "@/components/ui/button": { Button },
    "@/components/shell": {
      Shell: ({ children }) =>
        createElement("div", { className: "min-h-dvh w-full overflow-x-hidden" }, children),
    },
    "@/components/session-desks": {
      useSessionDesks: () => ({ ready: false, session: null, error: false }),
    },
    "@/lib/auth/client": {
      authClient: { useSession: () => ({ data: null, isPending: true, error: null }) },
    },
    "@/lib/auth/use-current-user": { useLocallySignedOut: () => false },
    "@/lib/desks": { canVisitDesk },
    "@/lib/admin-queue-bootstrap-state": { adminQueueProofMatches, createAdminQueueRequestGuard },
    "@/lib/server/admin-queue-bootstrap": {
      loadAdminQueueBootstrap: () => {
        throw new Error("SSR must not run a client request");
      },
    },
    "@/lib/timeout": { LOADER_SETTLE_MS: 80, withTimeout },
    "@/lib/use-copy": { useCopy: () => ({ locale }) },
    ...overrides,
  });
  return renderToString(createElement(AdminQueueBootstrapFallback, { initial }));
}

test("SSR renders the actual read-only count summary and preserves unavailable state in EN/FR", () => {
  for (const locale of ["en", "fr"]) {
    const html = renderFixture(proof(), locale);
    assert.match(html, /data-ke="admin-queue-bootstrap-counts"/);
    assert.match(html, />7<|>7<\//);
    assert.match(
      html,
      locale === "fr" ? /Totaux de toutes les provinces/ : /Totals across all provinces/,
    );
    assert.match(html, /href="\/admin\?tab=queue"/);
    assert.doesNotMatch(
      renderFixture(proof({ counts: { status: "unavailable" } }), locale),
      /data-ke="admin-queue-bootstrap-counts"/,
    );
  }
});

test("initial render rejects expired proofs and known auth, desk or identity denial before effects", () => {
  assert.doesNotMatch(
    renderFixture(proof({ expiresAt: Date.now() - 1 })),
    /data-ke="admin-queue-bootstrap-counts"/,
  );
  const denied = [
    {
      "@/lib/auth/client": {
        authClient: { useSession: () => ({ data: null, isPending: false, error: null }) },
      },
    },
    {
      "@/lib/auth/client": {
        authClient: {
          useSession: () => ({
            data: null,
            isPending: true,
            error: new Error("Synthetic auth failure"),
          }),
        },
      },
    },
    {
      "@/lib/auth/client": {
        authClient: {
          useSession: () => ({
            data: { user: { id: "synthetic-b" }, session: { id: "session-b" } },
            isPending: false,
            error: null,
          }),
        },
      },
    },
    { "@/lib/auth/use-current-user": { useLocallySignedOut: () => true } },
    ...[
      { session: null, ready: true, error: true },
      {
        session: { role: "parent", email: "synthetic@example.test", desks: ["parent"] },
        ready: true,
        error: false,
      },
      {
        session: {
          role: "admin",
          email: "kyle@kidease.ca",
          desks: ["admin"],
          viewAs: { userId: "synthetic-b" },
        },
        ready: true,
        error: false,
      },
    ].map((value) => ({ "@/components/session-desks": { useSessionDesks: () => value } })),
  ];
  for (const dependencies of denied)
    assert.doesNotMatch(
      renderFixture(proof(), "en", dependencies),
      /data-ke="admin-queue-bootstrap-counts"/,
    );
});

test("proof matching rejects expiry, future dates, oversized leases and either identity mismatch", () => {
  const now = Date.now();
  const p = proof({ checkedAt: now - 50, expiresAt: now + 500 });
  const id = { viewerId: p.viewerId, sessionId: p.sessionId };
  assert.equal(adminQueueProofMatches(p, id, now), true);
  for (const change of [
    { expiresAt: now },
    { checkedAt: now + 1 },
    { expiresAt: now + 20_000 },
    { checkedAt: NaN },
  ])
    assert.equal(adminQueueProofMatches({ ...p, ...change }, id, now), false);
  assert.equal(adminQueueProofMatches(p, { ...id, viewerId: "synthetic-b" }, now), false);
  assert.equal(adminQueueProofMatches(p, { ...id, sessionId: "session-b" }, now), false);
});

let browser, server, origin;
const metrics = {
  synthetic: true,
  externalRequests: [],
  pageErrors: [],
  captures: [],
  scenarios: [],
  limitations:
    "Actual fallback and shared Button with synthetic auth/desk/check dependencies and a simplified Shell/Link. No real session, app API, database, full admin page, or deployment validated.",
};
const runtimeSource = `
import React, { useSyncExternalStore } from 'react';
let state = { auth:{data:null,isPending:true,error:null}, desks:{session:null,ready:false,error:false}, locallyOut:false, locale:document.documentElement.lang };
const listeners=new Set(); const requests=[];
export function useStateSnapshot(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state,()=>state)};
export function loadAdminQueueBootstrap(){return new Promise((resolve,reject)=>requests.push({resolve,reject}))};
const valid=(viewerId='synthetic-a',sessionId='session-a')=>({auth:{data:{user:{id:viewerId},session:{id:sessionId}},isPending:false,error:null},desks:{session:{role:'admin',email:'kyle@kidease.ca',desks:['admin'],viewAs:null},ready:true,error:false}});
window.fixture={ update(patch){state={...state,...patch};listeners.forEach(fn=>fn())},ready(viewerId,sessionId){this.update(valid(viewerId,sessionId))},calls(){return requests.length},resolve(index,payload){requests[index].resolve(payload)},reject(index){requests[index].reject(new Error('Synthetic authorization denial'))},proof(extra={}){return {viewerId:'synthetic-a',sessionId:'session-a',checkedAt:Date.now(),expiresAt:Date.now()+14000,counts:{status:'ready',waiting:7,approved:4,declined:2,all:13},...extra}}};
`;
const virtual = {
  "virtual:admin-harness": `import React from 'react';import {hydrateRoot} from 'react-dom/client';import {AdminQueueBootstrapFallback} from '${join(root, "src/components/admin-queue-bootstrap.tsx")}';import 'virtual:admin-runtime';const mount=hydrateRoot(document.getElementById('root'),React.createElement(AdminQueueBootstrapFallback,{initial:window.initial}));window.fixture.unmount=()=>mount.unmount();`,
  "virtual:admin-runtime": runtimeSource,
  "virtual:admin-shell": `import React from 'react';export function Shell({children}){return React.createElement('div',{className:'min-h-dvh w-full overflow-x-hidden'},children)}`,
  "virtual:admin-router": `import React from 'react';export function Link({to,search,children,...props}){return React.createElement('a',{...props,href:to+(search?'?'+new URLSearchParams(search):'')},children)}`,
  "virtual:admin-auth": `import {useStateSnapshot} from 'virtual:admin-runtime';export const authClient={useSession:()=>useStateSnapshot().auth};`,
  "virtual:admin-desks": `import {useStateSnapshot} from 'virtual:admin-runtime';export function useSessionDesks(){return useStateSnapshot().desks}`,
  "virtual:admin-local-out": `import {useStateSnapshot} from 'virtual:admin-runtime';export function useLocallySignedOut(){return useStateSnapshot().locallyOut}`,
  "virtual:admin-copy": `import {useStateSnapshot} from 'virtual:admin-runtime';export function useCopy(){return {locale:useStateSnapshot().locale}}`,
  "virtual:admin-check": `export {loadAdminQueueBootstrap} from 'virtual:admin-runtime';`,
};
before(async () => {
  const specific = {
    "@tanstack/react-router": "virtual:admin-router",
    "@/components/shell": "virtual:admin-shell",
    "@/components/session-desks": "virtual:admin-desks",
    "@/lib/auth/client": "virtual:admin-auth",
    "@/lib/auth/use-current-user": "virtual:admin-local-out",
    "@/lib/use-copy": "virtual:admin-copy",
    "@/lib/server/admin-queue-bootstrap": "virtual:admin-check",
  };
  const result = await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: "error",
    resolve: {
      alias: [
        ...Object.entries(specific).map(([find, replacement]) => ({ find, replacement })),
        { find: "@", replacement: join(root, "src") },
      ],
    },
    plugins: [
      {
        name: "nonpayment-admin-harness",
        resolveId(id) {
          if (id in virtual) return "\0" + id;
        },
        load(id) {
          return virtual[id.slice(1)];
        },
      },
    ],
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      rollupOptions: { input: "virtual:admin-harness", output: { codeSplitting: false } },
    },
  });
  const modules = result.output
    .filter((item) => item.type === "chunk")
    .flatMap((item) => Object.keys(item.modules));
  assert.equal(
    modules.some((name) =>
      /(?:server|components)\/(?:billing|stripe|payment|admin-money|admin-payouts)|fixtures\/parent-home/.test(
        name,
      ),
    ),
    false,
    "Client harness must not load financial code or old fixtures",
  );
  const js = result.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry).code;
  const assetRoot = join(root, ".vercel/output/static/assets");
  const cssName = readdirSync(assetRoot).find((name) => /^styles-.*\.css$/.test(name));
  const css = readFileSync(join(assetRoot, cssName));
  mkdirSync(out, { recursive: true });
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/harness.js")
      return res.writeHead(200, { "content-type": "text/javascript" }).end(js);
    if (url.pathname === "/fixture.css")
      return res.writeHead(200, { "content-type": "text/css" }).end(css);
    if (
      url.pathname === "/fonts/plus-jakarta-sans-latin.woff2" ||
      url.pathname === "/fonts/plus-jakarta-sans-latin-ext.woff2"
    )
      return res
        .writeHead(200, { "content-type": "font/woff2" })
        .end(readFileSync(join(root, "public", url.pathname)));
    if (url.pathname !== "/") return res.writeHead(404).end();
    const locale = url.searchParams.get("locale") === "fr" ? "fr" : "en",
      initial = proof();
    const html = `<!doctype html><html lang="${locale}" data-look="classic"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/fixture.css"><title>Synthetic admin bootstrap</title></head><body><p style="padding:1rem">Synthetic local admin bootstrap · ${locale.toUpperCase()} · actual summary and Button</p><div id="root">${renderFixture(initial, locale)}</div><script>window.initial=${JSON.stringify(initial)}</script><script type="module" src="/harness.js"></script></body></html>`;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--disable-background-networking"],
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics, null, 2));
});
async function pageFixture(locale = "en", width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin === origin) return route.continue();
    metrics.externalRequests.push(u.origin + u.pathname);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => metrics.pageErrors.push(error.message));
  await page.goto(origin + "/?locale=" + locale);
  await page.waitForFunction(() => Boolean(window.fixture));
  return { context, page };
}
const counts = (page) => page.locator('[data-ke="admin-queue-bootstrap-counts"]');
async function authorize(page) {
  await page.evaluate(() => window.fixture.ready());
  await page.waitForFunction(() => window.fixture.calls() === 1);
  await page.evaluate(() => window.fixture.resolve(0, window.fixture.proof()));
  await counts(page).waitFor();
}

test("real React hydration withholds the SSR summary until session, desk and a fresh check all agree", async () => {
  const { context, page } = await pageFixture();
  try {
    assert.equal(await counts(page).count(), 0);
    await page.evaluate(() => window.fixture.ready());
    await page.waitForFunction(() => window.fixture.calls() === 1);
    assert.equal(await counts(page).count(), 0);
    await page.evaluate(() => window.fixture.resolve(0, window.fixture.proof()));
    await counts(page).waitFor();
    assert.match(await counts(page).innerText(), /7/);
    metrics.scenarios.push("hydration waits for fresh full check");
  } finally {
    await context.close();
  }
});

test("local signout, account/session changes and desk denial discard counts and late responses", async () => {
  for (const scenario of ["signout", "account", "session", "desk", "view-as"]) {
    const { context, page } = await pageFixture();
    try {
      await authorize(page);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(() => window.fixture.calls() === 2);
      await page.evaluate((s) => {
        if (s === "signout") window.fixture.update({ locallyOut: true });
        if (s === "account") window.fixture.ready("synthetic-b", "session-b");
        if (s === "session") window.fixture.ready("synthetic-a", "session-new");
        if (s === "desk")
          window.fixture.update({
            desks: {
              session: { role: "parent", email: "synthetic@example.test", desks: ["parent"] },
              ready: true,
              error: false,
            },
          });
        if (s === "view-as")
          window.fixture.update({
            desks: {
              session: {
                role: "admin",
                email: "kyle@kidease.ca",
                desks: ["admin"],
                viewAs: { userId: "synthetic-b" },
              },
              ready: true,
              error: false,
            },
          });
      }, scenario);
      await counts(page).waitFor({ state: "detached" });
      await page.evaluate(() =>
        window.fixture.resolve(
          1,
          window.fixture.proof({
            counts: { status: "ready", waiting: 999, approved: 0, declined: 0, all: 999 },
          }),
        ),
      );
      await page.waitForTimeout(35);
      assert.equal(await counts(page).count(), 0, scenario);
      assert.doesNotMatch(await page.locator("body").innerText(), /999/);
      metrics.scenarios.push(scenario + " rejects late result");
    } finally {
      await context.close();
    }
  }
});

test("denied rechecks, lease expiry, hidden tabs and interrupted mounts never keep stale counts", async () => {
  for (const scenario of ["denial", "expiry", "visibility", "unmount"]) {
    const { context, page } = await pageFixture();
    try {
      if (scenario === "expiry") {
        await page.evaluate(() => window.fixture.ready());
        await page.waitForFunction(() => window.fixture.calls() === 1);
        await page.evaluate(() =>
          window.fixture.resolve(0, window.fixture.proof({ expiresAt: Date.now() + 100 })),
        );
        await counts(page).waitFor();
        await counts(page).waitFor({ state: "detached" });
        await page.waitForFunction(() => window.fixture.calls() === 2);
      } else {
        await authorize(page);
        if (scenario === "visibility") {
          await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
              configurable: true,
              value: "hidden",
            });
            document.dispatchEvent(new Event("visibilitychange"));
          });
          await counts(page).waitFor({ state: "detached" });
          await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
              configurable: true,
              value: "visible",
            });
            document.dispatchEvent(new Event("visibilitychange"));
          });
          await page.waitForFunction(() => window.fixture.calls() === 2);
        } else {
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          await page.waitForFunction(() => window.fixture.calls() === 2);
          if (scenario === "unmount") {
            await page.evaluate(() => window.fixture.unmount());
            await page.evaluate(() => window.fixture.resolve(1, window.fixture.proof()));
          } else await page.evaluate(() => window.fixture.reject(1));
        }
      }
      assert.equal(await counts(page).count(), 0, scenario);
      metrics.scenarios.push(scenario + " invalidates displayed lease");
    } finally {
      await context.close();
    }
  }
});

test("synthetic EN/FR summaries fit 390/1280 with keyboard focus and 44px controls", async () => {
  for (const locale of ["en", "fr"])
    for (const width of [390, 1280]) {
      const { context, page } = await pageFixture(locale, width);
      try {
        await authorize(page);
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          controls: [...document.querySelectorAll("main a,main button")].map((el) => ({
            text: el.textContent,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          })),
        }));
        assert.equal(layout.overflow, false);
        assert.ok(layout.controls.every((c) => c.width >= 44 && c.height >= 44));
        const action = page.locator('[data-ke="admin-queue-bootstrap"] a');
        await action.focus();
        const focus = await action.evaluate((el) => {
          const s = getComputedStyle(el);
          return s.outlineStyle !== "none" || s.boxShadow !== "none";
        });
        assert.equal(focus, true);
        await page.evaluate(() => document.activeElement.blur());
        const screenshot = `admin-summary-${locale}-${width}.png`;
        await page.screenshot({ path: join(out, screenshot), fullPage: true });
        metrics.captures.push({ locale, width, ...layout, focus, screenshot });
      } finally {
        await context.close();
      }
    }
  assert.deepEqual(metrics.externalRequests, []);
  assert.deepEqual(metrics.pageErrors, []);
});
