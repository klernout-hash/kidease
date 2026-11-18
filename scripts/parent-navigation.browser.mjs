import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import ts from "typescript";

// Explicit test allowlist: this file and parent-navigation.tsx only. No aggregate
// runner, account credentials, app API transport or financial fixture is used.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "artifacts/parent-navigation");
const logicOnly = process.argv.includes("--wrapper-regression-only");
const forbidden =
  /stripe|\/billing|\/payments?(?:[./?]|$)|\/bill\.ts|\/upgrade-(?:role|plans)|parent-home\.(?:mjs)|parent-home-preview/i;
const boundary = {
  "@/lib/server/child-checkin":
    "export const listMyChildAttendance=()=>window.parentNavigationFixture.request('attendance');",
  "@/lib/server/daily-care":
    "export const listDailyJournals=(input)=>window.parentNavigationFixture.request('journal',input);",
  "@/lib/server/desk-features": "export const loadDeskFeatureFlags=async()=>({dailyLogs:true});",
  "@/lib/timeout":
    "export {withTimeout} from '/src/lib/timeout.ts'; export const LOADER_SETTLE_MS=750;",
};
async function selectedDeclarations(path, names, imports = "") {
  const source = ts.createSourceFile(
    path,
    await readFile(join(root, path), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const selected = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node)
      ? names.includes(node.name?.text)
      : ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) && names.includes(declaration.name.text),
        ),
  );
  assert.equal(
    selected.length,
    names.length,
    `Selected production declarations changed in ${path}`,
  );
  return ts.transpileModule(imports + selected.map((node) => node.getText(source)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
// Read only the actual care strings. Importing the full copy modules also loads
// unrelated plan helpers, outside this fixture's nonfinancial module allowlist.
async function careCopy(locale) {
  const path = `src/lib/copy-${locale}.ts`;
  const source = ts.createSourceFile(
    path,
    await readFile(join(root, path), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === locale);
  let object = declaration?.initializer;
  while (object && (ts.isAsExpression(object) || ts.isSatisfiesExpression(object)))
    object = object.expression;
  assert.ok(
    object && ts.isObjectLiteralExpression(object),
    `Actual ${locale} copy must remain an object`,
  );
  return Object.fromEntries(
    ["careNoArrivalConfirmed", "careAttendanceUpdated", "careCentreStaff"].map((key) => {
      const property = object.properties.find(
        (node) => ts.isPropertyAssignment(node) && node.name.getText(source) === key,
      );
      assert.ok(
        property && ts.isStringLiteral(property.initializer),
        `Missing literal ${locale}.${key}`,
      );
      return [key, property.initializer.text];
    }),
  );
}
const careTranslations = { en: await careCopy("en"), fr: await careCopy("fr") };
boundary["@/lib/use-copy"] = `const copy=${JSON.stringify(careTranslations)};
export function useCopy(){const locale=document.documentElement.lang==='fr'?'fr':'en';return {locale,t:(key)=>{if(!(key in copy[locale]))throw new Error('Out-of-scope copy key: '+key);return copy[locale][key]}}}`;
boundary["@/lib/attendance-handoff"] = await selectedDeclarations("src/lib/attendance-handoff.ts", [
  "ATTENDANCE_COPY",
  "attendanceCopy",
]);
boundary["@/lib/daily-care"] = await selectedDeclarations("src/lib/daily-care.ts", [
  "isEnrolledBookingStatus",
]);
// Keep the actual locale helper without importing unrelated desk permissions.
const deskSource = ts.createSourceFile(
  "desk-nav.ts",
  await readFile(join(root, "src/lib/desk-nav.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const deskPath = deskSource.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "parentDeskPath",
);
assert.ok(deskPath);
boundary["@/lib/desk-nav"] = ts.transpileModule(
  `import {isFrPath} from '/src/lib/locale-path.ts';\n${deskPath.getText(deskSource)}`,
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const results = [];
const captures = [];
const excludedCases = [];
const parentSource = await readFile(join(root, "src/components/parent-desk.tsx"), "utf8");
assert.match(
  parentSource,
  /return loadFamily\(true\);/,
  "Each parent mount must request fresh family data rather than adopt an abandoned pending read",
);
const parentTree = ts.createSourceFile(
  "parent-desk.tsx",
  parentSource,
  ts.ScriptTarget.Latest,
  true,
);
const parentDesk = parentTree.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "ParentDesk",
);
const selectionWrapper = parentDesk?.body?.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "selectTab",
);
assert.ok(
  selectionWrapper,
  "Select the actual ParentDesk navigation wrapper, without importing its module graph",
);
const selectionWrapperSource = selectionWrapper.getText(parentTree);
boundary["virtual:parent-select-wrapper"] = ts.transpileModule(
  `export function bindParentSelection({tab, discardChildEdits, setEditing, selectParentTab}) {
    ${selectionWrapperSource}
    return selectTab;
  }`,
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const requests = [];
let stylesheet = null;
let css = "";
if (!logicOnly) {
  const styles = await readdir(join(root, ".vercel/output/static/assets"));
  stylesheet = styles.find((name) => /^styles-.*\.css$/.test(name));
  assert.ok(
    stylesheet,
    "Synthetic UI screenshots require compiled app styles; run the clean build first",
  );
  css = await readFile(join(root, ".vercel/output/static/assets", stylesheet), "utf8");
}
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  cacheDir: join(output, "vite-cache"),
  optimizeDeps: {
    noDiscovery: true,
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-router",
    ],
  },
  logLevel: "error",
  resolve: { alias: { "@": join(root, "src") } },
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [
    {
      name: "nonfinancial-parent-navigation-fixture",
      enforce: "pre",
      resolveId(id, importer) {
        if (forbidden.test(id)) throw new Error(`Forbidden fixture module: ${id}`);
        const resolved = id.startsWith(".") && importer ? resolvePath(dirname(importer), id) : id;
        const key = Object.keys(boundary).find(
          (key) => id === key || resolved.replace(/\.ts$/, "") === join(root, "src", key.slice(2)),
        );
        if (key) return `\0parent-navigation:${key}`;
      },
      load(id) {
        if (id.startsWith("\0parent-navigation:"))
          return boundary[id.slice("\0parent-navigation:".length)];
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url, "http://127.0.0.1");
          if (url.pathname.startsWith("/api") || forbidden.test(url.pathname + url.search)) {
            response.writeHead(403).end("Forbidden in nonfinancial fixture");
            return;
          }
          if (url.pathname === "/fixture.css") {
            response.setHeader("content-type", "text/css");
            response.end(css);
            return;
          }
          if (url.pathname !== "/parent") {
            next();
            return;
          }
          const locale = url.searchParams.get("locale") === "fr" ? "fr" : "en";
          const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Synthetic parent navigation test</title><link rel="stylesheet" href="/fixture.css"><style>body{padding:1rem}main{max-width:60rem;margin:auto}.fixture-controls{display:flex;flex-wrap:wrap;gap:1rem}main>p{margin-top:1rem}button{border:1px solid;padding:.5rem}</style></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/parent-navigation.tsx"></script></body></html>`;
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(await vite.transformIndexHtml(url.pathname, html));
        });
      },
    },
  ],
});
let browser;
await mkdir(output, { recursive: true });
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    ...(process.platform === "darwin" &&
    existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
      ? { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }
      : {}),
    headless: true,
    args: ["--disable-background-networking"],
  });
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    requests.push(url.origin + url.pathname);
    if (
      url.origin !== origin ||
      url.pathname.startsWith("/api") ||
      forbidden.test(url.pathname + url.search)
    )
      return route.abort();
    return route.continue();
  });
  async function run(name, check, initialTab = "explore", locale = "en") {
    if (logicOnly && !name.startsWith("actual wrapper")) {
      excludedCases.push(name);
      return;
    }
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/parent?tab=${initialTab}&locale=${locale}`, { waitUntil: "load" });
      assert.equal(await page.locator("html").getAttribute("lang"), locale);
      await page.locator('main[data-viewer="synthetic-a"]').waitFor({ timeout: 5000 });
      await check(page);
      assert.deepEqual(errors, [], "Unexpected browser errors");
      results.push({ name, locale, passed: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, locale, passed: false, error: error.message, browserErrors: errors });
      console.log(`FAIL ${name}: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await page.close();
    }
  }
  const pending = (page, kind) =>
    page.evaluate(
      (kind) => window.parentNavigationFixture.pending().filter((item) => item.kind === kind),
      kind,
    );
  const resolve = (page, id, value) =>
    page.evaluate(({ id, value }) => window.parentNavigationFixture.resolve(id, value), {
      id,
      value,
    });
  const waitFor = (page, expression, arg) =>
    page.waitForFunction(expression, arg, { timeout: 5000 });
  const settleYields = async (page) => {
    for (const item of (await pending(page, "yield")).reverse()) await resolve(page, item.id);
  };
  const attendance = (viewer) => ({
    enabled: true,
    children: [
      {
        bookingId: `booking-${viewer}`,
        childName: viewer === "synthetic-a" ? "Synthetic Avery" : "Synthetic Quinn",
        daycareName: "Synthetic centre",
        localDay: "2026-11-18",
        timeZone: "America/Winnipeg",
        status: "here",
        events: [{ id: `event-${viewer}`, action: "check_in", at: "2026-11-18T14:00:00Z" }],
        lastUpdated: null,
      },
    ],
  });
  const journal = (viewer, body) => ({
    items: [
      {
        id: `note-${viewer}`,
        bookingId: `booking-${viewer}`,
        daycareId: "synthetic-centre",
        day: "2026-11-18",
        createdAt: "2026-11-18T15:00:00Z",
        body,
      },
    ],
  });

  await run("actual wrapper cancels same-turn A→B→A before React commits B", async (page) => {
    await page.evaluate(() => {
      window.parentNavigationFixture.gate("care");
      document.querySelector('[data-tab="care"]').click();
      document.querySelector('[data-tab="explore"]').click();
    });
    // The return to A may cancel B before its gated loader even starts.
    assert.deepEqual(
      await page.evaluate(() => window.parentNavigationFixture.navigations),
      ["care", "explore"],
      "The actual wrapper must deliver the return to A even while its rendered tab is still A",
    );
    for (const route of await pending(page, "route")) await resolve(page, route.id, {});
    await settleYields(page);
    await waitFor(
      page,
      () =>
        document.querySelector("main")?.dataset.activeTab === "explore" &&
        document.querySelector("main")?.dataset.contentTab === "explore",
    );
    assert.equal(new URL(page.url()).searchParams.get("tab"), "explore");
  });
  const prepareDraft = async (page, allowDiscard) => {
    await page.evaluate(
      (allow) => window.parentNavigationFixture.api().prepareDraft(allow),
      allowDiscard,
    );
    await waitFor(
      page,
      () => window.parentNavigationFixture.api().draftState().editing === "synthetic-draft",
    );
  };
  await run(
    "actual wrapper retains an unchanged-tab dirty draft without prompting or resetting",
    async (page) => {
      await prepareDraft(page, false);
      await page.evaluate(() => document.querySelector('[data-tab="explore"]').click());
      assert.deepEqual(
        await page.evaluate(() => window.parentNavigationFixture.api().draftState()),
        {
          dirty: true,
          editing: "synthetic-draft",
          discardChecks: 0,
          confirmations: 0,
        },
      );
      assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.navigations), []);
      assert.equal((await pending(page, "yield")).length, 0);
    },
  );
  await run(
    "actual wrapper keeps a rejected cross-tab departure and draft unchanged",
    async (page) => {
      await prepareDraft(page, false);
      await page.evaluate(() => document.querySelector('[data-tab="saved"]').click());
      assert.deepEqual(
        await page.evaluate(() => window.parentNavigationFixture.api().draftState()),
        {
          dirty: true,
          editing: "synthetic-draft",
          discardChecks: 1,
          confirmations: 1,
        },
      );
      assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.navigations), []);
      assert.equal((await pending(page, "yield")).length, 0);
      assert.equal(new URL(page.url()).searchParams.get("tab"), "explore");
    },
  );
  await run(
    "actual wrapper clears an accepted dirty draft and delivers the new selection",
    async (page) => {
      await prepareDraft(page, true);
      await page.evaluate(() => document.querySelector('[data-tab="saved"]').click());
      await settleYields(page);
      await waitFor(
        page,
        () =>
          document.querySelector("main")?.dataset.activeTab === "saved" &&
          document.querySelector("main")?.dataset.contentTab === "saved",
      );
      assert.deepEqual(
        await page.evaluate(() => window.parentNavigationFixture.api().draftState()),
        {
          dirty: false,
          editing: null,
          discardChecks: 1,
          confirmations: 1,
        },
      );
      assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.navigations), [
        "saved",
      ]);
      assert.equal(new URL(page.url()).searchParams.get("tab"), "saved");
    },
  );

  await run(
    "interrupted saved then care keeps the latest URL, highlight and panel",
    async (page) => {
      await page.evaluate(() => {
        const fixture = window.parentNavigationFixture;
        fixture.gate("saved");
        fixture.gate("care");
        document.querySelector('[data-tab="saved"]').click();
        document.querySelector('[data-tab="care"]').click();
      });
      await waitFor(page, () =>
        window.parentNavigationFixture
          .pending()
          .some((item) => item.kind === "route" && item.input === "care"),
      );
      const routes = await pending(page, "route");
      await resolve(page, routes.find((item) => item.input === "care").id, {});
      await waitFor(page, () => document.querySelector("main")?.dataset.contentTab === "care");
      for (const item of routes.filter((item) => item.input !== "care"))
        await resolve(page, item.id, {});
      await settleYields(page);
      await waitFor(
        page,
        () =>
          document.querySelector("main")?.dataset.activeTab === "care" &&
          document.querySelector("main")?.dataset.contentTab === "care",
      );
      assert.equal(new URL(page.url()).searchParams.get("tab"), "care");
    },
  );
  await run(
    "A→B→A cancels pending departure even while A is still the current URL",
    async (page) => {
      await page.evaluate(() => {
        const fixture = window.parentNavigationFixture;
        fixture.gate("care");
        document.querySelector('[data-tab="care"]').click();
      });
      await waitFor(page, () =>
        window.parentNavigationFixture.pending().some((item) => item.kind === "route"),
      );
      await page.evaluate(() => document.querySelector('[data-tab="explore"]').click());
      const route = (await pending(page, "route"))[0];
      await resolve(page, route.id, {});
      await settleYields(page);
      await waitFor(page, () => document.querySelector("main")?.dataset.contentTab === "explore");
      assert.equal(new URL(page.url()).searchParams.get("tab"), "explore");
      assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.navigations), [
        "care",
        "explore",
      ]);
    },
  );
  await run(
    "repeated clicks do not enqueue duplicate navigation or deferred work",
    async (page) => {
      await page.evaluate(() => {
        const fixture = window.parentNavigationFixture;
        fixture.gate("saved");
        document.querySelector('[data-tab="saved"]').click();
        document.querySelector('[data-tab="saved"]').click();
        document.querySelector('[data-tab="saved"]').click();
      });
      assert.equal((await pending(page, "yield")).length, 1);
      assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.navigations), [
        "saved",
      ]);
      await waitFor(page, () =>
        window.parentNavigationFixture.pending().some((item) => item.kind === "route"),
      );
      await resolve(page, (await pending(page, "route"))[0].id, {});
      await settleYields(page);
      await waitFor(page, () => document.querySelector("main")?.dataset.contentTab === "saved");
    },
  );
  await run("a URL-driven tab change invalidates an older deferred click", async (page) => {
    await page.evaluate(() => {
      window.parentNavigationFixture.gate("saved");
      document.querySelector('[data-tab="saved"]').click();
    });
    await page.evaluate(() => window.parentNavigationFixture.api().navigate("care"));
    await waitFor(page, () => document.querySelector("main")?.dataset.contentTab === "care");
    for (const route of await pending(page, "route")) await resolve(page, route.id, {});
    await settleYields(page);
    await waitFor(
      page,
      () =>
        document.querySelector("main")?.dataset.activeTab === "care" &&
        document.querySelector("main")?.dataset.contentTab === "care",
    );
  });
  await run(
    "repeated reads reject late success and late failure from a replaced request",
    async (page) => {
      await page.evaluate(() => {
        void window.parentNavigationFixture.api().read("family");
        void window.parentNavigationFixture.api().read("family");
      });
      const reads = await pending(page, "data");
      await resolve(page, reads[1].id, "newer-result");
      await resolve(page, reads[0].id, "stale-result");
      await page.evaluate(() => {
        void window.parentNavigationFixture.api().read("search");
        void window.parentNavigationFixture.api().read("search");
      });
      const search = await pending(page, "data");
      await resolve(page, search[1].id, "newer-search");
      await page.evaluate((id) => window.parentNavigationFixture.reject(id), search[0].id);
      assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.events), [
        "accepted:newer-result",
        "accepted:newer-search",
      ]);
      assert.equal(await page.getByTestId("read-result").innerText(), "newer-search");
    },
  );
  await run(
    "a superseding refresh failure is visible while a stale boot failure stays ignored",
    async (page) => {
      await page.evaluate(() => {
        window.parentNavigationFixture.api().homeRead("boot");
        window.parentNavigationFixture.api().homeRead("refresh");
      });
      let reads = await pending(page, "home-read");
      await resolve(page, reads.find((item) => item.input === "refresh").id, "newer-home");
      await page.evaluate(
        (id) => window.parentNavigationFixture.reject(id),
        reads.find((item) => item.input === "boot").id,
      );
      assert.equal(await page.getByTestId("read-result").innerText(), "newer-home");
      await page.evaluate(() => {
        window.parentNavigationFixture.api().homeRead("boot");
        window.parentNavigationFixture.api().homeRead("refresh");
      });
      reads = await pending(page, "home-read");
      await page.evaluate(
        (id) => window.parentNavigationFixture.reject(id),
        reads.find((item) => item.input === "refresh").id,
      );
      await page.getByTestId("read-result").filter({ hasText: "error" }).waitFor();
      await resolve(page, reads.find((item) => item.input === "boot").id, "obsolete-boot");
      assert.equal(await page.getByTestId("read-result").innerText(), "error");
    },
  );
  await run("account A→B→A cannot revive a request from the first A mount", async (page) => {
    await page.evaluate(() => {
      void window.parentNavigationFixture.api().read("family", true);
    });
    const old = (await pending(page, "data"))[0];
    await page.evaluate(() => window.parentNavigationFixture.account("synthetic-b"));
    await page.locator('main[data-viewer="synthetic-b"]').waitFor();
    await page.evaluate(() => window.parentNavigationFixture.account("synthetic-a"));
    await page.locator('main[data-viewer="synthetic-a"]').waitFor();
    await resolve(page, old.id, "old-A");
    assert.equal((await pending(page, "continuation")).length, 0);
    assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.events), []);
    await page.evaluate(() => {
      void window.parentNavigationFixture.api().read("family");
    });
    await resolve(page, (await pending(page, "data"))[0].id, "current-A");
    assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.events), [
      "accepted:current-A",
    ]);
  });
  await run(
    "a fresh A mount replaces abandoned A cache work and keeps its newer result",
    async (page) => {
      const old = (await pending(page, "mount-family"))[0];
      await page.evaluate(() => window.parentNavigationFixture.account("synthetic-b"));
      await page.locator('main[data-viewer="synthetic-b"]').waitFor();
      await page.evaluate(() => window.parentNavigationFixture.account("synthetic-a"));
      await page.locator('main[data-viewer="synthetic-a"]').waitFor();
      const reads = (await pending(page, "mount-family")).filter(
        (item) => item.viewer === "synthetic-a",
      );
      assert.equal(
        reads.length,
        2,
        "The second A mount must issue its own read rather than adopt old A's promise",
      );
      const current = reads.find((item) => item.id !== old.id);
      await resolve(page, current.id, "current-A-mount");
      await page.getByTestId("mount-result").filter({ hasText: "current-A-mount" }).waitFor();
      await resolve(page, old.id, "abandoned-A-mount");
      assert.equal(await page.getByTestId("mount-result").innerText(), "current-A-mount");
      assert.equal(
        await page.evaluate(() => window.parentNavigationFixture.api().cachedResult()),
        "current-A-mount",
      );
    },
  );
  await run(
    "signout with an unresolved read prevents later continuation and family content",
    async (page) => {
      await page.evaluate(() => {
        void window.parentNavigationFixture.api().read("family", true);
      });
      const old = (await pending(page, "data"))[0];
      await page.evaluate(() => window.parentNavigationFixture.account(undefined));
      await page.locator('[data-testid="signed-out"]').waitFor();
      await resolve(page, old.id, "stale-private-result");
      assert.equal((await pending(page, "continuation")).length, 0);
      assert.equal(await page.locator("[data-viewer]").count(), 0);
      assert.deepEqual(await page.evaluate(() => window.parentNavigationFixture.events), []);
    },
  );
  await run(
    "leaving care before attendance resolves prevents a journal request",
    async (page) => {
      const old = (await pending(page, "attendance"))[0];
      await page.evaluate(() => document.querySelector('[data-tab="saved"]').click());
      await waitFor(page, () => document.querySelector("main")?.dataset.contentTab === "saved");
      await resolve(page, old.id, attendance("synthetic-a"));
      await page.waitForTimeout(30);
      assert.equal((await pending(page, "journal")).length, 0);
      assert.equal(await page.locator('[data-ke="parent-home-care"]').count(), 0);
    },
    "care",
  );
  await run(
    "care timeout rejects late attendance without starting another read",
    async (page) => {
      const old = (await pending(page, "attendance"))[0];
      await page.getByRole("alert").waitFor();
      await resolve(page, old.id, attendance("synthetic-a"));
      await page.waitForTimeout(30);
      assert.equal((await pending(page, "journal")).length, 0);
      assert.equal(await page.getByRole("button", { name: "Try again" }).count(), 1);
    },
    "care",
  );
  for (const locale of ["en", "fr"]) {
    await run(
      "account switch suppresses an older care note after the new account succeeds" +
        (locale === "fr" ? " · FR" : ""),
      async (page) => {
        await resolve(page, (await pending(page, "attendance"))[0].id, attendance("synthetic-a"));
        await waitFor(page, () =>
          window.parentNavigationFixture.pending().some((item) => item.kind === "journal"),
        );
        const old = (await pending(page, "journal"))[0];
        await page.evaluate(() => window.parentNavigationFixture.account("synthetic-b"));
        await page.locator('main[data-viewer="synthetic-b"]').waitFor();
        const currentAttendance = attendance("synthetic-b");
        currentAttendance.children[0].lastUpdated = { name: null, at: "2026-11-18T14:00:00Z" };
        await resolve(page, (await pending(page, "attendance"))[0].id, currentAttendance);
        await waitFor(
          page,
          () =>
            window.parentNavigationFixture.pending().filter((item) => item.kind === "journal")
              .length === 2,
        );
        const current = (await pending(page, "journal")).find(
          (item) => item.viewer === "synthetic-b",
        );
        await resolve(page, current.id, journal("synthetic-b", "Synthetic current-B note"));
        await page.getByText("Synthetic current-B note", { exact: true }).waitFor();
        await resolve(page, old.id, journal("synthetic-a", "Synthetic stale-A note"));
        assert.equal(await page.getByText("Synthetic stale-A note", { exact: true }).count(), 0);
        assert.equal(await page.locator("main").getAttribute("data-locale"), locale);
        const care = page.locator('[data-ke="parent-home-care"]');
        assert.equal(await care.getAttribute("aria-busy"), "false");
        assert.equal(
          await care.locator("h2").innerText(),
          locale === "fr" ? "La journée de votre enfant" : "Your child's day",
        );
        assert.equal(
          await care.locator('[data-ke="parent-home-care-status"]').innerText(),
          locale === "fr" ? "Ici" : "Here",
        );
        assert.ok((await care.innerText()).includes(careTranslations[locale].careCentreStaff));
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          await page.evaluate(() => document.fonts.ready);
          const action = care.getByRole("link");
          await action.focus();
          const layout = await action.evaluate((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
              documentLocale: document.documentElement.lang,
              overflow: document.documentElement.scrollWidth > innerWidth,
              controlWidth: rect.width,
              controlHeight: rect.height,
              focusVisible: style.outlineStyle !== "none" || style.boxShadow !== "none",
            };
          });
          assert.equal(layout.documentLocale, locale);
          assert.equal(layout.overflow, false);
          assert.ok(layout.controlWidth >= 44 && layout.controlHeight >= 44);
          assert.equal(layout.focusVisible, true);
          await action.evaluate((el) => el.blur());
          const screenshot = `care-account-B-${locale === "fr" ? "fr-" : ""}${width}.png`;
          await page.screenshot({ path: join(output, screenshot), fullPage: true });
          captures.push({ locale, width, screenshot, component: "ParentHomeCare", ...layout });
        }
      },
      "care",
      locale,
    );
  }
  assert.equal(
    requests.filter((url) => new URL(url).pathname.startsWith("/api") || forbidden.test(url))
      .length,
    0,
    "No forbidden transport/module was requested",
  );
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
await writeFile(
  join(output, logicOnly ? "wrapper-logic-results.json" : "results.json"),
  JSON.stringify(
    {
      synthetic: true,
      logicOnly,
      excludedCases,
      selectionWrapperSource,
      results,
      captures,
      compiledStylesheet: stylesheet,
      copySources: [
        "src/lib/copy-en.ts",
        "src/lib/copy-fr.ts",
        "src/lib/attendance-handoff.ts",
        "src/components/parent-home-care.tsx",
      ],
      requestedModules: requests,
      limitations:
        "Real React and TanStack Router run the extracted production navigation/request hooks, the verbatim ParentDesk selectTab wrapper and actual ParentHomeCare. Logic-only mode runs only the four wrapper regressions and emits no visual captures. ParentDesk as a whole is intentionally not mounted because it eagerly reads financial extras; financial routes/modules and all app APIs are forbidden. Generic read tests exercise the production request lifetime hook, not getFamily's server behavior. No real accounts, family records, database, authentication, financial flows, or messages are used.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      logicOnly,
      excludedCases: excludedCases.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      output,
    },
    null,
    2,
  ),
);
