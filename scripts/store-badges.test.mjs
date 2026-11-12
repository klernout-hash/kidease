import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { APP_STORES, AMAZON_STORE_URL } from "../src/lib/app-stores.ts";
import { en } from "../src/lib/copy-en.ts";
import { fr } from "../src/lib/copy-fr.ts";

const require = createRequire(import.meta.url);

// Render the real TSX, replacing router context and the unrelated Amazon opener.
function renderPanel(component, locale, stores = APP_STORES) {
  const path = fileURLToPath(new URL(`../src/components/${component}.tsx`, import.meta.url));
  const copy = locale === "fr" ? fr : en;
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const dependencies = {
    "@/lib/app-stores": { APP_STORES: stores, appShareUrl: (origin) => `${origin}/app` },
    "@/lib/use-copy": { useCopy: () => ({ locale, t: (key) => copy[key] }) },
    "@/lib/amazon-appstore": { AMAZON_APPSTORE_URL: () => AMAZON_STORE_URL, openAmazonListing: () => false },
    "@/components/ui/button": { Button: ({ children }) => children },
  };
  const load = (name) => dependencies[name] ?? require(name);
  new Function("require", "module", "exports", source)(load, module, module.exports);
  return renderToStaticMarkup(createElement(module.exports[component === "store-badges" ? "StoreBadges" : "AppStoreStatus"]));
}

function tile(html, name) {
  const match = [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].find(([markup]) => markup.includes(name));
  assert.ok(match, `Missing ${name} tile`);
  return match[0];
}

for (const locale of ["en", "fr"]) {
  const copy = locale === "fr" ? fr : en;
  for (const component of ["store-badges", "app-store-status"]) {
    test(`${component} ${locale}: Huawei is available without an invented download link`, () => {
      const huawei = tile(renderPanel(component, locale), "Huawei AppGallery");
      assert.ok(huawei.includes(copy.storeAvailableNow));
      assert.ok(!huawei.includes(copy.storeComingSoon));
      assert.doesNotMatch(huawei, /<a\b|href=/);
    });

    test(`${component} ${locale}: verified links and pending stores keep their behavior`, () => {
      const html = renderPanel(component, locale);
      const play = tile(html, "Google Play");
      assert.match(play, /<a\b[^>]*href="https:\/\/play\.google\.com\/store\/apps\/details\?id=ca\.kidease\.app"/);
      for (const name of ["App Store", "Galaxy Store", "Microsoft Store"]) {
        const pending = tile(html, name);
        assert.ok(pending.includes(copy.storeComingSoon));
        assert.doesNotMatch(pending, /<a\b|href=/);
      }
      const nonLive = APP_STORES.map((store) => store.id === "play" ? { ...store, live: false } : store);
      const pendingWithUrl = tile(renderPanel(component, locale, nonLive), "Google Play");
      assert.ok(pendingWithUrl.includes(copy.storeComingSoon));
      assert.doesNotMatch(pendingWithUrl, /<a\b|href=/);
    });
  }
}
