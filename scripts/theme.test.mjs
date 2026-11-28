import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTheme,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from "../src/lib/theme.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("theme preference", () => {
  it("parses only light, dark, and system", () => {
    assert.equal(parseThemePreference("light"), "light");
    assert.equal(parseThemePreference("dark"), "dark");
    assert.equal(parseThemePreference("system"), "system");
    assert.equal(parseThemePreference("nope"), "light");
    assert.equal(parseThemePreference(null), "light");
    assert.equal(parseThemePreference(undefined), "light");
  });

  it("resolves System from prefers-color-scheme", () => {
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("system", false), "light");
  });

  it("persists the preference under the KidEase storage key", () => {
    const memory = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (key) => (memory.has(key) ? memory.get(key) : null),
        setItem: (key, value) => {
          memory.set(key, value);
        },
      },
    };
    try {
      assert.equal(THEME_STORAGE_KEY, "kidease-theme");
      assert.equal(readThemePreference(), "light");
      writeThemePreference("dark");
      assert.equal(memory.get(THEME_STORAGE_KEY), "dark");
      assert.equal(readThemePreference(), "dark");
    } finally {
      delete globalThis.window;
    }
  });

  it("applies data-theme and data-resolved-theme on the document", () => {
    const meta = {
      content: "#1A3790",
      setAttribute(name, value) {
        if (name === "content") this.content = value;
      },
    };
    const rootEl = {
      dataset: {},
      style: { colorScheme: "" },
      ownerDocument: {
        querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
      },
    };
    const resolved = applyTheme("dark", rootEl);
    assert.equal(resolved, "dark");
    assert.equal(rootEl.dataset.theme, "dark");
    assert.equal(rootEl.dataset.resolvedTheme, "dark");
    assert.equal(rootEl.style.colorScheme, "dark");
    assert.equal(meta.content, "#101218");
  });
});

