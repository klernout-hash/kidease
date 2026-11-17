import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { clientNodeBuiltinStub } from "./client-node-stub.mjs";

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
  "@/lib/use-copy": "export function useCopy(){return {locale:'en'};}",
  "sonner": "export const toast = {success(){},error(e){window.__curriculumPickerFixture.error=String(e);}};",
  "@tanstack/react-router": "import {createElement} from 'react'; export const Link=({to,children,...p})=>createElement('a',{href:to,...p},children);",
};

function fixturePlugin() {
  return {
    name: "curriculum-picker-synthetic-edges",
    enforce: "pre",
    resolveId(id) {
      const fixtureKey = Object.keys(virtual).find(key => key === id || (key.startsWith("@/") && [join(root,"src",key.slice(2)),join(root,"src",key.slice(2))+".ts"].includes(id)));
      if (fixtureKey) return `\0curriculum-picker:${fixtureKey}`;
      if (/stripe|payment|billing/i.test(id) || (id.startsWith("@/lib/server/") || id.includes("/src/lib/server/"))) {
        throw new Error(`Out-of-scope module in curriculum picker: ${id}`);
      }
    },
    load(id) {
      const prefix = "\0curriculum-picker:";
      if (id.startsWith(prefix)) return virtual[id.slice(prefix.length)];
    },
  };
}

async function value(locator) { return locator.inputValue(); }

test("synthetic curriculum picker binds upload to the selected child and exact story", { timeout: 90000 }, async () => {
  await mkdir(fixture, { recursive: true });
  await writeFile(join(fixture, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main class="mx-auto w-full max-w-3xl p-4"><p class="mb-4 text-sm">Synthetic component QA · no child photos</p><div id="root"></div></main><script type="module" src="/entry.tsx"></script></body></html>`);
  await writeFile(join(fixture,"fixture.css"), `@import ${JSON.stringify(join(root,"src/styles.css"))};\n@source ${JSON.stringify(join(root,"src/components/curriculum-pack.tsx"))};\n@source ${JSON.stringify(join(root,"src/components/ui/button.tsx"))};\n@source ${JSON.stringify(join(root,"src/components/empty-state.tsx"))};\n@source "./index.html";`);
  await writeFile(join(fixture, "entry.tsx"), `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CurriculumPackDesk} from ${JSON.stringify(join(root, "src/components/curriculum-pack.tsx"))}; import './fixture.css'; createRoot(document.getElementById('root')!).render(<CurriculumPackDesk/>);`);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("External fetch forbidden in synthetic picker QA"); };
  let server;
  let browser;
  const externalRequests = [];
  const pageErrors = [];
  try {
    server = await createServer({
      configFile: false,
      envDir: false,
      root: fixture,
      cacheDir: join(fixture, ".vite-cache"),
      publicDir: join(root,"public"),
      resolve: { alias: { "@": join(root,"src") } },
      plugins: [fixturePlugin(), clientNodeBuiltinStub(), react(), tailwindcss()],
      server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, fs: { allow: [root] } },
      optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react/jsx-runtime", "@radix-ui/react-slot", "lucide-react", "clsx", "tailwind-merge", "class-variance-authority"] },
      logLevel: "warn",
    });
    await server.listen();
    const address = server.httpServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const installedChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    browser = await chromium.launch({ headless: true, ...(existsSync(installedChrome) ? {executablePath:installedChrome} : {}) });
    const context = await browser.newContext({ viewport: {width:390,height:844}, serviceWorkers:"block" });
    await context.route("**/*", async route => {
      const url = route.request().url();
      if (url.startsWith(`${origin}/`) || url.startsWith("data:")) return route.continue();
      externalRequests.push(url);
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(origin, {waitUntil:"networkidle"});
    assert.deepEqual(pageErrors,[],await page.locator("body").innerText());
    await page.getByRole("tab",{name:"Story",exact:true}).click();
    const form = page.locator('form[data-section="story"]');
    const child = form.locator("select").nth(0);
    await child.selectOption("child-a");
    const story = form.locator("select").nth(3);
    const photo = form.locator('input[type="file"]');
    assert.equal(await photo.isDisabled(), true);
    assert.deepEqual(await story.locator("option").evaluateAll(options => options.map(o=>o.value)),["","story-a-old","story-a-new"]);
    await story.selectOption("story-a-old");
    assert.equal(await photo.isEnabled(),true);
    await photo.setInputFiles({name:"synthetic-only.jpg",mimeType:"image/jpeg",buffer:Buffer.from("SYNTHETIC QA BYTES - NO IMAGE PIXELS")});
    await page.waitForFunction(()=>window.__curriculumPickerFixture.uploads.length===1);
    const upload = await page.evaluate(()=>window.__curriculumPickerFixture.uploads[0]);
    assert.equal(upload.storyId,"story-a-old");
    assert.equal(upload.bookingId,"booking-a");
    assert.equal(upload.daycareId,"centre-a");
    await child.selectOption("child-b");
    assert.equal(await value(story),"");
    assert.equal(await photo.isDisabled(),true);
    assert.deepEqual(await story.locator("option").evaluateAll(options=>options.map(o=>o.value)),["","story-b"]);
    await story.selectOption("story-b");
    await page.locator("section > label > select").selectOption("centre-b");
    assert.equal(await value(child),"");
    assert.equal(await photo.count(),0);
    await child.selectOption("child-a");
    assert.equal(await value(story),"");
    await form.locator("select").nth(1).selectOption("ON-belong");
    await form.locator('input[type="date"]').fill("2026-11-17");
    await form.locator("textarea").nth(0).fill("Synthetic story just saved");
    await form.getByRole("button",{name:"Save story",exact:true}).click();
    await page.waitForFunction(()=>window.__curriculumPickerFixture.saves.length===1);
    await page.waitForFunction(()=>document.querySelector('form [type="file"]')?.disabled===false);
    assert.equal(await value(story),"story-just-saved");
    await photo.setInputFiles({name:"second-synthetic.jpg",mimeType:"image/jpeg",buffer:Buffer.from("SYNTHETIC QA BYTES ONLY")});
    await page.waitForFunction(()=>window.__curriculumPickerFixture.uploads.length===2);
    const newUpload = await page.evaluate(()=>window.__curriculumPickerFixture.uploads[1]);
    assert.equal(newUpload.storyId,"story-just-saved");
    assert.equal(newUpload.bookingId,"booking-a");
    assert.equal(newUpload.daycareId,"centre-b");
    for (const width of [390,1280]) {
      await page.setViewportSize({width,height:1000});
      await page.screenshot({path:join(artifacts,`picker-${width}.png`),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    assert.deepEqual(externalRequests,[]);
    assert.deepEqual(pageErrors,[]);
    await writeFile(join(artifacts,"picker-evidence.json"),JSON.stringify({
      synthetic:true, component:"CurriculumPackDesk", widths:[390,1280],
      assertions:["Only selected child's stories", "Explicit story required", "Exact story and booking upload", "Child switch resets selection", "Centre switch resets selection", "New story is selected after saving"],
      uploads:[upload,newUpload].map(({bodyBase64:_bodyBase64,...data})=>({...data,syntheticBody:true})),
      externalRequests,pageErrors,
    },null,2));
  } finally {
    globalThis.fetch = originalFetch;
    await browser?.close();
    await server?.close();
    await rm(fixture,{recursive:true,force:true});
  }
});
