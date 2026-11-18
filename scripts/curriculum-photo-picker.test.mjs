import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { clientNodeBuiltinStub } from "./client-node-stub.mjs";
import { curriculumUi } from "../src/lib/curriculum/text.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts/curriculum-photo-authorization");
const fixture = join(artifacts, "picker-fixture");

// Only the curriculum component is loaded. Every server entry is a local,
// synthetic fixture, and all requests outside this loopback server are blocked.
const serverFixture = `
const state = window.__curriculumPickerFixture = { uploads: [], saves: [], stories: [
  { id: 'story-b', childId: 'child-b', title: 'Synthetic child B story' },
  { id: 'story-a-old', childId: 'child-a', title: 'Synthetic older child A story' },
  { id: 'story-a-new', childId: 'child-a', title: 'Synthetic newer child A story' }
] };
export async function loadCurriculumDesk({data} = {}) {
  const daycareId = data?.daycareId || 'centre-a';
  return {
    enabled: true, flags: { pack: true, live: true, stories: false, mode: 'live' },
    daycareId, province: 'ON',
    centres: [{ id: 'centre-a', name: 'Synthetic centre A' }, { id: 'centre-b', name: 'Synthetic centre B' }],
    children: [{id:'child-a',name:'Synthetic child A',bookingId:'booking-a'}, {id:'child-b',name:'Synthetic child B',bookingId:'booking-b'}],
    stories: state.stories.map(s => ({...s})),
    framework: {url:'#framework', name:'Synthetic framework', credit:'Fixture', requirementStatus:'confirmed'},
    goals: [{id:'ON-belong',theme:'belong',credit:'Fixture'}], docs: [], activities: [], plans: []
  };
}
export async function attachCurriculumPhoto({data}) { state.uploads.push(data); return {ok:true}; }
export async function saveCurriculumStory({data}) {
  state.saves.push(data);
  const id = 'story-just-saved';
  state.stories.unshift({id,childId:data.childId,title:data.title});
  return {ok:true,id,status:'published',ideas:[]};
}
export async function curriculumStatus() { return {pack:true}; }
export async function curriculumCoverage() { return {}; }
export async function grantCurriculumPhotoConsent() { return {ok:true}; }
export async function listCurriculumTimeline() { return {enabled:false,stories:[]}; }
export async function listStoryCorner() { return {enabled:false,books:[]}; }
export async function openStoryCornerFile() { throw new Error('Out of picker scope'); }
export async function replyToCurriculumStory() { throw new Error('Out of picker scope'); }
export async function governmentCurriculumTotals() { throw new Error('Out of picker scope'); }
export async function saveCurriculumPlan() { throw new Error('Out of picker scope'); }
`;
const virtual = {
  "@/lib/server/curriculum-pack": serverFixture,
  "@/lib/use-copy":
    "export function useCopy(){return {locale:document.documentElement.lang==='fr'?'fr':'en'};}",
  sonner:
    "export const toast = {success(){},error(e){window.__curriculumPickerFixture.error=String(e);}};",
  "@tanstack/react-router":
    "import {createElement} from 'react'; export const Link=({to,children,...p})=>createElement('a',{href:to,...p},children);",
};

