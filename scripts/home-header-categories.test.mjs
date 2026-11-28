import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FACILITY_TYPES } from "../src/lib/facility-type.ts";
import { careCategoryArt } from "../src/lib/care-category-art.ts";
import { localePath } from "../src/lib/locale-path.ts";
import { en } from "../src/lib/copy-en.ts";
import { fr } from "../src/lib/copy-fr.ts";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function iconComponent() {
  const module = { exports: {} };
  const compiled = ts.transpileModule(read("src/components/care-category-icon.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(compiled).runInNewContext({
    module, exports: module.exports,
    require: (name) => name === "@/lib/care-category-art" ? { careCategoryArt } : require(name),
  });
  return module.exports.CareCategoryIcon;
}

test("Explore renders the shared category row once across viewports and looks", () => {
  const home = read("src/routes/index.tsx");
  const sheet = read("src/components/mobile-search-sheet.tsx");
  assert.equal((home.match(/<MobileSearchHome/g) ?? []).length, 1);
  assert.doesNotMatch(home, /headerCategories=|<HomeCareTypeRow|<AirbnbCareCategories/);
  assert.equal((sheet.match(/data-ke="msv2-categories"/g) ?? []).length, 1);
  assert.match(sheet, /MOBILE_CATEGORIES.map/);
  assert.match(sheet, /mobileSearchParams\(next\)/);
  assert.match(read("public/look-boot.js"), /DEFAULT_LOOK = "classic"/);

});

for (const locale of ["en", "fr"]) {
  test(`${locale} header renders all six reachable category links with the current city`, () => {
    const links = [];
    const module = { exports: {} };
    const dependencies = {
      "@/components/care-category-icon": { CareCategoryIcon: iconComponent() },
      "@/lib/facility-type": { FACILITY_TYPES },
      "@/lib/locale-path": { localePath },
      "@/lib/use-copy": { useCopy: () => ({ locale, t: (key) => (locale === "fr" ? fr : en)[key] }) },
      "@tanstack/react-router": {
        Link: ({ to, search, children, ...props }) => {
          links.push({ to, search, props });
          return createElement("a", { ...props, href: `${to}?${new URLSearchParams(search)}` }, children);
        },
      },
    };
    const compiled = ts.transpileModule(read("src/components/facility-type-rails.tsx"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new vm.Script(compiled).runInNewContext({
      module, exports: module.exports,
      require: (name) => dependencies[name] ?? require(name),
    });
    const { HomeCareTypeRow, BROWSE_DAYCARE_TYPES } = module.exports;
    const html = renderToStaticMarkup(createElement(HomeCareTypeRow, {
      compact: true, toSearch: true, selected: "family_home", city: "  Montréal, QC  ",
      onSelect: () => assert.fail("Navigation must keep the existing link behavior"),
    }));
    assert.equal(links.length, 6);
    assert.match(html, /overflow-x-auto/);
    assert.match(html, /min-h-11/);
    assert.doesNotMatch(html, /data-fit="1"|<button/);
    assert.equal((html.match(/class="ke-category-icon"/g) ?? []).length, 6);
    assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 6);
    assert.match(html, /<source srcSet="\/photos\/care-icons\/[^"]+\.webp" type="image\/webp"/);
    assert.match(html, /alt="" width="128" height="128"/);
    for (const [index, link] of links.entries()) {
      const type = BROWSE_DAYCARE_TYPES[index];
      assert.equal(link.to, locale === "fr" ? "/fr/search" : "/search");
      assert.equal(link.search.q, "Montréal, QC");
      assert.equal(type === "before_after" ? link.search.cat : link.search.fac, type === "before_after" ? "before-after" : type);
      assert.equal(link.props["aria-current"], type === "family_home" ? "page" : undefined);
      assert.ok(!link.props.className.split(/\s+/).includes("hidden"));
      assert.ok(html.includes(`src="${careCategoryArt(type).src}"`));
      const label = (locale === "fr" ? fr : en)[module.exports.BROWSE_RAIL_COPY[type]];
      const escapedLabel = renderToStaticMarkup(createElement("span", null, label)).slice(6, -7);
      assert.ok(html.includes(escapedLabel));
    }
    assert.ok(html.includes((locale === "fr" ? fr : en).railByCare));
  });
}
