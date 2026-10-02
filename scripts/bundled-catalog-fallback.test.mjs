import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  chooseCatalogListing,
  filterSuppressedCatalogRows,
  resolveFoundCatalogRow,
} from "../src/lib/catalog-fallback.ts";
import { hiddenReviewRedirectTarget } from "../src/lib/hidden-review.ts";
import { decideListingLoader } from "../src/lib/listing-not-found.ts";
import {
  HIDDEN_REVIEW_POSSIBLE_SECOND_SITE,
  hideListingFromPublicPage,
  isPublicListing,
  PUBLIC_LISTING_SQL,
  SUPPRESSED_CATALOG_SQL,
} from "../src/lib/listing-visibility.ts";
import { mergeListingSitemapSlugs } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const HIDDEN_SLUG = "bruce-woodgreen-early-learning-centre-9540";
const HIDDEN_SLUG_2 = "east-york-montessori-school-56706";

function row(over = {}) {
  return {
    id: "on-9540",
    slug: HIDDEN_SLUG,
    name: "Bruce WoodGreen Early Learning Centre",
    visibility: "public",
    isTest: false,
    listingActive: true,
    mergedInto: null,
    importFault: null,
    city: "Toronto",
    province: "ON",
    ...over,
  };
}

/** Same gates the listing loader uses: database row, then public SEO, then redirect. */
function publicPage({ requestedSlug, dbState, db, bundle, viewerIsAdmin = false }) {
  const chosen = chooseCatalogListing({ dbState, db, bundle });
  const visible = chosen && !hideListingFromPublicPage(chosen, viewerIsAdmin) ? chosen : null;
  const hidden =
    !visible &&
    chosen &&
    chosen.importFault === HIDDEN_REVIEW_POSSIBLE_SECOND_SITE &&
    !(chosen.mergedInto || "").trim()
      ? hiddenReviewRedirectTarget(chosen.city, chosen.province)
      : null;
  return {
    chosen,
    decision: decideListingLoader(requestedSlug, visible ? { slug: visible.slug } : null, hidden),
  };
}

describe("bundled catalogue must not resurrect a database row", () => {
  it("does not publicly render a hidden database row that is still in the bundle", () => {
    const hidden = row({
      visibility: "admin_only",
      listingActive: 0,
      importFault: HIDDEN_REVIEW_POSSIBLE_SECOND_SITE,
    });
    const bundle = row({ id: hidden.id, name: "Bundled public copy", listingActive: true, importFault: null });
    const resolved = resolveFoundCatalogRow(hidden, () => undefined);
    assert.equal(resolved.slug, HIDDEN_SLUG);
    assert.equal(isPublicListing(resolved), false);
    const page = publicPage({
      requestedSlug: HIDDEN_SLUG,
      dbState: "found",
      db: resolved,
      bundle,
    });
    assert.equal(page.chosen, resolved);
    assert.notEqual(page.chosen.name, bundle.name);
    assert.equal(page.decision.type, "redirect-city");
    assert.equal(page.decision.city, "toronto");

    const eastYork = row({
      id: "on-56706",
      slug: HIDDEN_SLUG_2,
      name: "East York Montessori School",
      city: "East York",
      visibility: "admin_only",
      listingActive: false,
      importFault: HIDDEN_REVIEW_POSSIBLE_SECOND_SITE,
    });
    const eastPage = publicPage({
      requestedSlug: HIDDEN_SLUG_2,
      dbState: "found",
      db: resolveFoundCatalogRow(eastYork, () => undefined),
      bundle: row({ slug: HIDDEN_SLUG_2, name: "Bundled East York", importFault: null }),
    });
    assert.equal(eastPage.decision.type, "redirect-search");
    assert.equal(eastPage.decision.q, "East York");
  });

  it("301s a merged slug to the keeper instead of the bundled retired copy", () => {
    const retired = row({
      id: "retired",
      slug: "retired-duplicate-centre",
      name: "Retired copy",
      mergedInto: "keeper",
      listingActive: 0,
    });
    const keeper = row({
      id: "keeper",
      slug: "keeper-centre",
      name: "Keeper",
      mergedInto: null,
      listingActive: true,
    });
    const byId = new Map([
      [retired.id, retired],
      [keeper.id, keeper],
    ]);
    const resolved = resolveFoundCatalogRow(retired, (id) => byId.get(id));
    assert.equal(resolved.id, "keeper");
    const bundle = row({
      id: retired.id,
      slug: retired.slug,
      name: "Bundled retired copy",
      mergedInto: null,
      listingActive: true,
    });
    const page = publicPage({
      requestedSlug: retired.slug,
      dbState: "found",
      db: resolved,
      bundle,
    });
    assert.equal(page.decision.type, "redirect-keeper");
    assert.equal(page.decision.slug, "keeper-centre");
    assert.notEqual(page.chosen.name, bundle.name);
  });

  it("still renders a bundled listing when the database has no row", () => {
    const bundle = row({ id: "json-only", slug: "sunny-side-child-care", name: "Sunny Side Child Care" });
    for (const dbState of ["missing", "unreachable"]) {
      const page = publicPage({
        requestedSlug: bundle.slug,
        dbState,
        db: null,
        bundle,
      });
      assert.equal(page.chosen, bundle);
      assert.equal(page.decision.type, "render");
    }
  });

  it("lets an admin open an admin-only row and still hides import faults", () => {
    const adminOnly = row({ visibility: "admin_only", listingActive: false, importFault: null });
    assert.equal(hideListingFromPublicPage(adminOnly, false), true);
    assert.equal(hideListingFromPublicPage(adminOnly, true), false);
    const fault = row({ importFault: HIDDEN_REVIEW_POSSIBLE_SECOND_SITE, visibility: "admin_only" });
    assert.equal(hideListingFromPublicPage(fault, true), true);
  });

  it("drops hidden and merged rows from search, city, and map bundle fallbacks", () => {
    const rows = [
      { id: "on-9540", slug: HIDDEN_SLUG, name: "Hidden" },
      { id: "kept", slug: "sunny-side-child-care", name: "Sunny Side" },
      { id: "retired", slug: "retired-duplicate-centre", name: "Retired" },
    ];
    const filtered = filterSuppressedCatalogRows(rows, {
      ids: new Set(["on-9540"]),
      slugs: new Set(["retired-duplicate-centre"]),
    });
    assert.deepEqual(
      filtered.map((item) => item.slug),
      ["sunny-side-child-care"],
    );
    assert.equal(filterSuppressedCatalogRows(rows, null).length, 3);
  });
});

