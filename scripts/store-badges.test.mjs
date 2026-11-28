import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { APP_STORES, AMAZON_STORE_URL, appStoreById, liveAppStores } from "../src/lib/app-stores.ts";
import { huaweiBadgeAlt } from "../src/lib/huawei-badge-alt.ts";
import { en } from "../src/lib/copy-en.ts";
import { fr } from "../src/lib/copy-fr.ts";

const require = createRequire(import.meta.url);
const EXPORTS = {
  "store-badges": "StoreBadges",
  "app-store-status": "AppStoreStatus",
  "footer-app-badges": "FooterAppBadges",
};

// Render the real TSX, replacing router context and the unrelated Amazon opener.
function renderPanel(component, locale, stores = APP_STORES, native = false) {
  const copy = locale === "fr" ? fr : en;
  const compiled = new Map();
  const dependencies = {
    "@/lib/app-stores": {
      APP_STORES: stores,
      appShareUrl: (origin) => `${origin}/app`,
      appStoreById: (id) => appStoreById(id, stores),
      liveAppStores: () => liveAppStores(stores),
    },
    "@/lib/use-native-shell": { useNativeHidesAdmin: () => native },
    "@/lib/use-copy": { useCopy: () => ({ locale, t: (key) => copy[key] }) },
    "@/lib/amazon-appstore": { AMAZON_APPSTORE_URL: () => AMAZON_STORE_URL, openAmazonListing: () => false },
    "@/lib/locale-path": { localePath: (path) => (locale === "fr" ? `/fr${path}` : path) },
    "@/lib/huawei-badge-alt": { huaweiBadgeAlt },
    "@/components/ui/button": { Button: ({ children }) => children },
    "@tanstack/react-router": {
      Link: ({ to, children, className }) => createElement("a", { href: to, className }, children),
    },
  };
  const load = (name) => {
    if (name.startsWith("@/components/") && name !== "@/components/ui/button") {
      return compile(name.slice("@/components/".length));
    }
    return dependencies[name] ?? require(name);
  };
  function compile(file) {
    if (compiled.has(file)) return compiled.get(file);
    const path = fileURLToPath(new URL(`../src/components/${file}.tsx`, import.meta.url));
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} };
    compiled.set(file, module.exports);
    new Function("require", "module", "exports", source)(load, module, module.exports);
    compiled.set(file, module.exports);
    return module.exports;
  }
  return renderToStaticMarkup(createElement(compile(component)[EXPORTS[component]]));
}

function tile(html, name) {
  const match = [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].find(([markup]) => markup.includes(name));
  assert.ok(match, `Missing ${name} tile`);
  return match[0];
}

for (const locale of ["en", "fr"]) {
  const copy = locale === "fr" ? fr : en;
  for (const component of ["store-badges", "app-store-status"]) {
    test(`${component} ${locale}: Huawei links to the verified AppGallery listing`, () => {
      const huawei = tile(renderPanel(component, locale), "Huawei AppGallery");
      assert.ok(huawei.includes(copy.storeAvailableNow) || huawei.includes("Huawei AppGallery"));
      assert.ok(!huawei.includes(copy.storeComingSoon));
      assert.match(huawei, /href="https:\/\/appgallery\.huawei\.com\/#\/app\/C119648761"/);
      assert.match(huawei, /target="_blank"/);
      assert.match(huawei, /rel="noopener noreferrer"/);
      if (component === "store-badges") {
        const alt = locale === "fr" ? "Découvrez-le sur AppGallery" : "Explore it on AppGallery";
        assert.match(huawei, /src="\/store\/badges\/huawei-en\.svg"/);
        assert.match(huawei, new RegExp(`alt="${alt}"`));
        assert.match(huawei, /class="ke-store-badge h-10 w-auto max-w-none"/);
      }
    });

    test(`${component} ${locale}: only live stores with download links are shown`, () => {
      const html = renderPanel(component, locale);
      const play = tile(html, "Google Play");
      assert.match(play, /<a\b[^>]*href="https:\/\/play\.google\.com\/store\/apps\/details\?id=ca\.kidease\.app"/);
      assert.equal([...html.matchAll(/<li\b/g)].length, 3);
      assert.ok(!html.includes(copy.storeComingSoon));
      const nonLive = APP_STORES.map((store) => store.id === "play" ? { ...store, live: false } : store);
      assert.doesNotMatch(renderPanel(component, locale, nonLive), /Google Play|play\.google\.com/);
    });
  }
}

