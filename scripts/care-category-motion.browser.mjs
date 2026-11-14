import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Exercise the real React component without a server, database or external assets.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.env.CATEGORY_MOTION_OUTPUT || join(repo, "artifacts/category-motion"));
const require = createRequire(join(repo, "package.json"));
const { rolldown } = await import(require.resolve("rolldown"));
const ts = require("typescript");
const { chromium } = require("playwright");
const stylesheet = readFileSync(join(repo, "src/styles.css"), "utf8");
const begin = stylesheet.indexOf("/* The original Floating Gallery artwork");
const media = stylesheet.indexOf("@media (prefers-reduced-motion: reduce)", begin);
let end = stylesheet.indexOf("{", media) + 1;
let depth = 1;
for (; end < stylesheet.length && depth; end += 1) {
  if (stylesheet[end] === "{") depth += 1;
  if (stylesheet[end] === "}") depth -= 1;
}
assert.ok(begin >= 0 && depth === 0, "shared category CSS found");
const css = stylesheet.slice(begin, end);
const entry = `import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {CareCategoryIcon} from './src/components/care-category-icon.tsx';
let root;
window.probeClicks={button:0,link:0};
window.mountProbe=()=>{
  root=createRoot(document.getElementById('root'));
  root.render(createElement('main',null,...['button','a'].map((tag,index)=>createElement(tag,{
    key:tag,id:tag==='a'?'link':'button',href:tag==='a'?'#category':undefined,
    onClick:()=>window.probeClicks[tag==='a'?'link':'button']++
  },createElement(CareCategoryIcon,{id:'child_care_centre',index}),
  createElement('span',{className:'label'},'Child care centres')))));
};
window.unmountProbe=()=>root.unmount();
window.mountProbe();`;
const entryId = join(repo, "__category_motion_probe__.tsx");
const bundler = await rolldown({
  cwd: repo, input: "virtual:category-motion", platform: "browser",
  resolve: { alias: { "@": join(repo, "src") } },
  transform: { define: { "process.env.NODE_ENV": '"production"' } },
  plugins: [{
    name: "local-category-motion-probe",
    resolveId: (id) => id === "virtual:category-motion" ? entryId : null,
    load: (id) => id === entryId ? entry : null,
    transform(code, id) {
      if (!id.endsWith(".tsx")) return null;
      return { code: ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    },
  }],
});
const bundle = await bundler.generate({ format: "iife", name: "CategoryMotionProbe" });
await bundler.close();
const script = bundle.output.find((item) => item.type === "chunk").code;
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CHROME_EXECUTABLE_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
const allErrors = [];

async function probePage(width, { noAnimation = false, noObserver = false, reduced = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  page.on("pageerror", (error) => allErrors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://category-motion.invalid") return route.abort();
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#root{min-height:2400px}main{display:flex;gap:16px;padding:24px}button,a{box-sizing:border-box;display:inline-flex;flex:none;flex-direction:column;align-items:center;justify-content:center;width:140px;min-height:112px;padding:8px;font:14px sans-serif}.label{display:block}${css}</style><div id="root"></div>` });
    if (/^\/photos\/care-icons\/KidEase_[A-Za-z_]+\.png$/.test(url.pathname)) {
      return route.fulfill({ contentType: "image/png", body: readFileSync(join(repo, "public/photos/care-icons", basename(url.pathname))) });
    }
    return route.abort();
  });
  await page.goto("http://category-motion.invalid/");
  await page.evaluate(({ noAnimation, noObserver }) => {
    window.probe = { media: 0, visibility: 0, observers: new Set(), animations: [], calls: [], input: [] };
    const match = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = match(query), add = media.addEventListener.bind(media), remove = media.removeEventListener.bind(media);
      media.addEventListener = (type, listener, ...rest) => { if (type === "change") window.probe.media++; return add(type, listener, ...rest); };
      media.removeEventListener = (type, listener, ...rest) => { if (type === "change") window.probe.media--; return remove(type, listener, ...rest); };
      return media;
    };
    const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, listener, ...rest) => { if (type === "visibilitychange") window.probe.visibility++; return add(type, listener, ...rest); };
    document.removeEventListener = (type, listener, ...rest) => { if (type === "visibilitychange") window.probe.visibility--; return remove(type, listener, ...rest); };
    for (const type of ["pointerenter", "click", "keydown", "focusin"]) add(type, (event) => window.probe.input.push({ type, trusted: event.isTrusted }), true);
    if (noObserver) window.IntersectionObserver = undefined;
    else {
      const NativeObserver = window.IntersectionObserver;
      window.IntersectionObserver = class extends NativeObserver {
        observe(node) { window.probe.observers.add(this); return super.observe(node); }
        disconnect() { window.probe.observers.delete(this); return super.disconnect(); }
      };
    }
    const animate = Element.prototype.animate;
    if (noAnimation) Element.prototype.animate = undefined;
    else Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      window.probe.animations.push(animation);
      window.probe.calls.push({ kind: this.className, duration: options.duration, infinite: options.iterations === Infinity });
      return animation;
    };
  }, { noAnimation, noObserver });
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => document.querySelectorAll(".ke-category-art").length === 2 && window.probe.media === 2);
  return page;
}

