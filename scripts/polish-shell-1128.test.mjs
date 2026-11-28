import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { helpLauncherFor, helpLauncherVisible } from "../src/lib/help-launcher.ts";
import { DRAWER_TAP_GUARD_MS } from "../src/lib/drawer-latch.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("P3-1 / P3-6: no floating Help bubble on the check-in kiosk (EN and FR)", () => {
  for (const pathname of ["/kiosk", "/fr/kiosk", "/kiosk/", "/kiosk/door"]) {
    assert.equal(helpLauncherVisible(pathname), false, pathname);
    for (const channel of ["web", "native"]) {
      assert.equal(helpLauncherFor({ pathname, role: "provider", channel }), false, `${channel} ${pathname}`);
    }
  }
  // Look-alike paths keep the bubble.
  assert.equal(helpLauncherVisible("/kiosks"), true);
  assert.equal(helpLauncherVisible("/provider"), true);
  // The kiosk keeps its own Help button.
  assert.match(src("src/routes/kiosk.tsx"), /data-ke="help-button"/);
});

test("P3-6: the kiosk screen is centred and clears the safe areas", () => {
  const kiosk = src("src/routes/kiosk.tsx");
  const main = kiosk.slice(kiosk.indexOf("<main", kiosk.indexOf("const needsPin")), kiosk.indexOf('data-ke="fire-kiosk"'));
  assert.match(main, /ke-safe-x/);
  assert.match(main, /pt-\[max\(2rem,env\(safe-area-inset-top\)\)\]/);
  assert.match(main, /pb-\[max\(2rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(main, /min-h-\[100dvh\]/);
  assert.match(main, /\[&>\*\]:mx-auto/);
  assert.match(main, /\[&>\*\]:max-w-5xl/);
});

test("P3-5: the email-code banner sits inside the desk content column", () => {
  const provider = src("src/routes/provider.tsx");
  const banner = provider.indexOf("<HealthSecondFactorBanner />");
  const shell = provider.indexOf("<DeskShell");
  assert.ok(banner > 0 && shell > 0);
  assert.equal(provider.split("<HealthSecondFactorBanner />").length - 1, 1, "rendered once");
  assert.ok(banner > shell, "banner is a DeskShell child, not above the shell");
  const close = provider.indexOf("</DeskShell>", shell);
  assert.ok(banner < close);
  // DeskShell children render in the content column next to the rail.
  assert.match(src("src/components/desk-shell.tsx"), /<div className=\{cn\("min-w-0 flex-1"[^\n]*>\{children\}<\/div>/);
});

test("N-30: menu rows ignore taps until the open guard ends", () => {
  assert.equal(typeof DRAWER_TAP_GUARD_MS, "number");
  assert.ok(DRAWER_TAP_GUARD_MS >= 200 && DRAWER_TAP_GUARD_MS <= 400, "short enough to feel instant");
  const drawer = src("src/components/nav-drawer.tsx");
  assert.match(drawer, /<nav className="flex-1 px-3 py-3" inert=\{!rowsLive\} data-ke="drawer-rows">/);
  assert.match(drawer, /inert=\{!rowsLive\} data-ke="drawer-rows-head"/);
  assert.match(drawer, /window\.setTimeout\(\(\) => setLiveFor\(openCount\), DRAWER_TAP_GUARD_MS\)/);
  assert.match(drawer, /window\.clearTimeout\(id\)/);
  // The close button stays live (it is outside the guarded rows).
  const close = drawer.indexOf("ref={closeRef}");
  assert.ok(close > 0 && close < drawer.indexOf('data-ke="drawer-rows-head"'));
});
