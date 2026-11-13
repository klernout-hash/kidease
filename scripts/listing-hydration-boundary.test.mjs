import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory, createRootRoute, createRoute, createRouter,
  lazyRouteComponent, notFound, Outlet, RouterProvider,
} from "@tanstack/react-router";
import { compileCodeSplitReferenceRoute } from "../node_modules/@tanstack/router-plugin/dist/esm/core/code-splitter/compilers.js";
import { transformRouteModule } from "./route-ui-split.mjs";

// Exercise the installed compiler and Router with actual route options. The
// screen bodies are synthetic, so these tests never read centre or auth data.
const Listing = () => createElement("div", { "data-fixture": "shell" }, "Listing content");
const Retry = () => createElement("div", { "data-fixture": "retry" }, "Try again");
const Missing = () => createElement("div", { "data-fixture": "missing" }, "Search again");

function evaluateOptions(code, filename) {
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => node.name.getText(source) === "Route");
  const object = declaration?.initializer?.arguments?.[0];
  assert.ok(object && ts.isObjectLiteralExpression(object), "Execute the actual compiled Route options");
  const javascript = ts.transpileModule(`globalThis.options = (${object.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext({
    Listing, ListingRetryPage: Retry, ListingNotFoundPage: Missing, lazyRouteComponent,
    $$splitComponentImporter: async () => ({ component: Listing }),
    $$splitErrorComponentImporter: async () => ({ errorComponent: Retry }),
    $$splitNotFoundComponentImporter: async () => ({ notFoundComponent: Missing }),
  });
  new vm.Script(javascript, { filename }).runInContext(context);
  return context.options;
}

function routeOptions(route, environment) {
  const filename = new URL(`../src/routes/${route}`, import.meta.url).pathname;
  const original = readFileSync(filename, "utf8");
  const code = environment === "client" ? transformRouteModule(original, filename) : original;
  const compiled = compileCodeSplitReferenceRoute({
    filename, id: filename, targetFramework: "react", code,
    codeSplitGroupings: [["component"], ["pendingComponent"], ["errorComponent"], ["notFoundComponent"]],
  }).code;
  return evaluateOptions(compiled, filename);
}

async function render(options, outcome = "success") {
  const root = createRootRoute({ component: Outlet });
  const detail = createRoute({
    getParentRoute: () => root, path: "/detail",
    component: options.component, errorComponent: options.errorComponent,
    notFoundComponent: options.notFoundComponent, wrapInSuspense: options.wrapInSuspense,
    loader: () => {
      if (outcome === "error") throw new Error("Synthetic listing read failure");
      if (outcome === "missing") throw notFound();
      return { synthetic: true };
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ["/detail"] }), isServer: true,
  });
  await router.load();
  const html = renderToString(createElement(RouterProvider, { router }));
  return { html, pairs: (html.match(/<!--\$-->/g) ?? []).length };
}

for (const route of ["daycare.$slug.tsx", "fr.daycare.$slug.tsx"]) {
  test(`${route}: actual server/client route options preserve the same listing boundary`, async () => {
    const server = routeOptions(route, "server");
    const client = routeOptions(route, "client");
    if (route === "daycare.$slug.tsx") {
      assert.equal(typeof server.errorComponent.preload, "undefined", "SSR retains the exported error screen");
      assert.equal(typeof client.errorComponent.preload, "function", "Client splitting makes the error screen lazy");
    }
    const serverRender = await render(server);
    const clientRender = await render(client);
    assert.equal(serverRender.pairs, 2, "Server must emit the detail boundary before client hydration");
    assert.equal(clientRender.html, serverRender.html, "Lazy error UI must not add a client-only Suspense boundary");
    assert.match(serverRender.html, /data-fixture="shell">Listing content/);
  });

  test(`${route}: the matching boundary retains listing error and missing states`, async () => {
    for (const [outcome, fixture, text] of [["error", "retry", "Try again"], ["missing", "missing", "Search again"]]) {
      const server = await render(routeOptions(route, "server"), outcome);
      const client = await render(routeOptions(route, "client"), outcome);
      assert.equal(client.html, server.html);
      assert.match(server.html, new RegExp(`data-fixture="${fixture}">${text}`));
      assert.doesNotMatch(server.html, /Listing content/);
    }
  });
}
