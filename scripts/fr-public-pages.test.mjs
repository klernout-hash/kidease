import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LOCALE_PAIRED_PATHS, hreflangLinks, localePath } from "../src/lib/locale-path.ts";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "../src/lib/page-seo.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const SHARED = [
  ["/claim", "src/routes/fr.claim.tsx", "ClaimPage", "claim"],
  ["/plans", "src/routes/fr.plans.tsx", "PlansPage", "plans"],
  ["/compare", "src/routes/fr.compare.tsx", "ComparePage", "compare"],
  ["/cities", "src/routes/fr.cities.tsx", "CitiesPage", "cities"],
  ["/verify", "src/routes/fr.verify.tsx", "VerifyPage", "verify"],
  ["/report", "src/routes/fr.report.tsx", "ReportPage", "report"],
  ["/daycare-requirements", "src/routes/fr.daycare-requirements.tsx", "DaycareRequirementsPage", "daycareRequirements"],
  ["/tour-checklist", "src/routes/fr.tour-checklist.tsx", "TourChecklist", "tourChecklist"],
  ["/team", "src/routes/fr.team.tsx", "Team", "team"],
  ["/search", "src/routes/fr.search.tsx", "SearchScreen", "search"],
  ["/guides", "src/routes/fr.guides.tsx", "GuidesIndex", null],
];

test("public French routes share the English page and canonicalise to /fr", () => {
  for (const [path, file, component, seoKey] of SHARED) {
    assert.equal(existsSync(join(root, file)), true, file);
    assert.ok(LOCALE_PAIRED_PATHS.includes(path), path);
    const body = src(file);
    assert.match(body, new RegExp(component));
    assert.doesNotMatch(body, /gratuit pour toujours|free forever|—/);
    if (seoKey) {
      const seo = MARKETING_PAGE_SEO_FR[seoKey];
      assert.equal(seo.path, localePath(path, "fr"));
      const head = pageSeoHead(seo);
      assert.ok(head.links.some((link) => link.rel === "canonical" && link.href.endsWith(seo.path)));
      assert.deepEqual(
        head.links.filter((link) => link.rel === "alternate").map((link) => link.hrefLang),
        ["en", "fr", "x-default"],
      );
    }
    assert.equal(hreflangLinks(path).length, 3);
  }
  assert.match(src("src/routes/fr.signup.tsx"), /to: "\/fr\/login"/);
  assert.match(src("src/routes/fr.search.tsx"), /from "@\/routes\/search"/);
  assert.doesNotMatch(src("src/routes/fr.search.tsx"), /function FrExplore/);
  for (const path of ["/claim", "/plans", "/compare", "/cities", "/verify", "/daycare-requirements"]) {
    assert.ok(SITEMAP_STATIC_PATHS.includes(path), path);
  }
});

test("French SEO copy keeps the founding period and names KidEase as Canadian where we introduce it", () => {
  const blob = [
    MARKETING_PAGE_SEO_FR.claim.description,
    MARKETING_PAGE_SEO_FR.plans.description,
    MARKETING_PAGE_SEO_FR.plansPaid.description,
    MARKETING_PAGE_SEO_FR.team.description,
    MARKETING_PAGE_SEO_FR.verify.description,
  ].join("\n");
  assert.match(blob, /période fondatrice gratuite/i);
  assert.match(blob, /entreprise canadienne/);
  assert.doesNotMatch(blob, /gratuit pour toujours|free forever|—/);
});
