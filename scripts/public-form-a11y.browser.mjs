#!/usr/bin/env node
/** Synthetic public-form QA. No credentials, database, Turnstile service, or messages. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import ts from "typescript";
import { readStaticCopy, readStaticCopyProvenance, readSupportEmail } from "./fixtures/a11y-static-copy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts/a11y-en-fr/public-form");
const fixture = join(artifacts, "fixture");
const fixtureEntry = join(fixture, "entry.tsx");
const fixtureFiles = new Set([fixtureEntry, join(fixture, "index.html")]);
const copyKeys = [
  "name", "email", "messageLabel", "submit", "contact", "contactTitle", "contactIntro",
  "parentContactTitle", "parentContactIntro", "roleParentTitle", "daycareEnrollLead", "heroClaimListing",
  "contactSubject", "subjectCare", "subjectGeneral", "subjectListing", "subjectTech", "subjectPartner", "subjectOther",
  "contactSent", "contactSendFailed", "contactDirect", "contactResponse", "contactLocation", "contactPrivacy",
  "turnstileRequired", "turnstileExpired", "turnstileFailed", "turnstileLoadFailed",
];
const packs = readStaticCopy(root, copyKeys);
const { en, fr } = packs;
const supportEmail = readSupportEmail(root);
const sourceFiles = [
  "src/routes/contact.tsx", "src/components/turnstile-field.tsx", "src/components/ui/button.tsx",
  "src/lib/turnstile-widget.ts", "src/lib/public-form-error.ts", "src/lib/utils.ts",
  "src/lib/html-text.ts", "src/lib/languages.ts", "src/lib/french-type.ts",
];
const allowedSources = new Set(sourceFiles.map((path) => join(root, path)));
const canonicalRoot = realpathSync(root);
for (const path of allowedSources) assert.equal(realpathSync(path), join(canonicalRoot, relative(root, path)), "Fixture sources must not be symlinks");
const fontFiles = new Map(["plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2"]
  .map((name) => [`/fonts/${name}`, join(root, "public/fonts", name)]));
const allowedPackages = new Set([
  "react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "@radix-ui/react-slot",
  "lucide-react", "clsx", "tailwind-merge", "class-variance-authority",
]);
const metrics = {
  forbiddenImports: [],
  forbiddenBrowserTransports: [],
  nodeFetchAttempts: [],
  serverTransportAttempts: [],
  actualProjectModules: [],
  rewrittenEdges: [],
};

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function compiledCssFile() {
  const dirs = [join(root, ".vercel/output/static/assets"), join(root, ".output/public/assets")];
  const supplied = process.env.A11Y_CSS_FILE;
  const candidates = supplied ? [resolve(supplied)] : dirs.flatMap((dir) =>
    existsSync(dir) ? readdirSync(dir).filter((name) => /^styles-.*\.css$/.test(name)).map((name) => join(dir, name)) : [],
  );
  assert.equal(candidates.length, 1, "Provide A11Y_CSS_FILE from a finished local build");
  const file = realpathSync(candidates[0]);
  assert.ok(dirs.some((dir) => file.startsWith(`${dir}${sep}`)), "CSS must be inside this checkout's build assets");
  assert.equal(extname(file), ".css");
  return file;
}

const cssFile = compiledCssFile();
const provenance = {
  copy: readStaticCopyProvenance(root),
  components: [...sourceFiles, "src/styles.css"].map((path) => ({ path, sha256: sha256(join(root, path)) })),
  harness: ["scripts/public-form-a11y.browser.mjs", "scripts/fixtures/a11y-static-copy.mjs"]
    .map((path) => ({ path, sha256: sha256(join(root, path)) })),
  fonts: [...fontFiles.values()].map((path) => ({ path: relative(root, path), sha256: sha256(path) })),
  compiledCss: { path: relative(root, cssFile), sha256: sha256(cssFile) },
  copyKeys,
};

const virtual = {
  "a11y-fixture:shell": "export function Shell({children}){return children;}",
  "a11y-fixture:building-photo": "export function FeelBanner(){return null;}",
  "a11y-fixture:turnstile-key":
    "export async function getTurnstileSiteKey(){return 'synthetic-site-key';}",
  "a11y-fixture:rejected-message": `export async function submitPublicMessage(){
    window.__publicFormQa.rejectedSubmissions++;
    throw new Error('Synthetic Turnstile rejection; no message sent');
  }`,
  "a11y-fixture:success-confirm":
    "export function confirmAction(){throw new Error('Unexpected successful send');}",
  "a11y-fixture:page-seo":
    "export const MARKETING_PAGE_SEO={contact:{}};export function pageSeoHead(){return {};}",
  "a11y-fixture:copy": `
    import {frenchTypography} from ${JSON.stringify(join(root, "src/lib/french-type.ts"))};
    const packs=${JSON.stringify(packs)};
    export function tx(locale,key){
      const pack=locale==='fr'?packs.fr:packs.en;
      if(!Object.prototype.hasOwnProperty.call(pack,key))throw new Error('Unknown static fixture copy key: '+key);
      return locale==='fr'?frenchTypography(pack[key]):pack[key];
    }
    export function useCopy(){const locale=document.documentElement.lang==='fr'?'fr':'en';return {locale,t:key=>tx(locale,key)};}
  `,
  "a11y-fixture:support-email": `export const SUPPORT_INBOX_EMAIL=${JSON.stringify(supportEmail)};`,
  "a11y-fixture:toast": "export const toast={error(){}};",
  "a11y-fixture:router": `
    import {createElement} from 'react';
    export const createFileRoute=()=>options=>options;
    export function useSearch(){return {};}
    export function Link({to,children,hash,...props}){return createElement('a',{...props,href:to+(hash?'#'+hash:'')},children);}
  `,
};

const uiEdges = {
  "src/routes/contact.tsx": {
    "@/components/shell": "a11y-fixture:shell",
    "@/components/building-photo": "a11y-fixture:building-photo",
    "@/lib/server/notify": "a11y-fixture:rejected-message",
    "@/lib/success-confirm": "a11y-fixture:success-confirm",
    "@/lib/page-seo": "a11y-fixture:page-seo",
    "@/lib/use-copy": "a11y-fixture:copy",
    "@/lib/support": "a11y-fixture:support-email",
    sonner: "a11y-fixture:toast",
    "@tanstack/react-router": "a11y-fixture:router",
  },
  "src/components/turnstile-field.tsx": {
    "@/lib/server/turnstile": "a11y-fixture:turnstile-key",
    "@/lib/use-copy": "a11y-fixture:copy",
    "@/lib/copy-runtime": "a11y-fixture:copy",
  },
};

function cleanId(id) {
  return id.replace(/^\/@fs\//, "/").split(/[?#]/)[0];
}

function fileCandidate(id, importer) {
  const clean = cleanId(id);
  return clean.startsWith("@/") ? join(root, "src", clean.slice(2))
    : isAbsolute(clean) ? resolve(clean)
      : clean.startsWith(".") && importer && !importer.startsWith("\0") ? resolve(dirname(cleanId(importer)), clean) : null;
}

function infrastructurePath(path) {
  return path?.startsWith(`${join(root, "node_modules")}${sep}`) || path?.startsWith(`${join(fixture, ".vite-cache")}${sep}`);
}

function projectPath(id, importer) {
  const candidate = fileCandidate(id, importer);
  if (!candidate?.startsWith(`${root}${sep}`) || infrastructurePath(candidate)) return null;
  return [candidate, `${candidate}.ts`, `${candidate}.tsx`].find((path) => allowedSources.has(path)) ?? candidate;
}

function allowedFile(path) {
  return (allowedSources.has(path) || fixtureFiles.has(path)) &&
    (!existsSync(path) || realpathSync(path) === join(canonicalRoot, relative(root, path)));
}

function denyImport(_id, importer) {
  const source = importer ? projectPath(importer) : null;
  metrics.forbiddenImports.push({ kind: "unlisted-runtime-import", source: source && allowedFile(source) ? relative(root, source) : "fixture-boundary" });
  throw new Error("Forbidden project dependency in synthetic public-form QA");
}

function syntheticEdges() {
  return {
    name: "public-form-synthetic-edges",
    enforce: "pre",
    resolveId(id, importer) {
      if (cleanId(id) === "/entry.tsx" && (!importer || cleanId(importer) === join(fixture, "index.html"))) return fixtureEntry;
      if (Object.prototype.hasOwnProperty.call(virtual, id)) return `\0public-form-qa:${id}`;
      const path = projectPath(id, importer);
      if (path && !allowedFile(path)) return denyImport(id, importer);
      if ((importer?.startsWith("\0public-form-qa:") || (importer && projectPath(importer))) &&
        !path && !infrastructurePath(fileCandidate(id, importer)) &&
        !["/@react-refresh", "/@vite/client"].includes(id) && !allowedPackages.has(id)) return denyImport(id, importer);
    },
    load(id) {
      const prefix = "\0public-form-qa:";
      if (id.startsWith(prefix)) return virtual[id.slice(prefix.length)];
      const path = projectPath(id);
      if (path) {
        if (!allowedFile(path)) return denyImport(id);
        const relativePath = relative(root, path);
        if (allowedSources.has(path) && !metrics.actualProjectModules.includes(relativePath)) metrics.actualProjectModules.push(relativePath);
      }
    },
    transform(code, id) {
      const path = projectPath(id);
      if (!path) return;
      if (!allowedFile(path)) return denyImport(id);
      const relativePath = relative(root, path);
      const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function assertSourceSpecifier(specifier) {
        const mapped = uiEdges[relativePath]?.[specifier] ?? specifier;
        if (Object.prototype.hasOwnProperty.call(virtual, mapped) || allowedPackages.has(mapped)) return;
        const target = projectPath(mapped, path);
        if (!target || !allowedFile(target)) denyImport(specifier, id);
      }
      function rejectUnboundedImports(node) {
        if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
          const bindings = node.importClause?.namedBindings;
          const onlyTypes = bindings && ts.isNamedImports(bindings) && !node.importClause.name && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
          if (!onlyTypes) assertSourceSpecifier(node.moduleSpecifier.text);
        }
        if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier) assertSourceSpecifier(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
          if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) denyImport("nonliteral import", id);
          assertSourceSpecifier(node.arguments[0].text);
        }
        ts.forEachChild(node, rejectUnboundedImports);
      }
      rejectUnboundedImports(file);
      const replacements = [];
      for (const statement of file.statements) {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const from = statement.moduleSpecifier.text;
        const to = uiEdges[relativePath]?.[from];
        if (to) {
          replacements.push({ start: statement.moduleSpecifier.getStart(file), end: statement.moduleSpecifier.end, to });
          if (!metrics.rewrittenEdges.some((edge) => edge.source === relativePath && edge.from === from)) metrics.rewrittenEdges.push({ source: relativePath, from, to });
        }
      }
      for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
        code = code.slice(0, replacement.start) + JSON.stringify(replacement.to) + code.slice(replacement.end);
      }
      return replacements.length ? { code, map: null } : null;
    },
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        const url = new URL(request.url, "http://127.0.0.1");
        if (!["GET", "HEAD"].includes(request.method) || /(?:^|\/)(?:api|_server[^/]*|__server[^/]*)(?:\/|$)/.test(url.pathname)) {
          metrics.serverTransportAttempts.push({ kind: "service-request", method: request.method });
          response.statusCode = 403;
          response.end("No service transport is allowed in this fixture");
          return;
        }
        if (url.pathname === "/") {
          // Keep the fixed fixture shell free of Vite's development WebSocket client.
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(readFileSync(join(fixture, "index.html")));
          return;
        }
        if (url.pathname.startsWith("/fonts/")) {
          const font = fontFiles.get(url.pathname);
          if (!font) {
            metrics.serverTransportAttempts.push({ kind: "unlisted-font", method: request.method });
            response.statusCode = 403;
            response.end("Only explicit fixture fonts are allowed");
            return;
          }
          response.setHeader("Content-Type", "font/woff2");
          response.end(readFileSync(font));
          return;
        }
        if (!url.pathname.startsWith("/assets/")) return next();
        const name = decodeURIComponent(url.pathname.slice("/assets/".length));
        const asset = join(dirname(cssFile), name);
        if (name !== basename(name) || !/\.(?:css|woff2?|ttf|otf|svg|png|webp|avif|jpe?g|ico)$/.test(name) || !existsSync(asset)) {
          metrics.serverTransportAttempts.push({ kind: "unlisted-built-asset", method: request.method });
          response.statusCode = 403;
          response.end("Only compiled CSS and static assets are allowed");
          return;
        }
        const mime = { ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" }[extname(asset)];
        if (mime) response.setHeader("Content-Type", mime);
        response.end(readFileSync(asset));
      });
    },
  };
}

let server;
let httpServer;
let browser;
const results = [];
let failure;
const previousFetch = globalThis.fetch;
const processGuard = globalThis[Symbol.for("kidease.private.outbound-guard")];
function processGuardStatus() {
  assert.ok(typeof processGuard?.getStatus === "function", "Private process guard status is required");
  const status = processGuard.getStatus();
  assert.ok(status.mode === "fixture" && status.violations === 0, "Private process guard must be clean and in fixture mode");
  assert.ok(status.counts && Object.keys(status.counts).length === 0, "Private process guard must have no blocked operations");
  return { mode: "fixture", violations: 0, counts: {} };
}
if (processGuard) metrics.processGuard = processGuardStatus();
else {
  globalThis.fetch = () => {
    metrics.nodeFetchAttempts.push("unexpected-node-fetch");
    throw new Error("No Node fetch is allowed in synthetic public-form QA");
  };
}
try {
  await mkdir(fixture, { recursive: true });
  await writeFile(
    join(fixture, "index.html"),
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/${basename(cssFile)}"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>`,
  );
  await writeFile(
    join(fixture, "entry.tsx"),
    `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {Contact} from ${JSON.stringify(join(root, "src/routes/contact.tsx"))};
    document.documentElement.lang=new URLSearchParams(location.search).get('locale')==='fr'?'fr':'en';
    document.documentElement.style.setProperty('--ke-text-scale',new URLSearchParams(location.search).get('scale')||'1');
    createRoot(document.getElementById('root')!).render(<Contact/>);
  `,
  );
  server = await createServer({
    configFile: false,
    envDir: false,
    appType: "custom",
    root: fixture,
    cacheDir: join(fixture, ".vite-cache"),
    publicDir: false,
    resolve: { alias: { "@": join(root, "src") } },
    plugins: [syntheticEdges(), react()],
    server: { middlewareMode: true, host: "127.0.0.1", port: 0, hmr: false, ws: false, fs: { allow: [root] } },
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
  httpServer = createHttpServer(server.middlewares);
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen({ host: "127.0.0.1", port: 0 }, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });
  const origin = `http://127.0.0.1:${httpServer.address().port}`;
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
        const url = new URL(request.url());
        if (request.method() !== "GET") {
          networkMutations.push(request.method());
          metrics.forbiddenBrowserTransports.push({ kind: "non-read-request", method: request.method() });
          return route.abort("blockedbyclient");
        }
        if (url.origin !== origin || /(?:^|\/)(?:api|_server[^/]*|__server[^/]*)(?:\/|$)/.test(url.pathname)) {
          metrics.forbiddenBrowserTransports.push({ kind: url.origin !== origin ? "external-request" : "application-api", method: request.method() });
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      await context.routeWebSocket("**/*", (socket) => {
        metrics.forbiddenBrowserTransports.push({ kind: "websocket" });
        socket.close();
      });
      await context.addInitScript(() => {
        window.__publicFormQa = { rejectedSubmissions: 0, syntheticScriptFailures: 0 };
        if (new URLSearchParams(location.search).has("load-failure")) {
          // Keep the real loader/error handling. Only its external script edge is synthetic.
          const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
          Object.defineProperty(HTMLScriptElement.prototype, "src", {
            ...descriptor,
            set(value) {
              if (String(value) === "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit") {
                window.__publicFormQa.syntheticScriptFailures++;
                queueMicrotask(() => this.dispatchEvent(new Event("error")));
                return;
              }
              descriptor.set.call(this, value);
            },
          });
          return;
        }
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
      assert.equal(await page.evaluate(() => window.__publicFormQa.syntheticScriptFailures), 1);
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
        syntheticScriptFailures: 1,
      });
      await context.close();
    }
  }
} catch (error) {
  failure = error;
} finally {
  try {
    try {
      await browser?.close();
    } finally {
      try {
        if (httpServer?.listening) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
      } finally {
        await server?.close();
      }
    }
    for (const source of [...provenance.copy, ...provenance.components, ...provenance.harness, ...provenance.fonts, provenance.compiledCss]) {
      assert.equal(sha256(join(root, source.path)), source.sha256, `Source changed during public-form QA: ${source.path}`);
    }
    for (const key of ["forbiddenImports", "forbiddenBrowserTransports", "nodeFetchAttempts", "serverTransportAttempts"]) {
      assert.deepEqual(metrics[key], [], `${key} must stay empty`);
    }
    assert.deepEqual([...metrics.actualProjectModules].sort(), [...sourceFiles].sort(), "Exactly the reviewed project modules must load");
    const edges = Object.entries(uiEdges).flatMap(([source, replacements]) =>
      Object.entries(replacements).map(([from, to]) => ({ source, from, to })),
    );
    const edgeKey = (edge) => `${edge.source}:${edge.from}:${edge.to}`;
    assert.deepEqual(metrics.rewrittenEdges.map(edgeKey).sort(), edges.map(edgeKey).sort(), "Every expected UI boundary must be rewritten");
    assert.equal(results.length, 4, "All original public-form cases must run");
    if (processGuard) metrics.processGuard = processGuardStatus();
  } catch (error) {
    failure ??= error;
  } finally {
    try {
      await rm(fixture, { recursive: true, force: true });
    } finally {
      if (!processGuard) globalThis.fetch = previousFetch;
    }
  }
  const report = { ok: !failure, ...(failure ? { error: String(failure) } : {}), results, artifacts, provenance, metrics };
  await writeFile(join(artifacts, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (failure) throw failure;