async function snapshot(page) {
  return page.evaluate(() => ["button", "link"].map((id) => {
    const control = document.getElementById(id), art = control.querySelector(".ke-category-art"), image = art.querySelector("img");
    const idle = art.getAnimations()[0], interaction = image.getAnimations()[0];
    const box = (node) => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    return { id, idle: idle ? { state: idle.playState, time: idle.currentTime, iterations: String(idle.effect.getTiming().iterations) } : null,
      interaction: interaction ? { state: interaction.playState, time: interaction.currentTime } : null,
      transform: getComputedStyle(art).transform, imageTransform: getComputedStyle(image).transform,
      control: box(control), label: box(control.querySelector(".label")), clicks: window.probeClicks[id] };
  }));
}

async function waitIdle(page, state) {
  await page.waitForFunction((state) => [...document.querySelectorAll(".ke-category-art")].every((node) => node.getAnimations()[0]?.playState === state), state);
}

async function syntheticHidden(page, hidden) {
  await page.evaluate((hidden) => {
    // Headless Chromium exposes all tabs as visible. Exercise the DOM event
    // contract explicitly; this is not a physical background-tab certification.
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function cleanup(page) {
  await page.evaluate(() => {
    window.retainedControls = [...document.querySelectorAll("button,a")];
    window.unmountProbe();
  });
  await page.waitForFunction(() => !document.querySelector(".ke-category-art"));
  const state = await page.evaluate(() => ({ media: window.probe.media, visibility: window.probe.visibility, observers: window.probe.observers.size,
    activeAnimations: window.probe.animations.filter((animation) => animation.playState !== "idle").length, calls: window.probe.calls.length }));
  assert.equal(state.media, 0, "media listeners removed");
  assert.equal(state.visibility, 0, "visibility listeners removed");
  assert.equal(state.observers, 0, "intersection observers disconnected");
  assert.equal(state.activeAnimations, 0, "owned animations canceled");
  await page.evaluate(() => { for (const control of window.retainedControls) for (const type of ["pointerenter", "focus", "click"]) control.dispatchEvent(new Event(type)); });
  assert.equal(await page.evaluate(() => window.probe.calls.length), state.calls, "detached controls cannot restart animation");
}

try {
  for (const width of [390, 1280]) {
    const page = await probePage(width);
    await waitIdle(page, "running");
    const start = await snapshot(page);
    const samples = [start];
    // Real elapsed time proves idle motion repeats beyond its first cycle.
    for (let sample = 0; sample < 14; sample++) { await page.waitForTimeout(500); samples.push(await snapshot(page)); }
    assert.equal(await page.evaluate(() => window.probe.input.length), 0, "idle motion needs no pointer, focus or click");
    const finish = samples.at(-1);
    for (let icon = 0; icon < 2; icon++) {
      assert.equal(finish[icon].idle.state, "running");
      assert.equal(finish[icon].idle.iterations, "Infinity");
      assert.ok(finish[icon].idle.time > 6000, "automatic motion continues after one cycle");
      assert.ok(new Set(samples.map((sample) => sample[icon].transform)).size > 4, "actual rendered transforms change without input");
      for (const sample of samples) {
        assert.deepEqual(sample[icon].control, start[icon].control, "control stays stationary");
        assert.deepEqual(sample[icon].label, start[icon].label, "label stays stationary");
        assert.equal(sample[icon].interaction, null, "idle does not replay the stronger interaction effect");
      }
    }

    await page.evaluate(() => scrollTo(0, 1500));
    await waitIdle(page, "paused");
    await page.waitForTimeout(80);
    const offscreen = await snapshot(page); await page.waitForTimeout(300);
    assert.deepEqual((await snapshot(page)).map((item) => item.idle.time), offscreen.map((item) => item.idle.time), "off-screen idle timeline pauses");
    const callsBefore = await page.evaluate(() => window.probe.calls.length);
    await page.locator("#button").dispatchEvent("pointerenter");
    assert.equal(await page.evaluate(() => window.probe.calls.length), callsBefore, "off-screen interaction cannot start motion");
    await page.evaluate(() => scrollTo(0, 0)); await waitIdle(page, "running"); await page.waitForTimeout(120);
    assert.ok((await snapshot(page))[0].idle.time > offscreen[0].idle.time, "on-screen idle resumes");

    for (const id of ["button", "link"]) {
      const control = page.locator(`#${id}`);
      await control.hover(); await page.waitForTimeout(60);
      assert.equal((await snapshot(page)).find((item) => item.id === id).interaction.state, "running");
      const entered = await page.evaluate(() => window.probe.calls.length);
      await page.mouse.move(1, 1); await page.waitForTimeout(60);
      assert.equal(await page.evaluate(() => window.probe.calls.length), entered, "pointer exit adds no replay");
      await control.focus();
      const before = (await snapshot(page)).find((item) => item.id === id).clicks;
      await page.keyboard.press("Enter");
      assert.equal((await snapshot(page)).find((item) => item.id === id).clicks, before + 1, "native Enter activation remains");
      if (id === "button") { await page.keyboard.press("Space"); assert.equal((await snapshot(page))[0].clicks, before + 2, "native Space activation remains"); }
      else assert.equal(new URL(page.url()).hash, "#category", "native anchor navigation remains");
    }

    await syntheticHidden(page, true); await waitIdle(page, "paused"); await page.waitForTimeout(80);
    const hidden = await snapshot(page); await page.waitForTimeout(300);
    assert.deepEqual((await snapshot(page)).map((item) => item.idle.time), hidden.map((item) => item.idle.time), "hidden-state idle timeline pauses");
    assert.ok((await snapshot(page)).every((item) => !item.interaction || item.interaction.state === "paused"), "hidden state pauses active interaction");
    await syntheticHidden(page, false); await waitIdle(page, "running"); await page.waitForTimeout(120);
    assert.ok((await snapshot(page))[0].idle.time > hidden[0].idle.time, "visible-state idle resumes");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => [...document.querySelectorAll(".ke-category-art,.ke-category-icon")].every((node) => node.getAnimations().length === 0));
    const reducedCalls = await page.evaluate(() => window.probe.calls.length);
    await page.locator("#button").hover(); await page.locator("#button").click(); await page.keyboard.press("Space");
    assert.equal(await page.evaluate(() => window.probe.calls.length), reducedCalls, "reduced motion blocks idle and interaction animations");
    assert.ok((await snapshot(page)).every((item) => item.transform === "none" && item.imageTransform === "none"), "reduced motion has a neutral pose");
    await page.emulateMedia({ reducedMotion: "no-preference" }); await waitIdle(page, "running");
    for (let mount = 0; mount < 3; mount++) {
      await cleanup(page); await page.evaluate(() => window.mountProbe());
      await page.waitForFunction(() => document.querySelectorAll(".ke-category-art").length === 2 && window.probe.media === 2);
      await waitIdle(page, "running");
    }
    await cleanup(page);
    results.push({ width, automaticWithoutInput: true, observedMillis: Math.round(finish[0].idle.time), changingRenderedTransforms: true,
      stationaryControlsAndLabels: true, offscreenPauseResume: true, hiddenPauseResume: "synthetic document.hidden + dispatched visibilitychange DOM event; headless tabs remain visible",
      keyboardEnterAndSpace: true, nativeAnchorNavigation: true, reducedMotionLiveToggle: true, repeatedMounts: 3, cleanup: true });
    await page.close();
  }

  const reduced = await probePage(390, { reduced: true });
  await reduced.waitForTimeout(200);
  assert.equal(await reduced.evaluate(() => window.probe.calls.length), 0, "initial reduced preference never starts motion");
  await reduced.emulateMedia({ reducedMotion: "no-preference" }); await waitIdle(reduced, "running");
  await cleanup(reduced); await reduced.close();

  const noObserver = await probePage(390, { noObserver: true });
  await waitIdle(noObserver, "running"); await syntheticHidden(noObserver, true); await waitIdle(noObserver, "paused");
  await syntheticHidden(noObserver, false); await waitIdle(noObserver, "running");
  await cleanup(noObserver); await noObserver.close();

  const noAnimation = await probePage(390, { noAnimation: true });
  await noAnimation.locator("#button").click(); await noAnimation.locator("#link").focus(); await noAnimation.keyboard.press("Enter");
  assert.equal(await noAnimation.evaluate(() => window.probe.calls.length), 0, "missing WAAPI keeps static functional controls");
  assert.equal(new URL(noAnimation.url()).hash, "#category");
  await cleanup(noAnimation); await noAnimation.close();
  assert.deepEqual(allErrors, []);
  const report = { source: "actual shared CareCategoryIcon bundled with React and exact category CSS", network: "all requests intercepted; only local HTML and original repository PNGs fulfilled",
    results, initialReducedMotion: true, missingIntersectionObserverFallback: "motion follows document visibility; no off-screen guarantee without observer support",
    missingWebAnimationsFallback: "static functional controls", pageErrors: allErrors,
    limitation: "Headless Chromium kept real document.hidden=false across tabs and lifecycle freeze; hidden-tab handling is verified through an explicit DOM-state/event simulation, not a physical browser-tab test." };
  mkdirSync(output, { recursive: true }); writeFileSync(join(output, "care-category-motion-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
