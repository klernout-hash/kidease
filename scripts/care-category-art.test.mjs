import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { airbnbCopy } from "../src/lib/airbnb-ui-copy.ts";
import { CARE_CATEGORY_SOURCES, careCategoryArt } from "../src/lib/care-category-art.ts";
import { listingSubsidy } from "../src/lib/fee-program.ts";
import { localePath } from "../src/lib/locale-path.ts";
import { cn } from "../src/lib/utils.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

// Feel-photo sources, plus the shipped 128px gif and the reduced-motion jpg.
const photos = {
  all: ["community.jpg", "5de1f0b5c172d90261ab679f572d845f663b2645236cd1a4671664b2136e7bb0", "79aa741b3c8b66088182b91cc38981570f310457840eb7c9ee8485486affcf0d"],
  child_care_centre: ["brick.jpg", "382cc6f0829205b51f2932e1eb1c89e2a39b8647d348231920031b037b29f9c5", "e3c127702f73ed90216f749dbac86ba86cf90c5fe6af59a29615fae6e694f83d"],
  family_home: ["cottage.jpg", "e10b2bcc5cfcafdf525692baaadde1bc190efef5315f590e5fae6739f6a0c87d", "65e4bd7ccc1c0835c693fdc286c7745426fb7df476fdf75c7766c990cc27dd4e"],
  group_home: ["kitchen.jpg", "52d83aa292dc91692fb5288110fc880761baa8b47325ac93f07c0ef93b8e971d", "290570f277a2e06ef389a1e1da839f7d071a09c2d698049cbd1d4a3aa163efd5"],
  nursery_preschool: ["playroom.jpg", "2fc090869bf86faabbf969ef53c4a4c68318e098952298a87bfdc007d0076042", "5e7b6f3a7457ac9b8d5a133b0e3618b26f78cea92d635ab848c929e7d2946ac8"],
  school_age: ["nature.jpg", "2ebf52af14cfbb5ffa7ac5dd02511e81556ea222afb00e9453b715a365013288", "cc1d46b3268ba8bac7f3717a2510246f75514e0ac17f3a5f70ac594e64bd8f19"],
  before_after: ["hero.jpg", "e7fe6d42c6e2940b4b449cdd6f42b85369e8226ed5280faee41faed22b6e8560", "c103a96d14b4ba59dbd143f64afef35329be1179ad20943e138f02e2367b437f"],
  open: ["welcome.jpg", "d03597d6a196e3b710bea0b28333921f1ec3de73ac69ea0984b76ec0cb6a6d51", "7cad8e8421fb415fcfecbaf042d8ba8b55c49127e1a81f9ac579ec1f6197ca5c"],
};