// Only these reviewed application modules may enter the synthetic client graph.
const allowedAppModules = new Set(
  [
    "src/components/curriculum-pack.tsx",
    "src/components/ui/button.tsx",
    "src/components/empty-state.tsx",
    "src/lib/curriculum/text.ts",
    "src/lib/curriculum/pack.ts",
    "src/lib/curriculum/i18n/docs.ts",
    "src/lib/curriculum/i18n/goals.ts",
    "src/lib/curriculum/i18n/play.ts",
    "src/lib/curriculum/i18n/ui.ts",
    "src/lib/gov/k-anonymity.ts",
    "src/lib/story-corner/open-books.ts",
    "src/lib/node-builtin.ts",
    "src/lib/utils.ts",
    "src/lib/html-text.ts",
    "src/lib/languages.ts",
  ].map((file) => join(root, file)),
);
const loadedAppModules = new Set();
function inspectClientModule(id) {
  if (id.startsWith("\0curriculum-picker:")) return;
  const file = id.split("?")[0];
  if (
    /stripe|payment|billing|checkout|refund|parent-plus|upgrade-plans|copy-runtime|copy-en|copy-fr/i.test(
      file,
    ) ||
    /(?:^@\/lib\/|\/src\/lib\/)(?:server|auth)\//.test(file) ||
    /(?:^@\/lib\/|\/src\/lib\/)db(?:\.|$)/.test(file) ||
    /^(?:resend|twilio|nodemailer|web-push|firebase-admin|posthog-node|posthog-js|undici|pg|postgres|kysely|bullmq|ioredis|redis)(?:\/|$)/.test(
      file,
    )
  ) {
    throw new Error("Out-of-scope module in curriculum picker");
  }
  if (file.startsWith(join(root, "src") + "/") && /\.[cm]?[jt]sx?$/.test(file)) {
    if (!allowedAppModules.has(file))
      throw new Error("Unreviewed application module in curriculum picker");
    loadedAppModules.add(file);
  }
}

function fixturePlugin() {
  return {
    name: "curriculum-picker-synthetic-edges",
    enforce: "pre",
    resolveId(id) {
      const fixtureKey = Object.keys(virtual).find(
        (key) =>
          key === id ||
          (key.startsWith("@/") &&
            [join(root, "src", key.slice(2)), join(root, "src", key.slice(2)) + ".ts"].includes(
              id,
            )),
      );
      if (fixtureKey) return `\0curriculum-picker:${fixtureKey}`;
      inspectClientModule(id);
    },
    load(id) {
      const prefix = "\0curriculum-picker:";
      if (id.startsWith(prefix)) return virtual[id.slice(prefix.length)];
    },
    transform(_code, id) {
      inspectClientModule(id);
    },
  };
}

async function value(locator) {
  return locator.inputValue();
}

