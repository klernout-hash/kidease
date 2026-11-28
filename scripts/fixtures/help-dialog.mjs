import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { readStaticCopy, readStaticCopyProvenance } from "./a11y-static-copy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const canonicalRoot = realpathSync(root);
const ui = ["src/components/help-launcher-shell.tsx", "src/components/help-bot.tsx", "src/components/turnstile-field.tsx"];
const allowed = new Set([
  ...ui, "src/components/ui/button.tsx", "src/lib/help-launcher.ts", "src/lib/gov/access.ts",
  "src/lib/locale-path.ts", "src/lib/ai/help-bubble.ts", "src/lib/ai/flags.ts", "src/lib/ai/flag-gate.ts",
  "src/lib/ai/pii.ts", "src/lib/ai/event-props.ts", "src/lib/ranking/weights.ts", "src/lib/turnstile-widget.ts",
  "src/lib/utils.ts", "src/lib/cad-format.ts", "src/lib/secure-random.ts", "src/lib/html-text.ts", "src/lib/languages.ts", "src/lib/french-type.ts",
]);
const allowedPackages = new Set(["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-router", "@radix-ui/react-dialog", "@radix-ui/react-slot", "lucide-react", "clsx", "tailwind-merge", "class-variance-authority"]);
for (const path of allowed) assert.equal(realpathSync(join(root, path)), join(canonicalRoot, path), "Fixture sources must not be symlinks");
const publicFiles = new Map([
  ["/logo-transparent.svg", join(root, "public/logo-transparent.svg")],
  ...["plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2"].map((name) => [`/fonts/${name}`, join(root, "public/fonts", name)]),
]);
const rewrites = {
  [ui[0]]: { "@/lib/use-copy": "a11y-fixture:copy" },
  [ui[1]]: {
    "@/lib/use-copy": "a11y-fixture:copy",
    "@/lib/auth/use-current-user": "a11y-fixture:user",
    "@/lib/posthog": "a11y-fixture:analytics",
    "@/lib/server/parent-helper": "a11y-fixture:help-service",
    "@/lib/server/support-chat": "a11y-fixture:chat-service",
  },
  [ui[2]]: {
    "@/lib/use-copy": "a11y-fixture:copy",
    "@/lib/copy-runtime": "a11y-fixture:copy",
    "@/lib/server/turnstile": "a11y-fixture:turnstile-key",
  },
};

function digest(file) {
  return { path: relative(root, file), sha256: createHash("sha256").update(readFileSync(file)).digest("hex") };
}

