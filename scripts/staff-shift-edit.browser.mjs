#!/usr/bin/env node
/** Actual shift UI with synthetic memory only; no application server or database. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "artifacts/staff-shift-edit");
const component = "src/components/staff-scheduling-desk.tsx";
const sourceFiles = [
  component,
  "src/lib/staff-scheduling-copy.ts",
  "src/lib/staff-scheduling.ts",
  "src/lib/provincial-ratios.ts",
  "src/components/ui/button.tsx",
  "src/components/empty-state.tsx",
  "src/lib/utils.ts",
  "src/lib/cad-format.ts",
  "src/lib/html-text.ts",
  "src/lib/languages.ts",
];
const allowedSources = new Set(sourceFiles.map((path) => join(root, path)));
const allowedPackages = new Set([
  "react",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@radix-ui/react-slot",
  "lucide-react",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
]);
const entryId = "staff-shift-fixture:entry";
const prefix = "\0staff-shift-fixture:";
const replacements = {
  "@tanstack/react-router": "staff-shift-fixture:router",
  sonner: "staff-shift-fixture:toast",
  "@/lib/use-copy": "staff-shift-fixture:locale",
  "@/lib/server/staff-scheduling": "staff-shift-fixture:service",
};
const initialRows = [
  {
    id: "shf-avery-example",
    staffName: "Avery Example",
    role: "ece",
    roomBand: "preschool",
    startsAt: "2026-11-18T14:15:37.123Z",
    endsAt: "2026-11-18T22:45:09.456Z",
  },
  {
    id: "shf-morgan-example",
    staffName: "Morgan Example",
    role: "other",
    roomBand: "school-age",
    startsAt: "2026-11-18T13:00:00.000Z",
    endsAt: "2026-11-18T21:00:00.000Z",
  },
];
const virtual = {
  [entryId]: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{StaffSchedulingDesk}from${JSON.stringify(join(root, component))};
    import{staffCopy}from${JSON.stringify(join(root, "src/lib/staff-scheduling-copy.ts"))};
    const root=createRoot(document.getElementById('root'));let version=0;
    window.__staffShiftQa.copy=staffCopy(document.documentElement.lang);
    window.__staffShiftQa.remount=()=>root.render(React.createElement(StaffSchedulingDesk,{key:++version}));
    window.__staffShiftQa.remount();
  `,
  "staff-shift-fixture:router": `
    import{createElement}from'react';
    export function Link({to,search,children,...props}){return createElement('a',{...props,href:to},children);}
  `,
  "staff-shift-fixture:locale":
    "export function useCopy(){return {locale:document.documentElement.lang};}",
  "staff-shift-fixture:toast": `
    export const toast={success(text){window.__staffShiftQa.toasts.push({kind:'success',text});},error(text){window.__staffShiftQa.toasts.push({kind:'error',text});}};
  `,
  "staff-shift-fixture:service": `
    const rows=new Map(${JSON.stringify(initialRows)}.map(row=>[row.id,row]));
    const qa=window.__staffShiftQa={saveCalls:[],listCalls:0,toasts:[],forbiddenServices:[],rejectNext:false,holdNextLoad:false,pendingLoad:null,
      snapshot:()=>({rows:structuredClone([...rows.values()]),saveCalls:structuredClone(qa.saveCalls),listCalls:qa.listCalls,hasPendingLoad:Boolean(qa.pendingLoad),forbiddenServices:[...qa.forbiddenServices]})};
    function denied(name){qa.forbiddenServices.push(name);throw new Error('Unlisted synthetic service call: '+name);}
    function desk(){return {enabled:true,daycareId:'centre-example',province:'ON',centres:[{id:'centre-example',name:'Synthetic Maple Centre'}],shifts:structuredClone([...rows.values()]),certs:[]};}
    qa.releaseLoad=()=>{if(!qa.pendingLoad)return denied('no-pending-load');qa.pendingLoad();};
    export async function listStaffDesk({data}){
      if(data.daycareId&&data.daycareId!=='centre-example')return denied('unexpected-centre');
      qa.listCalls++;
      if(qa.holdNextLoad){qa.holdNextLoad=false;return new Promise(resolve=>{qa.pendingLoad=()=>{qa.pendingLoad=null;resolve(desk());};});}
      return desk();
    }
    export async function saveStaffShift({data}){
      qa.saveCalls.push(structuredClone(data));
      if(data.daycareId!=='centre-example'||!rows.has(data.id))return denied('unexpected-shift');
      if(qa.rejectNext){qa.rejectNext=false;return {ok:false,code:'shift-not-saved',error:'Synthetic write did not complete.'};}
      const row=rows.get(data.id);
      rows.set(data.id,{...row,staffName:data.staffName,role:data.role,roomBand:data.roomBand,startsAt:data.startsAt,endsAt:data.endsAt});
      return {ok:true,id:data.id,hours:(Date.parse(data.endsAt)-Date.parse(data.startsAt))/3600000};
    }
    export function staffDeskStatus(){return denied('staffDeskStatus');}
    export function saveEceCertificate(){return denied('saveEceCertificate');}
    export function checkRoomRatio(){return denied('checkRoomRatio');}
  `,
};

const metrics = {
  actualProjectModules: [],
  rewrittenEdges: [],
  forbiddenImports: [],
  browserTransports: [],
  nodeFetchAttempts: [],
  pageErrors: [],
};
const guard = globalThis[Symbol.for("kidease.private.outbound-guard")];
function guardStatus() {
  assert.equal(typeof guard?.getStatus, "function", "The private fixture guard must expose status");
  const status = guard.getStatus();
  assert.equal(status.mode, "fixture");
  assert.equal(status.violations, 0);
  assert.ok(
    status.counts && Object.keys(status.counts).length === 0,
    "No private guard operation may be blocked",
  );
  return { mode: status.mode, violations: status.violations, counts: { ...status.counts } };
}
if (guard) guardStatus();

function digest(path) {
  return {
    path: relative(root, path),
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  };
}
const cssDirectories = [
  ".vercel/output/static/assets",
  ".output/public/assets",
  "dist/client/assets",
].map((path) => join(root, path));
const suppliedCss = process.env.A11Y_CSS_FILE;
const cssCandidates = suppliedCss
  ? [resolve(suppliedCss)]
  : cssDirectories.flatMap((directory) =>
      existsSync(directory)
        ? readdirSync(directory)
            .filter((name) => /^styles.*\.css$/.test(name))
            .map((name) => join(directory, name))
        : [],
    );
assert.equal(
  cssCandidates.length,
  1,
  "Supply A11Y_CSS_FILE when the actual build does not have exactly one styles CSS file",
);
const cssFile = realpathSync(cssCandidates[0]);
assert.ok(
  cssDirectories.some((directory) => cssFile.startsWith(directory + sep)) &&
    cssFile.endsWith(".css"),
);
const fonts = new Map(
  ["plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2"].map((name) => [
    `/fonts/${name}`,
    join(root, "public/fonts", name),
  ]),
);
const provenance = [...sourceFiles, "src/styles.css", "scripts/staff-shift-edit.browser.mjs"]
  .map((path) => digest(join(root, path)))
  .concat(digest(cssFile), [...fonts.values()].map(digest));
const canonicalRoot = realpathSync(root);
for (const path of allowedSources)
  assert.equal(realpathSync(path), join(canonicalRoot, relative(root, path)));
let css = readFileSync(cssFile, "utf8");
assert.ok(!/@import\b/i.test(css), "Inline CSS must not import another stylesheet");
css = css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (original, _quote, url) => {
  if (url.startsWith("data:")) return original;
  assert.ok(fonts.has(url), "Compiled CSS may reference only the two reviewed local fonts");
  return `url(data:font/woff2;base64,${readFileSync(fonts.get(url)).toString("base64")})`;
});
assert.ok(!/<\/style/i.test(css));

function cleanId(id) {
  return id.replace(/^\/@fs\//, "/").split(/[?#]/)[0];
}
function sourcePath(id, importer) {
  const clean = cleanId(id);
  const candidate = clean.startsWith("@/")
    ? join(root, "src", clean.slice(2))
    : isAbsolute(clean)
      ? resolve(clean)
      : clean.startsWith(".") && importer && !importer.startsWith("\0")
        ? resolve(dirname(cleanId(importer)), clean)
        : null;
  if (!candidate) return null;
  return (
    [candidate, `${candidate}.ts`, `${candidate}.tsx`].find((path) => allowedSources.has(path)) ??
    candidate
  );
}
function denyImport(importer) {
  metrics.forbiddenImports.push({
    source: allowedSources.has(importer) ? relative(root, importer) : "fixture-boundary",
  });
  throw new Error("Unlisted source or package in the staff-shift fixture");
}
function auditSource(code, id, rewrite = false) {
  const path = cleanId(id);
  const tree = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    const typeOnly =
      (ts.isImportDeclaration(node) &&
        (node.importClause?.isTypeOnly ||
          (!node.importClause?.name &&
            node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            node.importClause.namedBindings.elements.length > 0 &&
            node.importClause.namedBindings.elements.every((item) => item.isTypeOnly)))) ||
      (ts.isExportDeclaration(node) &&
        (node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((item) => item.isTypeOnly))));
    const call =
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"));
    if (call && (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])))
      denyImport(path);
    const specifier =
      !typeOnly && (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        ? node.moduleSpecifier
        : call
          ? node.arguments[0]
          : null;
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const from = specifier.text;
      const to = path === join(root, component) ? (replacements[from] ?? from) : from;
      if (
        !Object.hasOwn(virtual, to) &&
        !allowedPackages.has(to) &&
        !allowedSources.has(sourcePath(to, path))
      )
        denyImport(path);
      if (rewrite && to !== from) {
        edits.push({
          start: specifier.getStart(tree),
          end: specifier.getEnd(),
          text: JSON.stringify(to),
        });
        if (!metrics.rewrittenEdges.includes(from)) metrics.rewrittenEdges.push(from);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return code;
}
// Close the complete original source/package graph before Vite aliases exist.
for (const path of allowedSources) auditSource(readFileSync(path, "utf8"), path);
for (const [id, code] of Object.entries(virtual)) auditSource(code, prefix + id);

const boundary = {
  name: "closed-staff-shift-fixture",
  enforce: "pre",
  resolveId(id, importer) {
    if (Object.hasOwn(virtual, id)) return prefix + id;
    const path = sourcePath(id, importer);
    if (path?.startsWith(join(root, "src") + sep) && !allowedSources.has(path))
      denyImport(importer);
    if (
      (importer?.startsWith(prefix) || allowedSources.has(cleanId(importer || ""))) &&
      !path &&
      !allowedPackages.has(id)
    )
      denyImport(importer);
  },
  load(id) {
    if (id.startsWith(prefix)) return virtual[id.slice(prefix.length)];
    const path = cleanId(id);
    if (path.startsWith(join(root, "src") + sep)) {
      if (!allowedSources.has(path)) denyImport(path);
      if (!metrics.actualProjectModules.includes(relative(root, path)))
        metrics.actualProjectModules.push(relative(root, path));
    }
  },
  transform(code, id) {
    const path = cleanId(id);
    if (allowedSources.has(path)) return { code: auditSource(code, path, true), map: null };
    if (id.startsWith(prefix)) auditSource(code, id);
  },
};

let browser;
let failure;
const results = [];
const previousFetch = globalThis.fetch;
try {
  if (!guard)
    globalThis.fetch = () => {
      metrics.nodeFetchAttempts.push("unexpected-node-fetch");
      throw new Error("Node fetch is denied in standalone synthetic shift QA");
    };
  const built = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    root,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { alias: { "@": join(root, "src") } },
    plugins: [boundary, react()],
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      lib: { entry: entryId, formats: ["iife"], name: "StaffShiftFixture" },
      rollupOptions: { input: entryId, output: { inlineDynamicImports: true } },
    },
  });
  const output = (Array.isArray(built) ? built : [built]).flatMap((result) => result.output);
  assert.equal(output.length, 1, "The fixture must be one in-memory script");
  assert.equal(output[0].type, "chunk");
  const script = output[0].code;
  assert.ok(script.length > 0);
  assert.doesNotMatch(
    script,
    /\bprocess\.env\.NODE_ENV\b/,
    "The browser fixture must not depend on Node's process global",
  );
  assert.deepEqual([...metrics.actualProjectModules].sort(), [...sourceFiles].sort());
  assert.deepEqual([...metrics.rewrittenEdges].sort(), Object.keys(replacements).sort());
  const explicitChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME_PATH;
  const approvedChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const chrome = explicitChrome || (guard ? approvedChrome : undefined);
  if (guard)
    assert.equal(
      chrome,
      approvedChrome,
      "The private guard permits only the approved installed Chrome",
    );
  if (chrome) assert.ok(existsSync(chrome), "The explicitly selected browser must be installed");
  browser = await chromium.launch({
    headless: true,
    ...(chrome ? { executablePath: chrome } : {}),
  });
  await mkdir(out, { recursive: true });

  for (const locale of ["en", "fr"])
    for (const width of [390, 1280]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        timezoneId: "America/Toronto",
        locale: locale === "fr" ? "fr-CA" : "en-CA",
        serviceWorkers: "block",
      });
      const pageErrors = [];
      await context.route("**/*", (route) => {
        metrics.browserTransports.push({
          kind: "request",
          method: route.request().method(),
          resource: route.request().resourceType(),
        });
        return route.abort("blockedbyclient");
      });
      await context.routeWebSocket("**/*", (socket) => {
        metrics.browserTransports.push({ kind: "websocket" });
        socket.close();
      });
      context.on("serviceworker", () => metrics.browserTransports.push({ kind: "serviceworker" }));
      let page;
      try {
        page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on("pageerror", (error) => {
          pageErrors.push(error.message);
          metrics.pageErrors.push({ locale, width, message: error.message });
        });
        await page.setContent(
          `<!doctype html><html lang="${locale}" data-look="clean" data-resolved-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><main class="w-full min-h-dvh overflow-x-hidden" style="max-width:52rem;margin:auto;padding:1rem"><div id="root"></div></main></body></html>`,
        );
        await page.evaluate(() => {
          window.__staffShiftTransportAttempts = [];
          if (navigator.serviceWorker)
            Object.defineProperty(navigator.serviceWorker, "register", {
              configurable: true,
              value() {
                window.__staffShiftTransportAttempts.push("serviceworker-registration");
                return Promise.reject(new Error("Service workers are denied in this fixture"));
              },
            });
        });
        await page.addScriptTag({ content: script });
        await page.waitForFunction(() => Boolean(window.__staffShiftQa?.copy));
        const copy = await page.evaluate(() => window.__staffShiftQa.copy);
        const snapshot = () => page.evaluate(() => window.__staffShiftQa.snapshot());
        const edit = () =>
          page.getByRole("button", { name: `${copy.editShiftTitle}: Avery Example`, exact: true });
        const editForm = () => page.getByRole("form", { name: copy.editShiftTitle, exact: true });
        const fields = (form) => ({
          name: form.getByLabel(copy.name, { exact: true }),
          role: form.getByRole("combobox").nth(0),
          room: form.getByRole("combobox").nth(1),
          start: form.getByLabel(copy.start, { exact: true }),
          end: form.getByLabel(copy.end, { exact: true }),
        });
        await edit().waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator("[data-ke=staff-shift-row]").count(), 2);
        await edit().click();
        let form = editForm();
        let controls = fields(form);
        await controls.name.waitFor();
        assert.equal(
          await form.getByRole("combobox").count(),
          2,
          "The edit form has the role and room controls",
        );
        for (const [control, label, options] of [
          [
            controls.role,
            copy.role,
            ["ece", "assistant", "other"].map((value) => ({ value, text: copy.roles[value] })),
          ],
          [
            controls.room,
            copy.room,
            ["infant", "toddler", "preschool", "school-age"].map((value) => ({
              value,
              text: copy.rooms[value],
            })),
          ],
        ]) {
          const leadingLabel = await control.evaluate((element) => {
            if (element.labels.length !== 1)
              throw new Error("Each shift select needs one associated label");
            return [...element.labels[0].childNodes]
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent)
              .join("")
              .trim();
          });
          assert.equal(leadingLabel, label);
          assert.deepEqual(
            await control
              .locator("option")
              .evaluateAll((elements) =>
                elements.map((element) => ({ value: element.value, text: element.textContent })),
              ),
            options,
          );
        }
        assert.equal(await controls.name.inputValue(), "Avery Example");
        assert.equal(await controls.role.inputValue(), "ece");
        assert.equal(await controls.room.inputValue(), "preschool");
        assert.equal(await controls.start.inputValue(), "2026-11-18T09:15");
        assert.equal(await controls.end.inputValue(), "2026-11-18T17:45");
        await page.waitForFunction(
          () =>
            document.activeElement ===
            document.querySelector('form[aria-labelledby="staff-shift-form-title"] input'),
        );
        await controls.name.fill("Avery Cancelled");
        await form.getByRole("button", { name: copy.cancelShiftEdit, exact: true }).click();
        await page.waitForFunction(() =>
          document.activeElement?.getAttribute("aria-label")?.endsWith(": Avery Example"),
        );
        assert.deepEqual((await snapshot()).rows, initialRows);
        assert.deepEqual((await snapshot()).saveCalls, []);
        assert.equal(
          await page
            .getByRole("form", { name: copy.shiftTitle, exact: true })
            .getByLabel(copy.name, { exact: true })
            .inputValue(),
          "",
        );

        await edit().click();
        form = editForm();
        controls = fields(form);
        await controls.end.fill("2026-11-18T08:00");
        await form.getByRole("button", { name: copy.saveShiftChanges, exact: true }).click();
        await form.getByRole("alert").waitFor();
        assert.equal(await form.getByRole("alert").innerText(), copy.bad);
        assert.equal(await controls.end.inputValue(), "2026-11-18T08:00");
        assert.deepEqual((await snapshot()).saveCalls, []);
        assert.deepEqual((await snapshot()).rows, initialRows);

        await controls.name.fill("Avery Updated");
        await controls.role.selectOption("assistant");
        await controls.room.selectOption("toddler");
        await controls.start.fill("2026-11-18T10:20");
        await controls.end.fill("2026-11-18T16:50");
        await page.evaluate(() => {
          window.__staffShiftQa.rejectNext = true;
        });
        await form.getByRole("button", { name: copy.saveShiftChanges, exact: true }).click();
        await page.waitForFunction(
          (text) => document.querySelector('[data-ke="shift-notice"]')?.textContent === text,
          copy.shiftNotSaved,
        );
        const retained = [
          await controls.name.inputValue(),
          await controls.role.inputValue(),
          await controls.room.inputValue(),
          await controls.start.inputValue(),
          await controls.end.inputValue(),
        ];
        assert.deepEqual(retained, [
          "Avery Updated",
          "assistant",
          "toddler",
          "2026-11-18T10:20",
          "2026-11-18T16:50",
        ]);
        assert.equal((await snapshot()).saveCalls.length, 1);
        assert.deepEqual((await snapshot()).rows, initialRows);
        await page.evaluate(() => {
          window.__staffShiftQa.holdNextLoad = true;
        });
        await form.getByRole("button", { name: copy.saveShiftChanges, exact: true }).click();
        await page.getByRole("form", { name: copy.shiftTitle, exact: true }).waitFor();
        await page.getByText("Avery Updated", { exact: true }).waitFor();
        const expectedRows = [
          {
            ...initialRows[0],
            staffName: "Avery Updated",
            role: "assistant",
            roomBand: "toddler",
            startsAt: "2026-11-18T15:20:00.000Z",
            endsAt: "2026-11-18T21:50:00.000Z",
          },
          initialRows[1],
        ];
        const saved = await snapshot();
        assert.deepEqual(saved.rows, expectedRows);
        assert.equal(saved.saveCalls.length, 2);
        for (const call of saved.saveCalls) assert.equal(call.id, initialRows[0].id);
        assert.equal(saved.hasPendingLoad, true, "The follow-up list read is deliberately held");
        const updatedEdit = page.getByRole("button", {
          name: `${copy.editShiftTitle}: Avery Updated`,
          exact: true,
        });
        await updatedEdit.click();
        form = editForm();
        controls = fields(form);
        assert.deepEqual(
          [
            await controls.name.inputValue(),
            await controls.role.inputValue(),
            await controls.room.inputValue(),
            await controls.start.inputValue(),
            await controls.end.inputValue(),
          ],
          retained,
          "Reopening before refresh uses the five saved values",
        );
        await form.getByRole("button", { name: copy.cancelShiftEdit, exact: true }).click();
        await page.waitForFunction(() =>
          document.activeElement?.getAttribute("aria-label")?.endsWith(": Avery Updated"),
        );
        assert.equal((await snapshot()).saveCalls.length, 2);
        assert.equal((await snapshot()).hasPendingLoad, true);
        await page.evaluate(() => window.__staffShiftQa.releaseLoad());
        await page.waitForFunction(() => !window.__staffShiftQa.snapshot().hasPendingLoad);
        const previousLoads = saved.listCalls;
        await page.evaluate(() => window.__staffShiftQa.remount());
        await page.waitForFunction(
          (loads) => window.__staffShiftQa.listCalls > loads,
          previousLoads,
        );
        await updatedEdit.waitFor();
        assert.equal(await page.locator("[data-ke=staff-shift-row]").count(), 2);
        assert.deepEqual((await snapshot()).rows, expectedRows);
        await updatedEdit.click();
        form = editForm();
        controls = fields(form);
        assert.deepEqual(
          [
            await controls.name.inputValue(),
            await controls.role.inputValue(),
            await controls.room.inputValue(),
            await controls.start.inputValue(),
            await controls.end.inputValue(),
          ],
          retained,
        );
        for (const element of await form.locator("input,select,button").all()) {
          const bounds = await element.boundingBox();
          assert.ok(
            bounds && bounds.width >= 44 && bounds.height >= 44,
            "Shift controls meet the 44 px touch target",
          );
          assert.ok(
            bounds.x >= -1 && bounds.x + bounds.width <= width + 1,
            "Shift controls fit the viewport",
          );
        }
        assert.equal(
          await form
            .getByRole("button", { name: copy.saveShiftChanges, exact: true })
            .evaluate((element) => element.classList.contains("ke-button")),
          true,
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
        );
        await form.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(out, `staff-shift-edit-${locale}-${width}.png`) });
        assert.deepEqual((await snapshot()).forbiddenServices, []);
        assert.deepEqual(await page.evaluate(() => window.__staffShiftTransportAttempts), []);
        assert.deepEqual(pageErrors, []);
        results.push({
          locale,
          width,
          prefill: true,
          cancelNoWriteAndFocusReturn: true,
          invalidRetainedNoCall: true,
          rejectedSaveRetained: true,
          retryUpdatesSameIdAndCount: true,
          updatedWhileReadHeld: true,
          freshComponentRemount: true,
          minTouchTarget: 44,
          noOverflow: true,
          saveCalls: 2,
        });
      } catch (error) {
        if (page && !page.isClosed()) {
          try {
            await page.screenshot({
              path: join(out, `staff-shift-failure-${locale}-${width}.png`),
              fullPage: true,
            });
          } catch (captureError) {
            throw new AggregateError(
              [error, captureError],
              "Shift acceptance and failure screenshot both failed",
            );
          }
        }
        throw error;
      } finally {
        await context.close();
      }
    }
} catch (error) {
  failure = error;
} finally {
  try {
    await browser?.close();
    for (const item of provenance)
      assert.equal(
        digest(join(root, item.path)).sha256,
        item.sha256,
        `Source changed during shift QA: ${item.path}`,
      );
    assert.deepEqual(metrics.forbiddenImports, []);
    assert.deepEqual(metrics.browserTransports, []);
    assert.deepEqual(metrics.nodeFetchAttempts, []);
    assert.deepEqual(metrics.pageErrors, []);
    metrics.processGuard = guard
      ? guardStatus()
      : { mode: "local-deny-fetch", attempts: metrics.nodeFetchAttempts.length };
    if (!failure) assert.equal(results.length, 4);
  } catch (error) {
    failure ??= error;
  } finally {
    if (!guard) globalThis.fetch = previousFetch;
  }
  await mkdir(out, { recursive: true });
  await writeFile(
    join(out, "results.json"),
    JSON.stringify(
      {
        ok: !failure,
        ...(failure ? { error: String(failure) } : {}),
        scope:
          "Actual StaffSchedulingDesk and shared Button; synthetic in-memory rows and fresh component remount; no database or page reload",
        results,
        provenance,
        metrics,
      },
      null,
      2,
    ) + "\n",
  );
}
if (failure) throw failure;
console.log(
  JSON.stringify({
    ok: true,
    cases: results.length,
    artifacts: relative(root, out),
    processGuard: metrics.processGuard,
  }),
);