test(
  "synthetic curriculum picker binds upload to the selected child and exact story",
  { timeout: 90000 },
  async () => {
    await mkdir(fixture, { recursive: true });
    await writeFile(
      join(fixture, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main class="mx-auto w-full max-w-3xl p-4"><p class="mb-4 text-sm">Synthetic component QA · no child photos</p><div id="root"></div></main><script type="module" src="/entry.tsx"></script></body></html>`,
    );
    await writeFile(
      join(fixture, "fixture.css"),
      `@import ${JSON.stringify(join(root, "src/styles.css"))};\n@source ${JSON.stringify(join(root, "src/components/curriculum-pack.tsx"))};\n@source ${JSON.stringify(join(root, "src/components/ui/button.tsx"))};\n@source ${JSON.stringify(join(root, "src/components/empty-state.tsx"))};\n@source "./index.html";`,
    );
    await writeFile(
      join(fixture, "entry.tsx"),
      `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CurriculumPackDesk} from ${JSON.stringify(join(root, "src/components/curriculum-pack.tsx"))}; import './fixture.css'; document.documentElement.lang=new URLSearchParams(location.search).get('locale')==='fr'?'fr':'en'; createRoot(document.getElementById('root')!).render(<CurriculumPackDesk/>);`,
    );
    const runtimeGuard = globalThis[Symbol.for("kidease.private.outbound-guard")];
    const originalFetch = globalThis.fetch;
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    const ownsFetch = !runtimeGuard;
    let standaloneFetchAttempts = 0;
    if (runtimeGuard) {
      assert.equal(runtimeGuard.getStatus().mode, "fixture");
      assert.equal(runtimeGuard.getStatus().violations, 0);
      assert.equal(fetchDescriptor?.writable, false);
      assert.equal(fetchDescriptor?.configurable, false);
    } else {
      assert.equal(fetchDescriptor?.writable, true, "Unknown readonly fetch guard is not accepted");
      globalThis.fetch = () => {
        standaloneFetchAttempts += 1;
        throw new Error("External fetch forbidden in synthetic picker QA");
      };
    }
    let server;
    let httpServer;
    let browser;
    try {
      server = await createServer({
        configFile: false,
        envDir: false,
        root: fixture,
        cacheDir: join(fixture, ".vite-cache"),
        publicDir: join(root, "public"),
        resolve: { alias: { "@": join(root, "src") } },
        plugins: [fixturePlugin(), clientNodeBuiltinStub(), react(), tailwindcss()],
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: false,
          hmr: false,
          ws: false,
          middlewareMode: true,
          fs: { allow: [root] },
        },
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
        httpServer.listen(0, "127.0.0.1", resolve);
      });
      const address = httpServer.address();
      const origin = `http://127.0.0.1:${address.port}`;
      const installedChrome =
        process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      browser = await chromium.launch({
        headless: true,
        ...(existsSync(installedChrome) ? { executablePath: installedChrome } : {}),
      });
      for (const locale of ["en", "fr"]) {
        const externalRequests = [];
        const pageErrors = [];
        const blockedTransports = [];
        const captures = [];
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          locale: `${locale}-CA`,
          serviceWorkers: "block",
        });
        try {
          await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (
              url.origin === origin &&
              request.method() === "GET" &&
              !url.pathname.startsWith("/api")
            )
              return route.continue();
            blockedTransports.push({ kind: "http", method: request.method() });
            externalRequests.push(url.origin);
            return route.abort("blockedbyclient");
          });
          await context.routeWebSocket("**/*", (socket) => {
            blockedTransports.push({ kind: "websocket" });
            return socket.close({ code: 1008, reason: "Synthetic fixture blocks WebSockets" });
          });
          const page = await context.newPage();
          page.setDefaultTimeout(7000);
          page.on("pageerror", (error) => pageErrors.push(error.message));
          await page.goto(`${origin}/?locale=${locale}`, { waitUntil: "networkidle" });
          assert.deepEqual(pageErrors, [], await page.locator("body").innerText());
          assert.equal(await page.locator("html").getAttribute("lang"), locale);
          await page
            .getByRole("heading", { name: curriculumUi(locale, "title"), exact: true })
            .waitFor();
          await page
            .getByRole("tab", { name: curriculumUi(locale, "tabStory"), exact: true })
            .click();
          const form = page.locator('form[data-section="story"]');
          const saveStory = form.getByRole("button", {
            name: curriculumUi(locale, "saveStory"),
            exact: true,
          });
          assert.equal(await saveStory.count(), 1);
          if (locale === "fr") {
            assert.notEqual(curriculumUi(locale, "tabStory"), curriculumUi("en", "tabStory"));
            assert.equal(
              await page
                .getByRole("tab", { name: curriculumUi("en", "tabStory"), exact: true })
                .count(),
              0,
            );
            assert.equal(
              await form
                .getByRole("button", { name: curriculumUi("en", "saveStory"), exact: true })
                .count(),
              0,
            );
          }
          const child = form.locator("select").nth(0);
          await child.selectOption("child-a");
          const story = form.locator("select").nth(3);
          const photo = form.locator('input[type="file"]');
          assert.equal(await photo.isDisabled(), true);
          assert.deepEqual(
            await story.locator("option").evaluateAll((options) => options.map((o) => o.value)),
            ["", "story-a-old", "story-a-new"],
          );
          await story.selectOption("story-a-old");
          assert.equal(await photo.isEnabled(), true);
          await photo.setInputFiles({
            name: "synthetic-only.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from("SYNTHETIC QA BYTES - NO IMAGE PIXELS"),
          });
          await page.waitForFunction(() => window.__curriculumPickerFixture.uploads.length === 1);
          const upload = await page.evaluate(() => window.__curriculumPickerFixture.uploads[0]);
          assert.equal(upload.storyId, "story-a-old");
          assert.equal(upload.bookingId, "booking-a");
          assert.equal(upload.daycareId, "centre-a");
          await child.selectOption("child-b");
          assert.equal(await value(story), "");
          assert.equal(await photo.isDisabled(), true);
          assert.deepEqual(
            await story.locator("option").evaluateAll((options) => options.map((o) => o.value)),
            ["", "story-b"],
          );
          await story.selectOption("story-b");
          await page.locator("section > label > select").selectOption("centre-b");
          assert.equal(await value(child), "");
          assert.equal(await photo.count(), 0);
          await child.selectOption("child-a");
          assert.equal(await value(story), "");
          await form.locator("select").nth(1).selectOption("ON-belong");
          await form.locator('input[type="date"]').fill("2026-11-17");
          await form.locator("textarea").nth(0).fill("Synthetic story just saved");
          await saveStory.click();
          await page.waitForFunction(() => window.__curriculumPickerFixture.saves.length === 1);
          await page.waitForFunction(
            () => document.querySelector('form [type="file"]')?.disabled === false,
          );
          assert.equal(await value(story), "story-just-saved");
          await photo.setInputFiles({
            name: "second-synthetic.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from("SYNTHETIC QA BYTES ONLY"),
          });
          await page.waitForFunction(() => window.__curriculumPickerFixture.uploads.length === 2);
          const newUpload = await page.evaluate(() => window.__curriculumPickerFixture.uploads[1]);
          assert.equal(newUpload.storyId, "story-just-saved");
          assert.equal(newUpload.bookingId, "booking-a");
          assert.equal(newUpload.daycareId, "centre-b");
          await page.getByText(curriculumUi(locale, "photoHint"), { exact: true }).waitFor();
          const outputPrefix = locale === "en" ? "picker" : "picker-fr";
          for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
            const layout = await page.evaluate(() => ({
              viewportWidth: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
            }));
            assert.equal(layout.viewportWidth, width);
            assert.equal(layout.scrollWidth <= layout.viewportWidth, true);
            const screenshot = `${outputPrefix}-${width}.png`;
            await page.screenshot({ path: join(artifacts, screenshot), fullPage: true });
            captures.push({ locale, width, height: 1000, screenshot, ...layout });
          }
          assert.deepEqual(externalRequests, []);
          assert.deepEqual(blockedTransports, []);
          assert.deepEqual(pageErrors, []);
          await writeFile(
            join(artifacts, `${outputPrefix}-evidence.json`),
            JSON.stringify(
              {
                synthetic: true,
                locale,
                component: "CurriculumPackDesk",
                widths: [390, 1280],
                captures,
                productCopy: {
                  title: curriculumUi(locale, "title"),
                  storyTab: curriculumUi(locale, "tabStory"),
                  saveStory: curriculumUi(locale, "saveStory"),
                  photoHint: curriculumUi(locale, "photoHint"),
                },
                assertions: [
                  "Only selected child's stories",
                  "Explicit story required",
                  "Exact story and booking upload",
                  "Child switch resets selection",
                  "Centre switch resets selection",
                  "New story is selected after saving",
                ],
                uploads: [upload, newUpload].map(({ bodyBase64: _bodyBase64, ...data }) => ({
                  ...data,
                  syntheticBody: true,
                })),
                externalRequests,
                blockedTransports,
                loadedAppModules: [...loadedAppModules],
                runtimeGuard: runtimeGuard?.getStatus() ?? null,
                pageErrors,
              },
              null,
              2,
            ),
          );
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser?.close();
      if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
      await server?.close();
      await rm(fixture, { recursive: true, force: true });
      if (ownsFetch) globalThis.fetch = originalFetch;
      if (runtimeGuard) assert.equal(runtimeGuard.getStatus().violations, 0);
      assert.equal(standaloneFetchAttempts, 0);
    }
  },
);