describe("appearance is wired across public + desks chrome", () => {
  it("boots the stored theme before CSS to avoid a flash", () => {
    const boot = src("public/theme-boot.js");
    const rootHtml = src("src/routes/__root.tsx");
    assert.match(boot, /kidease-theme/);
    assert.match(boot, /prefers-color-scheme: dark/);
    assert.match(boot, /dataset\.theme/);
    assert.match(boot, /dataset\.resolvedTheme/);
    assert.match(rootHtml, /src="\/theme-boot\.js\?v=2"/);
    assert.match(rootHtml, /data-theme="light"/);
    assert.match(rootHtml, /data-resolved-theme="light"/);
    assert.doesNotMatch(rootHtml, /data-theme="dark"/);
    assert.match(rootHtml, /ThemeBoot/);
  });

  it("first paint is Light for new visitors and keeps a saved Dark / System choice", () => {
    const boot = src("public/theme-boot.js");
    for (const [stored, osDark, preference, resolved] of [
      [null, false, "light", "light"],
      [null, true, "light", "light"],
      ["garbage", true, "light", "light"],
      [undefined, true, "light", "light"],
      ["light", true, "light", "light"],
      ["dark", false, "dark", "dark"],
      ["system", true, "system", "dark"],
      ["system", false, "system", "light"],
    ]) {
      const rootEl = { dataset: {}, style: {} };
      runInNewContext(boot, {
        window: {
          matchMedia: () => ({ matches: osDark }),
          localStorage: {
            getItem: () => {
              if (stored === undefined) throw new Error("Storage unavailable");
              return stored;
            },
          },
        },
        document: { documentElement: rootEl },
      });
      assert.deepEqual({ ...rootEl.dataset }, { theme: preference, resolvedTheme: resolved }, `stored=${stored} osDark=${osDark}`);
      assert.equal(rootEl.style.colorScheme, resolved);
    }
  });

  it("a failed account read never overrides this device's saved choice", () => {
    const prefs = src("src/lib/server/account-prefs.ts");
    const getter = prefs.slice(prefs.indexOf("export const getMyTheme"), prefs.indexOf("export const saveMyTheme"));
    assert.doesNotMatch(getter, /\} catch/);
    assert.doesNotMatch(getter, /DEFAULT_THEME_PREFERENCE/);
    assert.match(src("src/components/theme-boot.tsx"), /\.catch\(\(\) => undefined\)/);
  });

  it("dark tokens follow resolved theme and System follows the OS", () => {
    const css = src("src/styles.css");
    assert.match(css, /@custom-variant dark/);
    assert.match(css, /data-resolved-theme="dark"/);
    assert.match(css, /prefers-color-scheme: dark/);
    assert.match(css, /html:not\(\[data-theme="light"\]\)/);
    assert.match(css, /html\[data-theme="dark"\],\s*html\[data-resolved-theme="dark"\] \{[^}]*--color-bg: #101218;/);
    assert.match(css, /color-scheme: dark/);
  });

  it("exposes Light / Dark / System on Account, Menu, header, and drawer", () => {
    const control = src("src/components/appearance-control.tsx");
    const account = src("src/routes/account.tsx");
    const menu = src("src/components/app-menu-screen.tsx");
    const shell = src("src/components/shell.tsx");
    const drawer = src("src/components/nav-drawer.tsx");
    const copy = (src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts"));
    assert.match(control, /role="radiogroup"/);
    assert.match(control, /appearanceLight/);
    assert.match(control, /appearanceDark/);
    assert.match(control, /appearanceSystem/);
    assert.match(control, /aria-label=\{t\("appearance"\)\}/);
    assert.match(account, /AppearanceControl/);
    assert.match(menu, /AppearanceControl/);
    assert.match(drawer, /AppearanceControl/);
    assert.match(drawer, /LanguageSelect/);
    assert.doesNotMatch(shell, /LanguageSelect compact/);
    assert.doesNotMatch(shell, /AppearanceControl variant="select" compact/);
    assert.match(copy, /appearance: "Appearance"/);
    assert.match(copy, /appearance: "Apparence"/);
    assert.match(copy, /appearanceSystem: "System"/);
    assert.match(copy, /appearanceSystem: "Système"/);
  });

  it("header language and appearance pills match desk pill size", () => {
    const desk = src("src/components/desk-switcher.tsx");
    const lang = src("src/components/language-select.tsx");
    const appearance = src("src/components/appearance-control.tsx");
    const css = src("src/styles.css");
    const shell = src("src/components/shell.tsx");
    const drawer = src("src/components/nav-drawer.tsx");
    assert.match(desk, /min-h-11 w-full items-center rounded-lg px-2\.5 text-left text-sm font-medium/);
    assert.match(lang, /ke-header-chrome h-8 min-h-8 px-2\.5 text-\[11px\] leading-none/);
    assert.match(appearance, /ke-header-chrome h-8 min-h-8 min-w-\[5\.5rem\] px-2\.5 text-\[11px\] leading-none/);
    assert.match(appearance, /min-w-\[5\.5rem\]/);
    assert.match(appearance, /shrink-0/);
    assert.match(css, /select\.ke-lang-select\.ke-header-chrome/);
    assert.match(css, /font-size: 11px/);
    assert.match(drawer, /LanguageSelect/);
    assert.match(drawer, /AppearanceControl/);
    assert.doesNotMatch(shell, /LanguageSelect compact/);
  });

  it("website chrome stays compact at every width — no xl wide nav or sign-in row", () => {
    const shell = src("src/components/shell.tsx");
    const header = src("src/components/header-social.tsx");
    assert.doesNotMatch(shell, /desktopNav/);
    assert.doesNotMatch(shell, /\[\[data-channel=website\]_&\]:xl:flex/);
    assert.doesNotMatch(shell, /\[\[data-channel=website\]_&\]:xl:hidden/);
    assert.match(src("src/components/site-footer.tsx"), /HeaderSocial/);
    assert.doesNotMatch(shell, /HeaderSocial/);
    assert.match(shell, /\[\[data-channel=website\]_&\]:flex/);
    assert.match(shell, /\[\[data-channel=website\]_&\]:grid/);
    assert.match(shell, /aria-label=\{t\("menu"\)\}/);
    assert.match(shell, /aria-controls="ke-nav-drawer"/);
    assert.match(shell, /size-12 min-h-\[44px\] min-w-\[44px\] shrink-0 place-items-center/);
    assert.match(header, /\[\[data-channel=website\]_&\]:flex/);
    assert.doesNotMatch(header, /xl:hidden/);
    assert.doesNotMatch(header, /xl:flex/);
  });
});
