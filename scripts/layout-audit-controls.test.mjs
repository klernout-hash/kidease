import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { auditLayoutPage, auditPage, MIN_TAP } from "./layout-audit.mjs";

// Only synthetic DOM and the inert audit module: no app, fixture server or data.
let browser;
before(async () => {
  const chrome =
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(chrome) ? { executablePath: chrome } : {}),
    args: ["--disable-background-networking"],
  });
});
after(async () => {
  await browser?.close();
});

async function syntheticPage(run) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const requests = [];
  await context.route("**/*", (route) => {
    requests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><style>
      body{margin:0;font:16px Arial,sans-serif}.pair{position:relative;height:70px}
      button{position:absolute;top:0;left:0;width:100px;height:44px}
      button+button{left:60px}.small{position:static;width:32px;height:32px}
      dialog{padding:10px;width:250px}
    </style><body></body>`);
    await run(page);
    assert.deepEqual(requests, [], "synthetic checks must make no HTTP requests");
  } finally {
    await context.close();
  }
}

const pair = (prefix) =>
  `<div class="pair"><button data-ke="${prefix}-a">Alpha</button><button data-ke="${prefix}-b">Beta</button></div><button class="small" data-ke="${prefix}-small">X</button>`;
const has = (issues, prefix) => issues.some((issue) => issue.includes(prefix));

test("active overlap and small targets remain findings; inert descendants are excluded only while inert", async () => {
  await syntheticPage(async (page) => {
    await page.locator("body").evaluate(
      (body, markup) => {
        body.innerHTML = markup;
      },
      `${pair("active")}<section id="inert" inert><div>${pair("inert")}</div></section>`,
    );
    let result = await page.evaluate(auditPage, MIN_TAP);
    assert(has(result.issues.overlap, "active-a"));
    assert(has(result.issues.small, "active-small"));
    assert(!has(result.issues.overlap, "inert-"));
    assert(!has(result.issues.small, "inert-"));

    // Native Boolean semantics: the string "false" still means inert.
    await page.locator("#inert").evaluate((element) => {
      element.setAttribute("inert", "false");
    });
    result = await page.evaluate(auditPage, MIN_TAP);
    assert(!has(result.issues.overlap, "inert-"));
    await page.locator("#inert").evaluate((element) => {
      element.inert = false;
    });
    result = await page.evaluate(auditPage, MIN_TAP);
    assert(has(result.issues.overlap, "inert-a"));
    assert(has(result.issues.small, "inert-small"));
    await page.locator("#inert").evaluate((element) => {
      element.inert = true;
    });
    result = await page.evaluate(auditPage, MIN_TAP);
    assert(!has(result.issues.overlap, "inert-"));
    assert(!has(result.issues.small, "inert-"));
  });
});

test("inert visible content still receives horizontal-overflow and text-spill checks", async () => {
  await syntheticPage(async (page) => {
    await page.locator("body").evaluate((body) => {
      body.innerHTML =
        '<section inert data-ke="inert-wide" style="width:900px"><p data-ke="inert-spill" style="width:60px;white-space:nowrap">Synthetic text still visibly spills beyond its narrow box.</p></section>';
    });
    const result = await page.evaluate(auditPage, MIN_TAP);
    assert(result.scrollWidth > 390);
    assert(has(result.issues.overflow, "inert-wide"));
    assert(has(result.issues.spill, "inert-spill"));
  });
});

test("ARIA and tabindex do not become inert exemptions", async () => {
  await syntheticPage(async (page) => {
    await page.locator("body").evaluate((body, markup) => {
      body.innerHTML = `<section aria-hidden="true" aria-disabled="true" tabindex="-1">${markup}</section>`;
    }, pair("aria"));
    const result = await page.evaluate(auditPage, MIN_TAP);
    assert(has(result.issues.overlap, "aria-a"));
    assert(has(result.issues.small, "aria-small"));
  });
});

test("native modal escape stays interactive; explicit modal inertness still excludes controls", async () => {
  await syntheticPage(async (page) => {
    await page.locator("body").evaluate((body, markup) => {
      body.innerHTML = `<section inert><dialog>${markup}</dialog></section>`;
      body.querySelector("dialog").showModal();
    }, pair("modal"));
    let result = await page.evaluate(auditPage, MIN_TAP);
    assert(has(result.issues.overlap, "modal-a"));
    assert(has(result.issues.small, "modal-small"));
    await page.locator("dialog").evaluate((dialog) => {
      dialog.inert = true;
    });
    result = await page.evaluate(auditPage, MIN_TAP);
    assert(!has(result.issues.overlap, "modal-"));
    assert(!has(result.issues.small, "modal-"));
  });
});

test("page diagnostics preserve real URL/font state and navigation status without error text", async () => {
  await syntheticPage(async (page) => {
    await page.goto("about:blank?q=Winnipeg&look=clean&code=synthetic-private#synthetic-fragment");
    await page.setContent(
      '<!doctype html><body style="font-family:Arial,sans-serif">Synthetic font metadata</body>',
    );
    const fontBytes = [
      ...readFileSync(new URL("../public/fonts/plus-jakarta-sans-latin.woff2", import.meta.url)),
    ];
    await page.evaluate(async (bytes) => {
      const font = new FontFace("SyntheticAuditFont", new Uint8Array(bytes));
      document.fonts.add(font);
      await font.load();
    }, fontBytes);
    // Synthetic navigation outcomes use the actual browser audit without any transport.
    for (const status of [200, 503, null]) {
      const calls = [];
      const adapter = {
        async goto() {
          if (status === null)
            throw new TypeError("Do not expose URL credentials or sensitive error text");
          return { status: () => status };
        },
        async waitForLoadState(state) {
          calls.push(state);
        },
        async waitForTimeout(ms) {
          calls.push(ms);
        },
        evaluate: (fn, arg) => page.evaluate(fn, arg),
      };
      const result = await auditLayoutPage(adapter, "about:blank");
      const finalUrl = new URL(result.finalUrl);
      assert.equal(finalUrl.searchParams.get("q"), "Winnipeg");
      assert.equal(finalUrl.searchParams.get("look"), "clean");
      assert.equal(finalUrl.searchParams.get("code"), "[redacted]");
      assert.equal(finalUrl.hash, "");
      assert(!result.finalUrl.includes("synthetic-private"));
      assert(!result.finalUrl.includes("synthetic-fragment"));
      assert.equal(result.navigationStatus, status);
      assert.equal(result.navigationError, status === null ? "TypeError" : null);
      assert.deepEqual(calls, status === null ? ["load", 800] : [800]);
      assert.equal(result.fonts.status, "loaded");
      assert.equal(result.fonts.ready, true);
      assert.match(result.fonts.bodyFamily, /Arial/);
      assert(result.fonts.loadedFamilies.includes("SyntheticAuditFont"));
      assert(
        result.fonts.faces.some(
          (face) => face.family === "SyntheticAuditFont" && face.status === "loaded",
        ),
      );
      for (const key of ["overflow", "overlap", "spill", "small"])
        assert(Array.isArray(result.issues[key]));
      assert(!JSON.stringify(result).includes("sensitive error text"));
    }
  });
});