test("Google Play English badge is the official 646×250 file", () => {
  const bytes = readFileSync(new URL("../public/store/badges/play-en.png", import.meta.url));
  assert.equal(bytes.readUInt32BE(16), 646);
  assert.equal(bytes.readUInt32BE(20), 250);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849",
  );
});

test("AppGallery badge is the black English SVG at the same 168px art height as Amazon", () => {
  const svg = readFileSync(new URL("../public/store/badges/huawei-en.svg", import.meta.url), "utf8");
  assert.match(svg, /viewBox="0 0 564 168"/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svg, /fill="#000"/);
  assert.match(svg, /fill="#c8102e"/);
  assert.doesNotMatch(svg, /<text[\s>]/);
  const amazon = readFileSync(new URL("../public/store/badges/amazon-en.png", import.meta.url));
  assert.equal(amazon.readUInt32BE(20), 168);
});

for (const locale of ["en", "fr"]) {
  test(`footer badge snapshot ${locale}`, () => {
    const html = renderPanel("footer-app-badges", locale);
    const alt = locale === "fr" ? "Découvrez-le sur AppGallery" : "Explore it on AppGallery";
    const row = html.match(/<ul class="ke-footer-store-row">[\s\S]*?<\/ul>/);
    assert.ok(row, "missing footer badge row");
    assert.equal(row[0], [
      '<ul class="ke-footer-store-row">',
      '<li><a href="https://play.google.com/store/apps/details?id=ca.kidease.app" class="ke-footer-store-badge" aria-label="',
      locale === "fr" ? "Télécharger · Google Play" : "Download · Google Play",
      '" rel="noopener noreferrer" data-ke="footer-store-play"><span class="ke-footer-store-art"><img src="',
      locale === "fr" ? "/store/badges/play-fr.png" : "/store/badges/play-en.png",
      '" alt="" width="646" height="250" class="ke-store-badge h-10 w-auto max-w-none" loading="lazy" decoding="async"/></span></a></li>',
      '<li><a href="https://www.amazon.com/gp/mas/dl/android?p=ca.kidease.app" class="ke-footer-store-badge" aria-label="',
      locale === "fr" ? "Télécharger · Amazon Appstore" : "Download · Amazon Appstore",
      '" rel="noopener noreferrer" data-ke="footer-store-amazon"><span class="ke-footer-store-art"><img src="',
      locale === "fr" ? "/store/badges/amazon-fr.png" : "/store/badges/amazon-en.png",
      '" alt="" width="572" height="168" class="ke-store-badge h-10 w-auto max-w-none" loading="lazy" decoding="async"/></span></a></li>',
      '<li><a href="https://appgallery.huawei.com/#/app/C119648761" class="ke-footer-store-badge" aria-label="',
      alt,
      '" target="_blank" rel="noopener noreferrer" data-ke="footer-store-huawei"><span class="ke-footer-store-art"><img src="/store/badges/huawei-en.svg" alt="',
      alt,
      '" width="564" height="168" class="ke-store-badge h-10 w-auto max-w-none" loading="lazy" decoding="async"/></span></a></li>',
      "</ul>",
    ].join(""));
  });
}

test("native shells omit the shared download panel", () => {
  assert.equal(renderPanel("app-store-status", "en", APP_STORES, true), "");
});