describe("listing sitemap excludes hidden and retired slugs", () => {
  it("removes suppressed slugs and keeps the rest of a partial public read", () => {
    const slugs = mergeListingSitemapSlugs(
      [HIDDEN_SLUG, HIDDEN_SLUG_2, "retired-duplicate-centre", "sunny-side-child-care"],
      ["brand-new-centre", HIDDEN_SLUG],
      100,
      [HIDDEN_SLUG, HIDDEN_SLUG_2, "retired-duplicate-centre"],
    );
    assert.deepEqual(slugs, ["sunny-side-child-care", "brand-new-centre"]);
    const partial = mergeListingSitemapSlugs(
      ["sunny-side-child-care", "second-centre", HIDDEN_SLUG],
      [],
      100,
      [HIDDEN_SLUG],
    );
    assert.deepEqual(partial, ["sunny-side-child-care", "second-centre"]);
    assert.match(PUBLIC_LISTING_SQL, /coalesce\(listing_active, 1\) <> 0/);
    assert.match(SUPPRESSED_CATALOG_SQL, /merged_into is not null/);
    assert.match(SUPPRESSED_CATALOG_SQL, /listing_active, 1\) = 0/);
    assert.match(SUPPRESSED_CATALOG_SQL, /visibility, 'public'\) <> 'public'/);
  });
});

describe("listing and sitemap call sites use the fallback gate", () => {
  it("wires the database row ahead of the bundled copy", () => {
    const neon = src("src/lib/server/catalog-neon.ts");
    const slugFn = neon.slice(
      neon.indexOf("export async function neonCatalogBySlug"),
      neon.indexOf("export async function neonHiddenReviewPlace"),
    );
    assert.match(slugFn, /resolveFoundCatalogRow/);
    assert.doesNotMatch(slugFn, /isNeonCatalogPreferred/);
    assert.match(slugFn, /return catalogRowToListing\(chosen\.row\)/);
    assert.match(src("src/lib/catalog.ts"), /chooseCatalogListing/);
    assert.match(src("src/lib/catalog.ts"), /omitSuppressedBundleCopies/);
    assert.match(src("src/routes/daycare.$slug.tsx"), /decideListingLoader/);
    assert.match(src("src/lib/server/daycares.ts"), /hideListingFromPublicPage/);
    assert.match(src("server/middleware/sitemap.ts"), /PUBLIC_LISTING_SQL/);
    assert.match(src("server/middleware/sitemap.ts"), /publicSitemapSlugs/);
    assert.doesNotMatch(src("server/middleware/sitemap.ts"), /mergeListingSitemapSlugs/);
    assert.match(src("src/lib/city-hub-page.ts"), /filterSuppressedBundleRows/);
    assert.match(src("src/routes/daycare.city.$city.tsx"), /loadCityHub/);
    assert.match(src("src/lib/server/nearby.ts"), /catalogNearFromJson/);
  });
});