function copyKeys() {
  const keys = new Set(["helpBotQ1", "helpBotQ2", "helpBotQ3", "helpBotQ4"]);
  for (const path of ui) {
    const source = ts.createSourceFile(path, readFileSync(join(root, path), "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const arg = node.expression.text === "t" ? node.arguments[0] : node.expression.text === "tx" ? node.arguments[1] : null;
        if (arg && ts.isStringLiteralLike(arg)) keys.add(arg.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...keys];
}

function cssPath() {
  const directories = [".vercel/output/static/assets", ".output/public/assets", "dist/client/assets"].map((path) => join(root, path));
  if (process.env.A11Y_CSS_FILE) {
    const path = realpathSync(resolve(process.env.A11Y_CSS_FILE));
    assert.ok(directories.some((directory) => path.startsWith(directory + sep)) && path.endsWith(".css"), "Use compiled CSS from this checkout's build assets");
    return path;
  }
  for (const path of directories) {
    if (!existsSync(path)) continue;
    const file = readdirSync(path).find((name) => /^(?:styles|index|main|__root__|globals).*\.css$/.test(name));
    if (file) return join(path, file);
  }
  throw new Error("Build the actual application CSS first, then supply A11Y_CSS_FILE");
}

/** Real Help, Radix and Router. Only explicitly listed nonfinancial service edges are replaced. */
export async function startHelpDialogFixture(out) {
  const fixture = join(out, ".fixture");
  const entry = join(fixture, "entry.tsx");
  const fixtureFiles = new Set([entry, join(fixture, "index.html")]);
  const css = cssPath();
  const packs = readStaticCopy(root, copyKeys());
  const provenance = [...[...allowed].map((path) => digest(join(root, path))), ...readStaticCopyProvenance(root),
    ...[...publicFiles.values()].map(digest), digest(join(root, "src/styles.css")), digest(css),
    ...["scripts/help-dialog.browser.mjs", "scripts/fixtures/help-dialog.mjs", "scripts/fixtures/a11y-static-copy.mjs"].map((path) => digest(join(root, path)))];
  const metrics = { sourceModules: [], rewrittenEdges: [], forbiddenImports: [], nodeFetchAttempts: [], serverRequestsBlocked: 0 };
  const virtual = {
    "a11y-fixture:copy": `
      import {useRouterState} from '@tanstack/react-router';
      import {frenchTypography} from ${JSON.stringify(join(root, "src/lib/french-type.ts"))};
      const packs=${JSON.stringify(packs)};
      export function tx(locale,key){const value=packs[locale==='fr'?'fr':'en'][key];if(typeof value!=='string')throw new Error('Missing extracted UI copy: '+key);return locale==='fr'?frenchTypography(value):value;}
      export function useCopy(){const path=useRouterState({select:s=>s.location.pathname});const locale=path==='/fr'||path.startsWith('/fr/')?'fr':'en';return {locale,t:key=>tx(locale,key)};}
    `,
    "a11y-fixture:user": "export function useCurrentUserState(){return {user:null,loading:false};}",
    "a11y-fixture:analytics": "export function capturePostHogEvent(){throw new Error('Analytics are denied in Help QA');}",
    "a11y-fixture:turnstile-key": "export async function getTurnstileSiteKey(){return '';}",
    "a11y-fixture:help-service": `
      async function denied(){await fetch('/__help_fixture/denied',{method:'POST',body:'synthetic Help boundary rejection'});throw new Error('Help services are denied');}
      export const askParentHelper=denied;export const requestParentHelperAgent=denied;
    `,
    "a11y-fixture:chat-service": "export async function readSupportChatMessages(){throw new Error('Chat services are denied');}export async function sendSupportChatMessage(){throw new Error('Chat services are denied');}",
  };
  function modulePath(id, importer) {
    const clean = id.replace(/^\/@fs\//, "/").split(/[?#]/)[0];
    if (clean.startsWith("@/")) return join(root, "src", clean.slice(2));
    if (clean.startsWith(".") && importer && !importer.startsWith("\0")) return resolve(dirname(importer.split("?")[0]), clean);
    if (isAbsolute(clean)) return resolve(clean);
    return null;
  }
  function infrastructure(path) {
    return path?.startsWith(join(root, "node_modules") + sep) || path?.startsWith(join(fixture, ".vite-cache") + sep);
  }
  function deny(_id, importer) {
    metrics.forbiddenImports.push({ kind: "unlisted-module", source: importer && !importer.startsWith("\0") ? relative(root, importer.split(/[?#]/)[0]) : "fixture" });
    throw new Error("Help QA refuses an unlisted dependency");
  }
  function check(id, importer) {
    const candidate = modulePath(id, importer);
    if (!candidate || !candidate.startsWith(root + sep) || infrastructure(candidate)) return;
    const file = [candidate, ...[".ts", ".tsx"].map((ext) => candidate + ext)].find(existsSync);
    if (file && realpathSync(file) !== join(canonicalRoot, relative(root, file))) deny("symlinked project dependency", importer);
    const path = file ? relative(root, file) : relative(root, candidate);
    if (!allowed.has(path) && !fixtureFiles.has(file ?? candidate)) deny(id, importer);
    if (allowed.has(path) && !metrics.sourceModules.includes(path)) metrics.sourceModules.push(path);
  }
  function checkSourceSpecifier(specifier, importer) {
    if (Object.hasOwn(virtual, specifier) || allowedPackages.has(specifier) || ["/@react-refresh", "/@vite/client"].includes(specifier)) return;
    const candidate = modulePath(specifier, importer);
    const file = candidate && [candidate, candidate + ".ts", candidate + ".tsx"].find(existsSync);
    if (!file || (!allowed.has(relative(root, file)) && !fixtureFiles.has(file))) deny(specifier, importer);
  }
  const edges = {
    name: "isolated-help-nonfinancial-boundary",
    enforce: "pre",
    resolveId(id, importer) {
      if (Object.hasOwn(virtual, id)) return "\0" + id;
      check(id, importer);
      if (importer?.startsWith("\0a11y-fixture:") && !infrastructure(modulePath(id, importer))) checkSourceSpecifier(id, importer);
    },
    load(id) {
      if (id.startsWith("\0a11y-fixture:")) return virtual[id.slice(1)];
      check(id);
    },
    transform(code, id) {
      const path = relative(root, id.split("?")[0]);
      const replace = rewrites[path];
      if (!allowed.has(path) && !fixtureFiles.has(id.split("?")[0])) return;
      const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const edits = [];
      function visit(node) {
        const typeOnly = (ts.isImportDeclaration(node) && (node.importClause?.isTypeOnly ||
          (!node.importClause?.name && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.length > 0 && node.importClause.namedBindings.elements.every((item) => item.isTypeOnly)))) ||
          (ts.isExportDeclaration(node) && (node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((item) => item.isTypeOnly))));
        const call = ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"));
        if (call && (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]))) deny("nonliteral import", id);
        const specifier = !typeOnly && (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier : call ? node.arguments[0] : null;
        if (specifier && ts.isStringLiteralLike(specifier) && replace?.[specifier.text]) {
          edits.push({ start: specifier.getStart(source), end: specifier.getEnd(), text: JSON.stringify(replace[specifier.text]) });
          const edge = { from: path, original: specifier.text, fixture: replace[specifier.text] };
          if (!metrics.rewrittenEdges.some((item) => item.from === edge.from && item.original === edge.original)) metrics.rewrittenEdges.push(edge);
        } else if (specifier && ts.isStringLiteralLike(specifier)) checkSourceSpecifier(specifier.text, id);
        ts.forEachChild(node, visit);
      }
      visit(source);
      for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
      return { code, map: null };
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url, "http://127.0.0.1").pathname;
        if (!["GET", "HEAD"].includes(request.method) || /^\/(?:api|_server[^/]*|__server[^/]*|__help_fixture)(?:\/|$)/.test(path)) {
          metrics.serverRequestsBlocked++;
          response.writeHead(405).end("Service requests are denied in this fixture");
          return;
        }
        if (["/help", "/fr/help", "/report", "/fr/report"].includes(path)) {
          // Serve only this fixed shell: Vite's dev HTML transform injects a WebSocket client.
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(join(fixture, "index.html")));
          return;
        }
        if (publicFiles.has(path)) {
          const mime = path.endsWith(".svg") ? "image/svg+xml" : "font/woff2";
          response.writeHead(200, { "content-type": mime }).end(readFileSync(publicFiles.get(path)));
          return;
        }
        if (path.startsWith("/assets/")) {
          const name = decodeURIComponent(path.slice("/assets/".length));
          const asset = join(dirname(css), name);
          if (name !== basename(name) || !/\.(?:css|woff2?|ttf|otf|svg|png|webp|avif|jpe?g|ico)$/.test(name) || !existsSync(asset)) {
            metrics.serverRequestsBlocked++;
            response.writeHead(403).end("Only compiled static styles/assets are allowed");
            return;
          }
          const mime = { ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" }[extname(asset)];
          if (mime) response.setHeader("content-type", mime);
          response.end(readFileSync(asset));
          return;
        }
        next();
      });
    },
  };
  await mkdir(fixture, { recursive: true });
  await writeFile(join(fixture, "index.html"), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/${basename(css)}"></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>`);
  await writeFile(join(fixture, "entry.tsx"), `
    import React,{useEffect} from 'react';import {createRoot} from 'react-dom/client';
    import {createRootRoute,createRoute,createRouter,RouterProvider,Outlet,Link,useRouterState} from '@tanstack/react-router';
    import {LiveChatSlot} from ${JSON.stringify(join(root, ui[0]))};
    function Layout(){const path=useRouterState({select:s=>s.location.pathname});const fr=path.startsWith('/fr/');useEffect(()=>{document.documentElement.lang=fr?'fr':'en';},[fr]);return <><nav><Link to={fr?'/fr/report':'/report'}>Report</Link><Link to={fr?'/fr/help':'/help'}>Help</Link></nav><Outlet/><LiveChatSlot/></>;}
    const rootRoute=createRootRoute({component:Layout});
    const routes=['/help','/fr/help','/report','/fr/report'].map(path=>createRoute({getParentRoute:()=>rootRoute,path,component:()=> <main style={{minHeight:'180dvh',padding:'2rem'}}><h1>Isolated Help background</h1><p>Actual Help components, local Router navigation, no application services.</p></main>}));
    const router=createRouter({routeTree:rootRoute.addChildren(routes)});createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
  `);
  let server;
  let httpServer;
  async function closeServers() {
    try {
      if (httpServer?.listening) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    } finally {
      await server?.close();
    }
  }
  const processGuard = globalThis[Symbol.for("kidease.private.outbound-guard")];
  if (processGuard) {
    assert.equal(processGuard.getStatus().mode, "fixture", "Use the private guard's fixture mode");
    assert.equal(processGuard.getStatus().violations, 0);
  }
  const previousFetch = globalThis.fetch;
  if (!processGuard) globalThis.fetch = () => {
      metrics.nodeFetchAttempts.push("node-fetch-denied");
      throw new Error("Node fetch is denied in isolated Help QA");
    };
  try {
    server = await createServer({
      configFile: false, envDir: false, appType: "custom", root: fixture, publicDir: false, cacheDir: join(fixture, ".vite-cache"),
      resolve: { alias: { "@": join(root, "src") } }, plugins: [edges, react()],
      server: { middlewareMode: true, host: "127.0.0.1", port: 0, hmr: false, ws: false, fs: { allow: [root] } },
      optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react/jsx-runtime", "@tanstack/react-router", "@radix-ui/react-dialog", "@radix-ui/react-slot", "lucide-react", "clsx", "tailwind-merge", "class-variance-authority"] },
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
    return {
      origin: `http://127.0.0.1:${httpServer.address().port}`, packs, provenance, metrics,
      async close() {
        try {
          await closeServers();
          for (const entry of provenance) assert.equal(digest(join(root, entry.path)).sha256, entry.sha256, `Source changed during Help QA: ${entry.path}`);
          assert.deepEqual(metrics.forbiddenImports, []);
          assert.deepEqual(metrics.nodeFetchAttempts, []);
          if (processGuard) {
            metrics.processGuard = processGuard.getStatus();
            assert.equal(metrics.processGuard.violations, 0, "The private process guard must remain clean");
          }
          assert.deepEqual(new Set(metrics.sourceModules), allowed, "Only the complete actual Help source graph may load");
          assert.equal(metrics.rewrittenEdges.length, 9, "All explicit service/copy edges must be isolated");
          assert.equal(metrics.serverRequestsBlocked, 0, "Browser denial must stop service calls before the fixture server");
        } finally {
          if (!processGuard) globalThis.fetch = previousFetch;
          await rm(fixture, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    try { await closeServers(); }
    finally { if (!processGuard) globalThis.fetch = previousFetch; await rm(fixture, { recursive: true, force: true }); }
    throw error;
  }
}
