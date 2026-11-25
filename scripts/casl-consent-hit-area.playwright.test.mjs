/**
 * #1014 item 9c: clicking the centre of each Email & SMS consent box toggles it,
 * on desktop and on a 390px phone, with the app's real global CSS loaded.
 *
 * The rows use the class strings from casl-consent-fields.tsx. Tailwind is not
 * built here, so each utility used by the row gets its plain CSS below; an
 * unknown class fails the test so the fixture cannot drift from the component.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chromium } from "playwright";

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const component = src("src/components/casl-consent-fields.tsx");
const constant = (name) => {
  const match = component.match(new RegExp(`export const ${name} = "([^"]+)";`));
  assert.ok(match, `${name} is exported from casl-consent-fields.tsx`);
  return match[1];
};
const ROW = constant("CONSENT_ROW");
const ZONE = constant("CONSENT_BOX_ZONE");
const BOX = constant("CONSENT_BOX");

const UTILITIES = {
  flex: "display:flex",
  "min-h-11": "min-height:2.75rem",
  "cursor-pointer": "cursor:pointer",
  "touch-manipulation": "touch-action:manipulation",
  "items-start": "align-items:flex-start",
  "items-center": "align-items:center",
  "justify-center": "justify-content:center",
  "gap-2": "gap:0.5rem",
  "text-sm": "font-size:0.875rem;line-height:1.25rem",
  "-my-1.5": "margin-top:-0.375rem;margin-bottom:-0.375rem",
  "-ml-3": "margin-left:-0.75rem",
  "size-[44px]": "width:44px;height:44px",
  "size-[20px]": "width:20px;height:20px",
  "shrink-0": "flex-shrink:0",
  "accent-primary": "accent-color:#2f6f5e",
};

function utilityCss() {
  const used = new Set([...ROW.split(/\s+/), ...ZONE.split(/\s+/), ...BOX.split(/\s+/)]);
  const rules = [];
  for (const cls of used) {
    assert.ok(cls in UTILITIES, `fixture knows the "${cls}" utility`);
    rules.push(`.${CSS_escape(cls)}{${UTILITIES[cls]}}`);
  }
  return rules.join("\n");
}

function CSS_escape(cls) {
  return cls.replace(/([\\.:[\]/])/g, "\\$1");
}

function fixture() {
  const rows = ["sms", "email-service", "email-commercial"]
    .map(
      (id) => `<label class="${ROW}" data-row="${id}"><span class="${ZONE}"><input type="checkbox" class="${BOX}" data-box="${id}"></span><span style="padding-top:.5rem"><span>Consent ${id}</span><span style="display:block;font-size:12px">I agree to get messages about ${id}. I can withdraw at any time.</span></span></label>`,
    )
    .join("");
  // The app's own global CSS (unbuilt Tailwind directives are ignored by the browser).
  const appCss = src("src/styles.css").replace(/@import[^;]+;/g, "");
  return `<!doctype html><html data-channel="website" data-runtime="web"><head><style>${appCss}</style><style>${utilityCss()}</style></head>
  <body><form style="margin:2rem;padding:1.25rem;max-width:36rem"><fieldset style="border:0;padding:0;display:grid;gap:.75rem">${rows}</fieldset></form></body></html>`;
}

test("#1014 item 9c: each consent box toggles when its centre or the area around it is clicked", async (t) => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    t.skip(`Chromium is not installed here (${String(err?.message || err).slice(0, 80)})`);
    return;
  }
  try {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block" });
      await context.route("**/*", (route) => route.abort("blockedbyclient"));
      const page = await context.newPage();
      await page.setContent(fixture());
      for (const id of ["sms", "email-service", "email-commercial"]) {
        const box = page.locator(`[data-box="${id}"]`);
        const rect = await box.boundingBox();
        assert.ok(rect, `${id} box is on screen at ${viewport.width}px`);
        assert.ok(rect.width >= 20 && rect.height >= 20, `${id} box is at least 20px`);
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        // Nothing sits on top of the box.
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute("data-box"), [cx, cy]);
        assert.equal(hit, id, `${id}: the box itself is under its centre`);
        await page.mouse.click(cx, cy);
        assert.equal(await box.isChecked(), true, `${id}: centre click checks it at ${viewport.width}px`);
        await page.mouse.click(cx, cy);
        assert.equal(await box.isChecked(), false, `${id}: second centre click clears it`);
        // The 44px zone around the box toggles it too.
        await page.mouse.click(rect.x - 8, cy);
        assert.equal(await box.isChecked(), true, `${id}: a click just left of the box checks it`);
        await page.mouse.click(cx, rect.y + rect.height + 8);
        assert.equal(await box.isChecked(), false, `${id}: a click just below the box clears it`);
        const zone = await page.locator(`[data-row="${id}"] > span`).first().boundingBox();
        assert.ok(zone.width >= 44 && zone.height >= 44, `${id}: hit zone is at least 44px`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test("#1014 item 9c: consent rows keep the bigger box and the 44px zone in source", () => {
  assert.match(component, /<span className=\{CONSENT_BOX_ZONE\} data-ke="casl-box-zone">/);
  assert.match(component, /className=\{CONSENT_BOX\}/);
  assert.match(BOX, /(^|\s)size-\[20px\](\s|$)/);
  assert.doesNotMatch(component, /size-4/);
  assert.match(ROW, /\bmin-h-11\b/);
  assert.match(ROW, /\btouch-manipulation\b/);
  assert.match(ZONE, /(^|\s)size-\[44px\](\s|$)/);
  assert.match(component, /data-ke=\{entry\}/);
  assert.match(component, /entry="sms-entry"/);
});
