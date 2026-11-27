import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { localeFromSearch, readLocaleCookie } from "../src/lib/locale-geo.ts";
import { afterBrowserInstrumentation } from "../src/lib/sentry-browser-start.ts";

// Execute the real client entry while controlling the French copy download.
// No document requests, SDK initialization, or saved browser state.
const entry = ts.transpileModule(
  readFileSync(new URL("../src/client.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  },
).outputText;

function boot({
  path = "/provider/data-requests",
  search = "",
  lang = "en-CA",
  cookie = "",
  stored = null,
} = {}) {
  const events = [];
  let copyLoaded;
  const download = new Promise((resolve) => {
    copyLoaded = resolve;
  });
  const mods = {
    "./lib/zod-csp": { installZodCsp: () => {} },
    "./instrument.client": { instrumentationReady: null },
    "@tanstack/react-start/client": { StartClient: () => null },
    react: { startTransition: (run) => run() },
    "react/jsx-runtime": { jsx: () => null },
    "react-dom/client": { hydrateRoot: () => events.push("hydrate") },
    "./lib/server-fn-client": { installServerFnFetchGate: () => {} },
    "./lib/copy-runtime": {
      ensureFrenchCopy: () => {
        events.push("load french");
        return download;
      },
    },
    "./lib/locale-geo": { localeFromSearch, readLocaleCookie },
    "./lib/sentry-browser-start": { afterBrowserInstrumentation },
  };
  runInNewContext(entry, {
    exports: {},
    require: (id) => {
      assert.ok(Object.hasOwn(mods, id), `unexpected dependency: ${id}`);
      return mods[id];
    },
    document: { cookie, documentElement: { lang } },
    window: { location: { pathname: path, search }, localStorage: { getItem: () => stored } },
  });
  return { events, copyLoaded };
}

for (const [label, signals] of [
  ["a fresh private-desk French link", { search: "?lang=fr" }],
  ["server-selected French without a client preference", { lang: "fr-CA" }],
  ["a French route", { path: "/fr/faq" }],
  ["a saved French choice", { cookie: "kidease-locale=fr" }],
]) {
  test(`French copy is ready before hydration for ${label}`, async () => {
    const { events, copyLoaded } = boot(signals);
    assert.deepEqual(events, ["load french"]);
    copyLoaded();
    await new Promise(setImmediate);
    assert.deepEqual(events, ["load french", "hydrate"]);
  });
}

test("English hydration does not request the French pack", () => {
  assert.deepEqual(boot({ search: "?lang=en" }).events, ["hydrate"]);
});