function loadTsx(path, dependencies) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(src(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(compiled).runInNewContext({
    module, exports: module.exports,
    require: (name) => dependencies[name] ?? (name.startsWith("@/") ? {} : require(name)),
  });
  return module.exports;
}

function iconComponent() {
  return loadTsx("src/components/care-category-icon.tsx", {
    "@/lib/care-category-art": { careCategoryArt },
  }).CareCategoryIcon;
}

test("all eight category ids map to the real photo gif and the reduced-motion still", () => {
  assert.deepEqual(CARE_CATEGORY_SOURCES, Object.fromEntries(Object.entries(photos).map(([id, [file]]) => [id, file])));
  for (const [id, [file, gifHash, stillHash]] of Object.entries(photos)) {
    const art = careCategoryArt(id);
    assert.ok(art);
    assert.equal(art.source, `/photos/${file}`);
    assert.equal(art.gif, `/photos/care-cats/${id}.gif`);
    assert.equal(art.still, `/photos/care-cats/${id}.jpg`);
    const gif = readFileSync(join(root, "public", art.gif));
    const still = readFileSync(join(root, "public", art.still));
    assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a");
    assert.equal(still[0], 0xff);
    assert.equal(still[1], 0xd8);
    assert.equal(createHash("sha256").update(gif).digest("hex"), gifHash);
    assert.equal(createHash("sha256").update(still).digest("hex"), stillHash);
    assert.ok(readFileSync(join(root, "public/photos", file)).length > 1000, file);
  }
  for (const invalid of ["not-a-centre", "__proto__", "constructor", "toString"]) {
    assert.equal(careCategoryArt(invalid), null);
  }
});

test("shared icon markup is decorative, dimensioned and pairs the gif with its still", () => {
  const CareCategoryIcon = iconComponent();
  Object.entries(photos).forEach(([id], index) => {
    const html = renderToStaticMarkup(createElement(CareCategoryIcon, { id, index }));
    assert.match(html, /<span class="ke-category-art" aria-hidden="true"/);
    assert.match(html, new RegExp(`<img class="ke-category-icon ke-care-gif" src="/photos/care-cats/${id}\\.gif"`));
    assert.match(html, new RegExp(`<img class="ke-category-icon ke-care-still" src="/photos/care-cats/${id}\\.jpg"`));
    assert.doesNotMatch(html, /care-icons|KidEase_|<picture|<source/);
    assert.equal((html.match(/alt="" width="128" height="128"/g) ?? []).length, 2);
    assert.equal((html.match(/loading="lazy" decoding="async" draggable="false"/g) ?? []).length, 2);
  });
  assert.equal(renderToStaticMarkup(createElement(CareCategoryIcon, { id: "invalid" })), "");
});

for (const locale of ["en", "fr"]) {
  test(`${locale} flagged category navigation retains all routes, labels and active state`, () => {
    const CareCategoryIcon = iconComponent();
    const copy = airbnbCopy(locale);
    const expected = [
      ["all", "careAll", undefined],
      ["child_care_centre", "careCentres", { fac: "child_care_centre" }],
      ["family_home", "careHomes", { fac: "family_home" }],
      ["group_home", "careGroup", { fac: "group_home" }],
      ["nursery_preschool", "careNursery", { fac: "nursery_preschool" }],
      ["school_age", "careSchool", { fac: "school_age" }],
      ["before_after", "careBefore", { cat: "before-after" }],
      ["open", "careOpen", { openings: "1" }],
    ];
    for (const [selected, search] of [["all", {}], ["family_home", { fac: "family_home" }], ["before_after", { cat: "before-after" }], ["open", { openings: 1 }]]) {
      const links = [];
      const { AirbnbCareCategories } = loadTsx("src/components/airbnb-screens.tsx", {
        "@/components/care-category-icon": { CareCategoryIcon },
        "@/lib/airbnb-ui-copy": { airbnbCopy },
        "@/lib/locale-path": { localePath },
        "@/lib/utils": { cn },
        "@/lib/use-copy": { useCopy: () => ({ locale, t: (key) => key }) },
        "@tanstack/react-router": {
          useRouterState: () => search,
          Link: ({ to, search: query, children, ...props }) => {
            links.push({ to, search: query, props });
            return createElement("a", { ...props, href: to }, children);
          },
        },
      });
      const html = renderToStaticMarkup(createElement(AirbnbCareCategories));
      assert.equal(links.length, 8);
      assert.equal((html.match(/<img /g) ?? []).length, 16);
      expected.forEach(([id, label, query], index) => {
        const link = links[index];
        assert.equal(link.to, localePath(query ? "/search" : "/", locale));
        assert.deepEqual(JSON.parse(JSON.stringify(link.search ?? null)), query ?? null);
        assert.equal(link.props["aria-current"], id === selected ? "page" : undefined);
        assert.equal(link.props["data-ke"], `airbnb-care-${id}`);
        assert.ok(html.includes(renderToStaticMarkup(createElement("span", { className: "ke-airbnb-cat-label" }, copy[label]))));
      });
    }
  });
}

test("shared category art keeps cover sizing and an explicit reduced-motion stop", () => {
  const css = src("src/styles.css");
  assert.ok(/\.ke-category-icon[^{}]*\{[^}]*object-fit:\s*cover/.test(css), "category photos use cover fit");
  assert.match(css, /\.ke-category-art > \.ke-care-still \{\s*display:\s*none;/);
  assert.match(css, /\.ke-category-art > \.ke-care-gif \{ display: none; \}/);
  assert.match(css, /\.ke-category-art > \.ke-care-still \{ display: block; \}/);
  const reducedBlocks = [];
  for (const match of css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    for (; end < css.length && depth; end += 1) {
      if (css[end] === "{") depth += 1;
      else if (css[end] === "}") depth -= 1;
    }
    reducedBlocks.push(css.slice(match.index, end));
  }
  assert.ok(reducedBlocks.some((block) => /\.ke-category-art[^{}]*\{[^}]*animation:\s*none/.test(block)));
  assert.doesNotMatch(src("src/components/app-tab-bar.tsx"), /CareCategoryIcon|care-icons|care-cats/);
});

test("compact blue fee tags keep eligibility, details and accessible tap targets", () => {
  assert.equal(listingSubsidy({ province: "ON", city: "Mississauga", name: "Brightpath Dixie" }), null);
  const pill = src("src/components/subsidy-pill.tsx");
  assert.match(pill, /if \(!subsidy\) return null/);
  assert.match(pill, /min-h-11 min-w-11/);
  assert.match(pill, /h-\[1\.375rem\]/);
  assert.match(pill, /bg-primary/);
  assert.match(pill, /text-primary-fg/);
  assert.match(pill, /\$10\/day/);
  assert.match(pill, /10 \$\/jour/);
  assert.doesNotMatch(pill, /ke-priority-pill|feePillPulses/);
  assert.doesNotMatch(src("src/components/airbnb-screens.tsx"), /ke-priority-pill|feePillPulses/);
  assert.match(pill, /<Popover\.Portal>[\s\S]*data-ke="card-fee-source"/);
});
