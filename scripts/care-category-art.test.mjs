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
import { feePillPulses } from "../src/lib/card-photo-pills.ts";
import { listingSubsidy } from "../src/lib/fee-program.ts";
import { localePath } from "../src/lib/locale-path.ts";
import { cn } from "../src/lib/utils.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

// Hashes of the eight recovered, approved 256px transparent PNG originals.
const originals = {
  all: ["KidEase_All.png", "7f46f023849e5628dc84032ae76fd2e2e3ebb06a545a95c9213c3b28c1d7d317"],
  child_care_centre: ["KidEase_Centres.png", "65f93d3bd98dc8b6e257e860b3a360e94c0d24bff891cfe0e76c90ee36823070"],
  family_home: ["KidEase_Home_Daycares.png", "0d49bf2a800ce10d01e8606046b9de2cf65730e62b2f74347524cf7fda8e9486"],
  group_home: ["KidEase_Group_Homes.png", "7df32cbf203dcd75d3090e533e616abff280f1ff2c5fce0f280e749d33f96b30"],
  nursery_preschool: ["KidEase_Nursery.png", "bf4364e1500937effcf4cf48e2d86093924564af4b3ec95737072b33f350647c"],
  school_age: ["KidEase_School_Age.png", "c46aaf27d21a976f069934a73ca6f8cc7dbd641aad21fec387a6bc36c2c2bdbe"],
  before_after: ["KidEase_Before_After.png", "f67e827f24d971a2be49b1f80b4ab7f40f51b37fc19efc081f2abc4b58b0caf9"],
  open: ["KidEase_Open_Spots.png", "2e683826588becea39d95633ebe72a46c2bea5f5108735e7c0b151acd621a874"],
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

test("all eight category ids map to the exact recovered transparent PNG originals", () => {
  assert.deepEqual(CARE_CATEGORY_SOURCES, Object.fromEntries(Object.entries(originals).map(([id, [file]]) => [id, file])));
  for (const [id, [file, hash]] of Object.entries(originals)) {
    const art = careCategoryArt(id);
    assert.ok(art);
    assert.equal(art.src, `/photos/care-icons/${file}`);
    const png = readFileSync(join(root, "public", art.src));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
    assert.equal(png[24], 8);
    assert.equal(png[25], 6, "original RGBA transparency channel remains");
    assert.equal(createHash("sha256").update(png).digest("hex"), hash);
  }
  for (const invalid of ["not-a-centre", "__proto__", "constructor", "toString"]) {
    assert.equal(careCategoryArt(invalid), null);
  }
});

test("shared icon markup is decorative, dimensioned and uses a static original", () => {
  const CareCategoryIcon = iconComponent();
  Object.entries(originals).forEach(([id, [file]], index) => {
    const html = renderToStaticMarkup(createElement(CareCategoryIcon, { id, index }));
    assert.match(html, /<span class="ke-category-art" aria-hidden="true"/);
    assert.match(html, /<img class="ke-category-icon"/);
    assert.ok(html.includes(`src="/photos/care-icons/${file}"`));
    assert.match(html, /alt="" width="256" height="256"/);
    assert.match(html, /decoding="async" draggable="false"/);
    assert.doesNotMatch(html, /\.gif|ke-care-gif|ke-care-still/);
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
      assert.equal((html.match(/<img /g) ?? []).length, 8);
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

test("shared category art keeps contain sizing and an explicit reduced-motion stop", () => {
  const css = src("src/styles.css");
  assert.ok(/\.ke-category-icon[^{}]*\{[^}]*object-fit:\s*contain/.test(css), "category PNGs retain contain fit");
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

test("$10/day pulses only for a sourced ten-dollar program", () => {
  assert.equal(feePillPulses("ten"), true);
  assert.equal(feePillPulses("ten_max"), true);
  assert.equal(feePillPulses("qc_965"), false);
  assert.equal(feePillPulses("reduced"), false);
  assert.equal(feePillPulses(null), false);
  assert.equal(listingSubsidy({ province: "ON", city: "Mississauga", name: "Brightpath Dixie" }), null);
  assert.equal(feePillPulses(listingSubsidy({ province: "ON" })?.subsidy_type), false);
  const sk = listingSubsidy({
    province: "SK",
    feeProgram: "sk-10-day",
    facilityType: "child_care_centre",
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 60,
  });
  assert.equal(sk?.subsidy_label, "$10 / Day");
  assert.equal(feePillPulses(sk?.subsidy_type), true);
  assert.match(src("src/components/subsidy-pill.tsx"), /feePillPulses\(subsidy\.subsidy_type\)/);
  assert.match(src("src/components/subsidy-pill.tsx"), /ke-priority-pill/);
  assert.match(src("src/components/airbnb-screens.tsx"), /feePillPulses\(subsidy\.subsidy_type\)/);
});

test("confirmed blue fee pills pulse in app search and stop for reduced motion", () => {
  const css = src("src/styles.css");
  const appSuppression = css.match(/html\[data-channel="app"\] \.ke-app-search \.ke-live-pulse,[\s\S]*?\{\s*animation: none;\s*\}/)?.[0];
  assert.ok(appSuppression);
  assert.doesNotMatch(appSuppression, /ke-priority-pill/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.ke-priority-pill \{ animation: none; \}/);
  assert.doesNotMatch(css, /html\[data-look="clean"\] \[data-ke="card-photo-pills"\] :is\([^\n]*1D4ED8/);
  const pill = src("src/components/subsidy-pill.tsx");
  assert.match(pill, /ke-priority-pill bg-primary text-primary-fg/);
  assert.doesNotMatch(pill, /bg-\[#1D4ED8\]|text-white/);
  assert.match(css, /--color-primary:\s*#1a3790;/);
  assert.match(pill, /<Popover\.Portal>[\s\S]*data-ke="card-fee-source"/);
});
