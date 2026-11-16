/**
 * Anchor targets for the guided tour. The bubble must point at the city field,
 * and a replay from Help must open that tour from step 1 even after it was seen.
 * Geometry runs in Chromium when the browser is installed. The decisions run either way.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  EMPTY_ONBOARDING,
  SEARCH_WHERE_ANCHOR,
  WELCOME_PARENT,
  WELCOME_PROVIDER,
  markSeen,
  openingAnchor,
  presentCoachSteps,
  replayDecision,
  replayOpens,
  targetBoxUsable,
  welcomeSlides,
} from "../src/lib/first-run.ts";

const DESKTOP = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<div style="display:none"><button data-tour="search-where" style="width:320px;height:56px">Trouvez une garderie</button></div>
<form data-tour="parent-search" style="display:flex;width:960px;height:56px;margin:24px">
  <div data-tour="search-where" id="where" style="width:320px;height:56px">Where</div>
  <div id="when" style="width:320px;height:56px">Care schedule</div>
  <div id="name" style="width:276px;height:56px">Daycare</div>
  <button data-ke="search-submit" style="width:44px;height:44px">Search</button>
</form>
<button data-ke="help-button" style="width:72px;height:44px">Help</button>
</body>`;

const PHONE_STACK = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<form data-tour="parent-search" style="display:flex;flex-direction:column;width:350px">
  <div data-tour="search-where" id="where" style="height:56px">Où</div>
  <div id="when" style="height:56px">Horaire</div>
  <div id="name" style="height:56px">Garderie</div>
</form>
</body>`;

const PHONE_PILL = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<div style="display:none"><form data-tour="parent-search" style="width:960px;height:56px"><div data-tour="search-where" style="width:320px;height:56px">Where</div></form></div>
<button data-tour="search-where" data-ke="msv2-pill" id="pill" style="display:flex;width:350px;height:56px">Trouvez une garderie près de chez vous</button>
</body>`;

const HELP = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<button data-ke="help-button" style="width:88px;height:44px">Help</button>
<a data-ke="header-avatar" style="display:inline-grid;width:48px;height:48px">Account</a>
</body>`;

const PROVIDER_PHONE = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<nav style="display:none"><a data-nav="today" style="display:inline-block;width:160px;height:44px">Today</a></nav>
<section data-tour="provider-attendance" style="width:350px;height:900px">page</section>
<h2 data-tour="provider-today" id="today" style="width:180px;height:40px">Aujourd’hui</h2>
</body>`;

function selectorsFor(steps) {
  return [...new Set(steps.flatMap((step) => (step.anchors ? [...step.anchors] : step.anchor ? [step.anchor] : [])))];
}

async function measure(page, selectors) {
  return page.evaluate((wanted) => {
    const out = {};
    for (const sel of wanted) {
      out[sel] = [...document.querySelectorAll(sel)].map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          display: style.display,
          visibility: style.visibility,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
        };
      });
    }
    return out;
  }, selectors);
}

function presentFrom(raw) {
  return (selector) => (raw[selector] || []).some((box) => targetBoxUsable(box, box));
}

function firstBox(raw, selector) {
  return (raw[selector] || []).find((box) => targetBoxUsable(box, box)) || null;
}

async function launch() {
  return chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
}

test("replay from Help starts the home tour, and a seen tour still opens", () => {
  const seen = markSeen(markSeen(EMPTY_ONBOARDING, WELCOME_PARENT), WELCOME_PROVIDER);
  assert.equal(replayOpens(WELCOME_PARENT, true, seen), true);
  assert.equal(replayOpens(WELCOME_PROVIDER, true, seen), true);
  assert.deepEqual(replayDecision(WELCOME_PARENT, "/help", "", false), { action: "go", path: "/" });
  assert.deepEqual(replayDecision(WELCOME_PROVIDER, "/fr/help", "", false), { action: "go", path: "/provider?desk=today" });
  assert.equal(presentCoachSteps(welcomeSlides(WELCOME_PARENT), (selector) => selector.includes("help-button")).length, 0);
});

test("the search step anchors the city field on desktop and phone", async (t) => {
  let browser;
  try {
    browser = await launch();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|browserType\.launch|Failed to launch/i.test(message)) {
      t.skip(`chromium is not installed (${message.slice(0, 120)})`);
      return;
    }
    throw err;
  }
  try {
    const slides = welcomeSlides(WELCOME_PARENT);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(DESKTOP);
    const desktop = await measure(page, [...selectorsFor(slides), '[data-tour="parent-search"]', "#when"]);
    const present = presentFrom(desktop);
    assert.equal(openingAnchor(slides, present), SEARCH_WHERE_ANCHOR);
    const where = firstBox(desktop, SEARCH_WHERE_ANCHOR);
    const bar = firstBox(desktop, '[data-tour="parent-search"]');
    const when = firstBox(desktop, "#when");
    assert.ok(where && bar && when);
    const whereCentre = where.left + where.width / 2;
    const barCentre = bar.left + bar.width / 2;
    assert.ok(whereCentre < bar.left + bar.width * 0.4, `where centre ${whereCentre} is not in the left of the bar`);
    assert.ok(Math.abs(whereCentre - barCentre) > 80, "arrow must not sit on the middle of the bar");
    assert.ok(whereCentre < when.left, "where field stays left of care schedule");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(PHONE_STACK);
    const stack = await measure(page, [SEARCH_WHERE_ANCHOR, '[data-tour="parent-search"]', "#when"]);
    const stackedWhere = firstBox(stack, SEARCH_WHERE_ANCHOR);
    const stackedBar = firstBox(stack, '[data-tour="parent-search"]');
    assert.ok(stackedWhere && stackedBar);
    assert.ok(stackedWhere.top <= stackedBar.top + 1);
    assert.ok(stackedWhere.height < stackedBar.height / 2, "phone stack must not highlight the whole bar");
    assert.equal(openingAnchor(slides, presentFrom(stack)), SEARCH_WHERE_ANCHOR);

    await page.setContent(PHONE_PILL);
    const pill = await measure(page, [SEARCH_WHERE_ANCHOR]);
    const pillBox = firstBox(pill, SEARCH_WHERE_ANCHOR);
    assert.ok(pillBox);
    assert.ok(pillBox.width < 400, "phone pill is the where control, not the hidden desktop bar");
    assert.equal(openingAnchor(slides, presentFrom(pill)), SEARCH_WHERE_ANCHOR);

    await page.setContent(HELP);
    const help = await measure(page, selectorsFor(slides));
    const helpPresent = presentFrom(help);
    assert.equal(openingAnchor(slides, helpPresent), null);
    const helpShown = presentCoachSteps(slides, helpPresent);
    assert.ok(helpShown.every((step) => step.title.en !== "Search here"));
    assert.deepEqual(replayDecision(WELCOME_PARENT, "/help", "", helpPresent(SEARCH_WHERE_ANCHOR)), { action: "go", path: "/" });
    await page.setContent(`<!doctype html><body style="margin:0"><button data-ke="help-button" style="width:88px;height:44px">Help</button></body>`);
    const codaOnly = await measure(page, selectorsFor(slides));
    assert.equal(presentCoachSteps(slides, presentFrom(codaOnly)).length, 0);

    await page.setContent(PROVIDER_PHONE);
    const providerSlides = welcomeSlides(WELCOME_PROVIDER);
    const provider = await measure(page, selectorsFor(providerSlides));
    assert.equal(openingAnchor(providerSlides, presentFrom(provider)), '[data-tour="provider-today"]');
    const today = firstBox(provider, '[data-tour="provider-today"]');
    assert.ok(today && today.height < 80, "Today points at the heading, not the whole page");
    await page.close();
  } finally {
    await browser.close();
  }
});
