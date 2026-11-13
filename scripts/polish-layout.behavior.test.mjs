import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { chromium } from "playwright";
import { inspectLayout } from "./polish-layout.mjs";
import { inspectPolishReadiness, waitForPolishReadiness } from "./polish-readiness.mjs";

const enabled = process.env.POLISH_BROWSER_TESTS === "1";
describe(
  "layout collector browser behavior",
  {
    skip: enabled
      ? false
      : "Opt in with POLISH_BROWSER_TESTS=1; these require a local Chromium runtime.",
  },
  () => {
    let browser;
    before(async () => {
      const executablePath =
        process.env.POLISH_TEST_CHROME ||
        (process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : undefined);
      browser = await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });
    });
    after(async () => {
      await browser?.close();
    });
    async function fixture(html, check) {
      const context = await browser.newContext({
        viewport: { width: 400, height: 600 },
        serviceWorkers: "block",
      });
      try {
        await context.route("**/*", (route) => route.abort("blockedbyclient"));
        await context.routeWebSocket("**", (socket) => socket.close());
        const page = await context.newPage();
        await page.setContent(
          `<base href="http://127.0.0.1/"><style>html,body{margin:0;min-height:100%;font:16px/1.25 sans-serif}*{box-sizing:border-box}button,input,a{font:inherit}button,input{height:44px}button{min-width:44px}a{color:inherit}img{display:block}</style>${html}`,
        );
        await page.evaluate(() => {
          window.fixtureClicks = [];
          document.addEventListener("click", (event) => {
            const control = event.target.closest("button,a,input");
            window.fixtureClicks.push(control?.id || event.target.id);
            if (control?.tagName === "A") event.preventDefault();
          });
        });
        await check(page, await page.evaluate(inspectLayout));
      } finally {
        await context.close();
      }
    }
    const card = `<article data-slug="fixture-centre" style="position:absolute;left:20px;top:80px;width:300px"><div style="position:relative;width:300px;height:200px"><a id="photo" href="/daycare/fixture-centre" aria-label="View fixture centre" style="display:block;width:300px;height:200px"><img alt="Fixture centre" width="300" height="200" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></a><button id="save" data-ke="save-listing" aria-label="Save fixture centre" style="position:absolute;right:8px;top:8px;width:44px;height:44px;z-index:2">Save</button></div></article>`;
    const involves = (issue, a, b) =>
      [issue.target, issue.other].includes(a) && [issue.target, issue.other].includes(b);

    test("44px controls pass while43.8px width or height is under the touch floor", async () => {
      await fixture(
        `<div style="display:flex;gap:16px;padding:20px"><button id="exact" style="width:44px;min-width:0;height:44px">44px</button><button id="short" style="width:80px;min-width:0;height:43.8px">Short</button><button id="narrow" style="width:43.8px;min-width:0;height:44px">Thin</button></div>`,
        async (_page, audit) => {
          const undersized = audit.issues.filter((row) => row.kind === "tap-target-under-44");
          assert.deepEqual(new Set(undersized.map((row) => row.target)), new Set(["#short", "#narrow"]));
          assert.ok(undersized.find((row) => row.target === "#short").effectiveTarget.height < 44);
          assert.ok(undersized.find((row) => row.target === "#narrow").effectiveTarget.width < 44);
        },
      );
    });

    test("same-card image/save overlay keeps both controls independently operable", async () => {
      await fixture(card, async (page, audit) => {
        assert.ok(audit.observations.some((row) => row.kind === "same-card-photo-save-overlay"));
        assert.equal(audit.issues.filter((row) => row.kind === "interactive-overlap").length, 0);
        await page.mouse.click(290, 110);
        await page.mouse.click(100, 160);
        assert.deepEqual(await page.evaluate(() => window.fixtureClicks), ["save", "photo"]);
      });
    });
    test("a cookie action covering Save is a real collision, never a card-save exemption", async () => {
      await fixture(
        `${card}<button id="cookie" data-ke="cookie-allow" style="position:fixed;left:268px;top:88px;width:60px;height:44px;z-index:20">Allow</button>`,
        async (page, audit) => {
          assert.ok(
            audit.issues.some(
              (row) => row.kind === "interactive-overlap" && involves(row, "#save", "#cookie"),
            ),
          );
          assert.ok(
            audit.issues.some(
              (row) => row.kind === "interactive-occluded" && row.target === "#save",
            ),
          );
          await page.mouse.click(290, 110);
          assert.equal(await page.evaluate(() => window.fixtureClicks.at(-1)), "cookie");
        },
      );
    });
    test("ordinary scrollable content behind navigation is recorded as revealable occlusion", async () => {
      await fixture(
        `<div style="height:2200px"><a id="flow" href="#fixture" style="position:absolute;left:0;top:800px;width:80px;height:44px">Centre</a></div><nav style="position:fixed;left:0;top:0;width:400px;height:64px;background:Canvas;z-index:10"><button id="menu" style="width:80px;height:44px">Menu</button></nav>`,
        async (page) => {
          await page.evaluate(() => window.scrollTo(0, 780));
          const audit = await page.evaluate(inspectLayout);
          assert.ok(
            audit.observations.some((row) => row.kind === "scroll-revealable-navigation-occlusion"),
          );
          assert.equal(
            audit.issues.filter(
              (row) => row.kind === "interactive-overlap" || row.kind === "interactive-occluded",
            ).length,
            0,
          );
        },
      );
    });
    test("navigation permanently covering an action without scroll room fails", async () => {
      await fixture(
        `<a id="flow" href="#fixture" style="position:absolute;left:0;top:20px;width:80px;height:44px">Centre</a><nav style="position:fixed;left:0;top:0;width:400px;height:64px;background:Canvas;z-index:10"><button id="menu" style="width:80px;height:44px">Menu</button></nav>`,
        async (_page, audit) => {
          assert.ok(
            audit.issues.some(
              (row) => row.kind === "interactive-occluded" && row.target === "#flow",
            ),
          );
        },
      );
    });
    test("two fixed controls colliding are not excused as navigation chrome", async () => {
      await fixture(
        `<button id="help" style="position:fixed;left:300px;bottom:0;width:60px;height:44px">Help</button><nav style="position:fixed;left:0;bottom:0;width:400px;height:64px;background:Canvas;z-index:10"><button id="tab" style="position:absolute;left:300px;bottom:0;width:60px;height:44px">Menu</button></nav>`,
        async (_page, audit) => {
          assert.ok(
            audit.issues.some(
              (row) => row.kind === "interactive-overlap" && involves(row, "#help", "#tab"),
            ),
          );
        },
      );
    });
    const rail = `<div id="rail" style="position:absolute;left:0;top:100px;width:120px;height:60px;overflow-x:auto;overflow-y:hidden"><button id="chip" style="position:absolute;left:80px;top:0;width:140px;height:44px">Child care</button></div>`;
    test("scroll clipping removes non-visible geometric intersections", async () => {
      await fixture(
        `${rail}<button id="outside" style="position:absolute;left:160px;top:100px;width:60px;height:44px">Filters</button>`,
        async (_page, audit) => {
          assert.equal(audit.issues.filter((row) => row.kind === "interactive-overlap").length, 0);
        },
      );
    });
    test("a collision within the visible rail area still fails", async () => {
      await fixture(
        `${rail}<button id="cookie" style="position:fixed;left:90px;top:100px;width:44px;height:44px;z-index:10">Allow</button>`,
        async (page, audit) => {
          assert.ok(
            audit.issues.some(
              (row) => row.kind === "interactive-overlap" && involves(row, "#chip", "#cookie"),
            ),
          );
          await page.mouse.click(105, 120);
          assert.equal(await page.evaluate(() => window.fixtureClicks.at(-1)), "cookie");
        },
      );
    });
    test("a non-scrollable clipping ancestor cannot silently hide an action", async () => {
      await fixture(
        `<div style="position:absolute;left:0;top:100px;width:120px;height:20px;overflow:hidden"><button id="clipped" style="position:absolute;top:40px;left:0;width:80px;height:44px">Hidden action</button></div>`,
        async (_page, audit) => {
          assert.ok(
            audit.issues.some(
              (row) => row.kind === "interactive-clipped" && row.target === "#clipped",
            ),
          );
        },
      );
    });
    test("an active modal limits the audit to its actual interactive scope", async () => {
      await fixture(
        `<button id="background" style="width:20px;height:20px;min-width:20px">Outside</button><div id="modal" role="dialog" aria-modal="true" aria-label="Fixture dialog" style="position:fixed;inset:0;z-index:10;background:Canvas"><button id="inside" style="width:80px;height:44px">Continue</button></div>`,
        async (_page, audit) => {
          assert.equal(audit.page.scope, "active-modal-only");
          assert.equal(audit.page.activeDialog, "#modal");
          assert.equal(
            audit.issues.some((row) => row.target === "#background"),
            false,
          );
        },
      );
    });
    const password = (padding) =>
      `<label for="password">Password</label><div style="position:relative;width:240px;height:44px"><input id="password" type="password" aria-label="Password" style="width:240px;height:44px;padding-right:${padding}px"><button id="toggle" type="button" aria-label="Show password" aria-controls="password" style="position:absolute;right:0;top:0;width:44px;height:44px">Show</button></div><script>document.querySelector('#toggle').onclick=()=>document.querySelector('#password').type='text';</script>`;
    test("a reserved password toggle is operable without covering the text content", async () => {
      await fixture(password(52), async (page, audit) => {
        assert.ok(audit.observations.some((row) => row.kind === "reserved-password-toggle"));
        assert.equal(audit.issues.filter((row) => row.kind === "interactive-overlap").length, 0);
        await page.locator("#password").fill("local fixture");
        await page.locator("#toggle").click();
        assert.equal(await page.locator("#password").getAttribute("type"), "text");
      });
    });
    test("an unreserved password toggle covering text fails", async () => {
      await fixture(password(8), async (_page, audit) =>
        assert.ok(
          audit.issues.some(
            (row) => row.kind === "interactive-overlap" && involves(row, "#password", "#toggle"),
          ),
        ),
      );
    });
    test("an associated 44px label is an actual checkbox hit target", async () => {
      await fixture(
        `<label id="label" for="check" style="display:block;width:160px;height:44px"><input id="check" type="checkbox" style="width:16px;height:16px">Email updates</label>`,
        async (page, audit) => {
          assert.equal(audit.issues.filter((row) => row.kind === "tap-target-under-44").length, 0);
          await page.locator("#label").click({ position: { x: 130, y: 20 } });
          assert.equal(await page.locator("#check").isChecked(), true);
        },
      );
    });
    test("h1 plus loading count/skeleton is never loaded search coverage", async () => {
      await fixture(
        `<h1>Winnipeg</h1><p data-ke="search-count"><span class="ke-skel">Loading centres…</span></p><div class="ke-search-results"><div aria-busy="true"><div class="ke-skel" style="width:200px;height:120px"></div></div></div>`,
        async (page) => {
          const state = await page.evaluate(inspectPolishReadiness, { pageId: "search" });
          assert.equal(state.ready, false);
          assert.equal(state.state, "pending");
        },
      );
    });
    const results = `<h1>Winnipeg</h1><p data-ke="search-count">1 licensed centre</p><div class="ke-search-results"><div data-ke="search-result-list"><article data-slug="fixture-centre"><h3>Fixture centre</h3><div data-slug="fixture-centre">Licensed child care</div></article></div></div>`;
    test("actual results settle, deduplicate listing markup and reset after a loading transition", async () => {
      await fixture(results, async (page) => {
        const stable = await waitForPolishReadiness(page, {
          pageId: "search",
          stableMs: 60,
          pollMs: 20,
          timeoutMs: 1000,
        });
        assert.equal(stable.state, "results");
        assert.equal(stable.uniqueListingCount, 1);
        assert.ok(stable.samples >= 2);
        await page.evaluate(() => {
          document.querySelector('[data-ke="search-count"]').textContent =
            "Chargement des centres…";
          document.querySelector(".ke-search-results").innerHTML =
            '<div aria-busy="true">Chargement</div>';
        });
        assert.equal(
          (await page.evaluate(inspectPolishReadiness, { pageId: "search" })).ready,
          false,
        );
      });
    });
    test("settled empty and settled failure surfaces remain distinct", async () => {
      await fixture(
        `<h1>Search</h1><p data-ke="search-count">0 licensed centres</p><div class="ke-search-results"><p class="font-display">No licensed centres in this radius.</p><button>Change location</button></div>`,
        async (page) => {
          const empty = await page.evaluate(inspectPolishReadiness, { pageId: "search" });
          assert.equal(empty.state, "empty");
          assert.equal(empty.ready, true);
          assert.equal(empty.healthy, true);
          await page.locator("p.font-display").evaluate((node) => {
            node.textContent = "Couldn't load centres";
          });
          const error = await page.evaluate(inspectPolishReadiness, { pageId: "search" });
          assert.equal(error.state, "error");
          assert.equal(error.ready, true);
          assert.equal(error.healthy, false);
        },
      );
    });
    test("home requires actual discovery cards, not only its heading", async () => {
      await fixture(
        `<div data-ke="home-discovery-surface"><h1>Find licensed daycare</h1></div>`,
        async (page) => {
          assert.equal(
            (await page.evaluate(inspectPolishReadiness, { pageId: "home" })).ready,
            false,
          );
          await page.locator('[data-ke="home-discovery-surface"]').evaluate((node) => {
            node.insertAdjacentHTML(
              "beforeend",
              '<article data-slug="fixture-centre"><h3>Fixture centre</h3></article>',
            );
          });
          assert.equal(
            (await page.evaluate(inspectPolishReadiness, { pageId: "home" })).uniqueListingCount,
            1,
          );
        },
      );
    });
    test("listing SEO-only content does not qualify as fully loaded listing data", async () => {
      await fixture(
        `<h1>Fixture centre</h1><ul data-ke="listing-highlights"><li>Early SEO summary</li></ul>`,
        async (page) => {
          assert.equal(
            (await page.evaluate(inspectPolishReadiness, { pageId: "listing" })).ready,
            false,
          );
          await page.evaluate(() => {
            document.body.innerHTML = '<div data-ke="listing-name"><h1>Fixture centre</h1></div>';
          });
          assert.equal(
            (await page.evaluate(inspectPolishReadiness, { pageId: "listing" })).ready,
            true,
          );
        },
      );
    });
    test("login requires the actual email form and primary action", async () => {
      await fixture(`<h1>Sign in</h1><div data-ke="login-split"></div>`, async (page) => {
        assert.equal(
          (await page.evaluate(inspectPolishReadiness, { pageId: "login" })).ready,
          false,
        );
        await page.locator('[data-ke="login-split"]').evaluate((node) => {
          node.innerHTML =
            '<form data-ke="email-sign-in"><label>Email<input type="email"></label><button type="button" data-ke="email-primary">Sign in</button></form>';
        });
        assert.equal(
          (await page.evaluate(inspectPolishReadiness, { pageId: "login" })).ready,
          true,
        );
      });
    });
    test("parent data must settle and a flags-off desk is never healthy feature coverage", async () => {
      await fixture(
        `<div data-ke="parent-home" data-settled="0"><section data-ke="parent-home-saved">Saved centres</section></div>`,
        async (page) => {
          assert.equal(
            (await page.evaluate(inspectPolishReadiness, { pageId: "parent" })).ready,
            false,
          );
          await page
            .locator('[data-ke="parent-home"]')
            .evaluate((node) => node.setAttribute("data-settled", "1"));
          assert.equal(
            (await page.evaluate(inspectPolishReadiness, { pageId: "parent" })).ready,
            true,
          );
          await page.evaluate(() => {
            document.body.innerHTML =
              '<div class="ke-dense"><p class="font-display">Staff shifts are off</p><button>Back to today</button></div>';
          });
          const gated = await page.evaluate(inspectPolishReadiness, { pageId: "staff" });
          assert.equal(gated.state, "gated");
          assert.equal(gated.ready, true);
          assert.equal(gated.healthy, false);
        },
      );
    });
  },
);
