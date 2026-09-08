import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    assert.equal(parseThemePreference("nope"), "system");
    assert.equal(parseThemePreference(null), "system");
    assert.equal(parseThemePreference(undefined), "system");
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
      assert.equal(readThemePreference(), "system");
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
    assert.equal(meta.content, "#14161c");
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
    assert.match(rootHtml, /src="\/theme-boot\.js"/);
    assert.match(rootHtml, /data-theme="system"/);
    assert.match(rootHtml, /ThemeBoot/);
  });

  it("dark tokens follow resolved theme and System follows the OS", () => {
    const css = src("src/styles.css");
    assert.match(css, /@custom-variant dark/);
    assert.match(css, /data-resolved-theme="dark"/);
    assert.match(css, /prefers-color-scheme: dark/);
    assert.match(css, /html:not\(\[data-theme="light"\]\)/);
    assert.match(css, /--color-bg: #14161c/);
    assert.match(css, /color-scheme: dark/);
  });

  it("exposes Light / Dark / System on Account, Menu, header, and drawer", () => {
    const control = src("src/components/appearance-control.tsx");
    const account = src("src/routes/account.tsx");
    const menu = src("src/routes/menu.tsx");
    const shell = src("src/components/shell.tsx");
    const drawer = src("src/components/nav-drawer.tsx");
    const copy = src("src/lib/copy.ts");
    assert.match(control, /role="radiogroup"/);
    assert.match(control, /appearanceLight/);
    assert.match(control, /appearanceDark/);
    assert.match(control, /appearanceSystem/);
    assert.match(control, /aria-label=\{t\("appearance"\)\}/);
    assert.match(account, /AppearanceControl/);
    assert.match(menu, /AppearanceControl/);
    assert.match(shell, /AppearanceControl variant="select"/);
    assert.match(drawer, /AppearanceControl/);
    assert.match(copy, /appearance: "Appearance"/);
    assert.match(copy, /appearance: "Apparence"/);
    assert.match(copy, /appearanceSystem: "System"/);
    assert.match(copy, /appearanceSystem: "Système"/);
  });
});
