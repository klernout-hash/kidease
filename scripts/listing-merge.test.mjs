import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
import { hiddenReviewPlaceFromRow, hiddenReviewRedirectTarget } from "../src/lib/hidden-review.ts";
import { HIDDEN_REVIEW_ADMIN_LABEL, HIDDEN_REVIEW_POSSIBLE_SECOND_SITE } from "../src/lib/listing-visibility.ts";
import { decideListingLoader } from "../src/lib/listing-not-found.ts";
import {
  buildRollbackSql,
  compareKeeper,
  followMergedListing,
  hideRollbackInputs,
  planAddressReviewHides,
  planDuplicateMerges,
  planExplicitDuplicateMerges,
  planMergeGroup,
  rollbackInputsForPlan,
} from "../src/lib/listing-merge.ts";
import { publicSitemapSlugs } from "../src/lib/sitemap.ts";

function row(partial) {
  return {
    id: partial.id,
    name: "Fixture Centre",
    address: "80 Fennel Street",
    city: "Winnipeg",
    claimStatus: "unclaimed",
    claimedAt: null,
    createdAt: "2026-09-24T00:00:00.000Z",
    website: "",
    contactEmail: "",
    phone: "",
    postalCode: "",
    licenseNumber: "",
    licenseStatus: "unverified",
    description: "",
    photoCount: 0,
    photos: "",
    enquiryCount: 0,
    leadCount: 0,
    messageCount: 0,
    listingActive: 1,
    mergedInto: null,
    province: "MB",
    ...partial,
  };
}

describe("duplicate merge plan", () => {
  it("keeps a claimed listing ahead of an older unclaimed one", () => {
    const older = row({ id: "older", createdAt: "2026-09-02T00:00:00.000Z" });
    const claimed = row({ id: "claimed", claimStatus: "approved", claimedAt: "2026-09-20T00:00:00.000Z" });
    assert.ok(compareKeeper(claimed, older) < 0);
    const plan = planMergeGroup([older, claimed]);
    assert.equal(plan.keeperId, "claimed");
    assert.deepEqual(plan.retiredIds, ["older"]);
  });

  it("prefers enquiries, then photos, then completeness, then the oldest row", () => {
    const quiet = row({ id: "quiet", createdAt: "2026-09-01T00:00:00.000Z" });
    const photos = row({ id: "photos", photoCount: 2, createdAt: "2026-09-03T00:00:00.000Z" });
    const busy = row({ id: "busy", enquiryCount: 1, createdAt: "2026-09-04T00:00:00.000Z" });
    const complete = row({
      id: "complete",
      ageMinMonths: 0,
      ageMaxMonths: 48,
      infantMonthly: 40,
      description: "A full description of the program for parents comparing listings.",
      createdAt: "2026-09-02T00:00:00.000Z",
    });
    assert.equal(planMergeGroup([quiet, photos, busy]).keeperId, "busy");
    assert.equal(planMergeGroup([quiet, photos]).keeperId, "photos");
    assert.equal(planMergeGroup([quiet, complete]).keeperId, "complete");
    assert.equal(planMergeGroup([quiet, row({ id: "newer", createdAt: "2026-09-20T00:00:00.000Z" })]).keeperId, "quiet");
  });

  it("fills only blank contact fields and does not copy a matched licence status", () => {
    const keeper = row({
      id: "mb-1276",
      createdAt: "2026-09-02T00:00:00.000Z",
      postalCode: "R3T 3M4",
      licenseNumber: "MB-1276",
      licenseStatus: "unverified",
      enquiryCount: 1,
    });
    const retired = row({
      id: "mx-casa",
      website: "https://fixture.example",
      contactEmail: "fixture@example.com",
      phone: "204-555-0199",
      postalCode: "R3P 2L7",
      licenseNumber: "9999",
      licenseStatus: "matched",
      photos: "https://fixture.example/photo.jpg",
      photoCount: 1,
    });
    const children = new Map([
      ["mx-casa", { daycareId: "mx-casa", enquiryIds: ["enq-1"], photos: "https://fixture.example/photo.jpg", photoCount: 1 }],
    ]);
    const plan = planMergeGroup([keeper, retired], children);
    assert.equal(plan.keeperId, "mb-1276");
    assert.equal(plan.fieldFills.website, "https://fixture.example");
    assert.equal(plan.fieldFills.phone, "204-555-0199");
    assert.equal(plan.fieldFills.contactEmail, "fixture@example.com");
    assert.equal(plan.fieldFills.postalCode, undefined);
    assert.equal(plan.keeperLicence, "1276");
    assert.equal(JSON.stringify(plan).includes("matched"), false);
    assert.equal(plan.moved.enquiryIds[0], "enq-1");
    assert.equal(plan.moved.photosCopied, true);
  });

  it("writes a guarded rollback and does not delete a daycare", () => {
    const groups = [
      {
        rows: [
          { id: "fixture-keeper", province: "MB", license_number: "MB-1276", claim_status: "unclaimed", created_at: "2026-09-02T00:00:00.000Z", postal_code: "R3T 3M4" },
          { id: "fixture-retired", province: "MB", license_number: "1276", claim_status: "unclaimed", created_at: "2026-09-24T00:00:00.000Z" },
        ],
      },
    ];
    const facts = new Map([
      ["fixture-keeper", row({ id: "fixture-keeper", createdAt: "2026-09-02T00:00:00.000Z", postalCode: "R3T 3M4", licenseNumber: "MB-1276", enquiryCount: 1 })],
      ["fixture-retired", row({ id: "fixture-retired", phone: "204-555-0199", licenseNumber: "1276", licenseStatus: "matched", photos: "https://fixture.example/photo.jpg", photoCount: 1 })],
    ]);
    const children = new Map([
      ["fixture-retired", { daycareId: "fixture-retired", enquiryIds: ["fixture-enquiry"], photos: "https://fixture.example/photo.jpg", photoCount: 1 }],
    ]);
    const plan = planDuplicateMerges(groups, facts, children);
    const sql = buildRollbackSql(rollbackInputsForPlan(plan, facts));
    assert.match(sql, /begin;/);
    assert.match(sql, /commit;/);
    assert.match(sql, /merged_into = 'fixture-keeper'/);
    assert.match(sql, /phone is not distinct from '204-555-0199'/);
    assert.match(sql, /license_number is not distinct from '1276'/);
    assert.doesNotMatch(sql, /delete\s+from\s+daycares/i);
    assert.doesNotMatch(sql, /license_status/);
  });

  it("is idempotent once the retired row points at the keeper", () => {
    const groups = [{ rows: [{ id: "keeper", created_at: "2026-09-02T00:00:00.000Z" }, { id: "retired", created_at: "2026-09-24T00:00:00.000Z" }] }];
    const facts = new Map([
      ["keeper", row({ id: "keeper", createdAt: "2026-09-02T00:00:00.000Z" })],
      ["retired", row({ id: "retired" })],
    ]);
    const first = planDuplicateMerges(groups, facts);
    assert.equal(first.retired, 1);
    facts.get("retired").mergedInto = "keeper";
    const second = planDuplicateMerges(groups, facts);
    assert.equal(second.keepers, 0);
    assert.equal(second.skipped[0].reason, "already merged");
  });

  it("hides a possible second site without merging it, and the rollback does not delete it", () => {
    const groups = [
      {
        rows: [
          {
            id: "mb-7858",
            name: "Prairie Nature Children's Centre",
            address: "600 Hoka Street",
            city: "Winnipeg",
            province: "MB",
            postal_code: "R2C 2V1",
            license_number: "7858",
            created_at: "2026-09-02T00:00:00.000Z",
          },
          {
            id: "mx-prairie",
            name: "Prairie Nature Children's Centre Inc.",
            address: "115 Sanford Fleming Road",
            city: "Winnipeg",
            province: "MB",
            postal_code: "R2C 2V1",
            license_number: "7858",
            created_at: "2026-09-24T00:00:00.000Z",
            claim_status: "approved",
          },
        ],
      },
    ];
    const facts = new Map(groups[0].rows.map((item) => [item.id, row({
      id: item.id,
      name: item.name,
      address: item.address,
      city: item.city,
      province: item.province,
      postalCode: item.postal_code,
      licenseNumber: item.license_number,
      createdAt: item.created_at,
      claimStatus: item.claim_status || "unclaimed",
    })]));
    const plan = planDuplicateMerges(groups, facts);
    assert.equal(plan.hiddenReviews.length, 1);
    assert.equal(plan.hiddenReviews[0].liveId, "mb-7858");
    assert.equal(plan.hiddenReviews[0].hiddenId, "mx-prairie");
    assert.equal(plan.retired, 0);
    const sql = buildRollbackSql([], hideRollbackInputs(plan, facts));
    assert.match(sql, /import_fault = null/);
    assert.match(sql, /review_of = null/);
    assert.match(sql, /hidden_review_possible_second_site/);
    assert.match(sql, /merged_into is null/);
    assert.doesNotMatch(sql, /delete\s+from\s+daycares/i);
    facts.get("mx-prairie").importFault = HIDDEN_REVIEW_POSSIBLE_SECOND_SITE;
    const again = planDuplicateMerges(groups, facts);
    assert.equal(again.hiddenReview, 0);
    assert.equal(again.skipped[0].reason, "already hidden");
  });

  it("sends a hidden review URL to the city hub or that city's search, not the sibling", () => {
    assert.equal(hiddenReviewPlaceFromRow({
      importFault: "pei_name_unrecoverable",
      city: "Stratford",
      province: "PE",
    }), null);
    assert.equal(hiddenReviewPlaceFromRow({
      importFault: HIDDEN_REVIEW_POSSIBLE_SECOND_SITE,
      mergedInto: "mb-7858",
      city: "Winnipeg",
      province: "MB",
    }), null);
    const winnipeg = hiddenReviewPlaceFromRow({
      importFault: HIDDEN_REVIEW_POSSIBLE_SECOND_SITE,
      city: "Winnipeg",
      province: "MB",
    });
    assert.deepEqual(hiddenReviewRedirectTarget(winnipeg.city, winnipeg.province), { kind: "city", city: "winnipeg" });
    const town = hiddenReviewRedirectTarget("St. Adolphe", "MB");
    assert.deepEqual(town, { kind: "search", q: "St. Adolphe" });
    const slug = readFileSync(new URL("../src/routes/daycare.$slug.tsx", import.meta.url), "utf8");
    assert.match(slug, /getHiddenReviewRedirect/);
    assert.match(slug, /statusCode: 301/);
    assert.match(slug, /\/daycare\/city\/\$city/);
    assert.match(slug, /to: "\/search"/);
    const card = readFileSync(new URL("../src/components/admin-review-card.tsx", import.meta.url), "utf8");
    assert.match(card, /HIDDEN_REVIEW_ADMIN_LABEL/);
    assert.equal(HIDDEN_REVIEW_ADMIN_LABEL, "Hidden: possible second site, needs review");
    assert.match(card, />\s*Restore\s*</);
    assert.match(card, />\s*Merge\s*</);
    assert.match(card, /Name not recoverable/);
    const admin = readFileSync(new URL("../src/lib/server/admin-centres.ts", import.meta.url), "utf8");
    assert.match(admin, /restore_hidden_review/);
    assert.match(admin, /merge_hidden_review/);
    assert.doesNotMatch(admin, /delete\s+from\s+daycares/i);
  });

  it("follows merged_into and stops on a cycle, a fault, or a missing keeper", () => {
    const rows = new Map([
      ["retired", { id: "retired", mergedInto: "keeper" }],
      ["keeper", { id: "keeper", mergedInto: null }],
      ["loop-a", { id: "loop-a", mergedInto: "loop-b" }],
      ["loop-b", { id: "loop-b", mergedInto: "loop-a" }],
      ["hidden", { id: "hidden", importFault: "pei_name_unrecoverable" }],
      ["dangling", { id: "dangling", mergedInto: "missing" }],
    ]);
    const lookup = (id) => rows.get(id);
    assert.equal(followMergedListing(rows.get("retired"), lookup).id, "keeper");
    assert.equal(followMergedListing(rows.get("loop-a"), lookup), null);
    assert.equal(followMergedListing(rows.get("hidden"), lookup), null);
    assert.equal(followMergedListing(rows.get("dangling"), lookup), null);
  });

  it("keeps merged and import-fault rows off the sitemap", () => {
    assert.deepEqual(
      publicSitemapSlugs([
        { slug: "fixture-keeper", name: "Fixture Centre" },
        { slug: "fixture-retired", name: "Fixture Centre", mergedInto: "fixture-keeper" },
        { slug: "stratford-pe", name: "Stratford, PE C1B 2W8", importFault: "pei_name_unrecoverable" },
      ]),
      ["fixture-keeper"],
    );
  });

  it("dry-run of the fixture prints counts and does not print contact values", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "scripts/merge-duplicate-listings.mjs",
        "--groups",
        "scripts/fixtures/merge-groups.json",
        "--facts",
        "scripts/fixtures/merge-facts.json",
        "--children",
        "scripts/fixtures/merge-children.json",
      ],
      { encoding: "utf8", env, cwd: root },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /keepers 1/);
    assert.match(result.stdout, /retired 1/);
    assert.match(result.stdout, /fieldsFilled 3/);
    assert.match(result.stdout, /childRecordsMoved 8/);
    assert.match(result.stdout, /licenceNormalized 1/);
    assert.match(result.stdout, /mode dry-run/);
    assert.doesNotMatch(result.stdout, /204-555-0199/);
    assert.doesNotMatch(result.stdout, /fixture@example\.com/);
    assert.doesNotMatch(result.stdout, /fixture\.example/);
  });

  it("refuses --apply without DATABASE_URL", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/merge-duplicate-listings.mjs", "--groups", "scripts/fixtures/merge-groups.json", "--apply"],
      { encoding: "utf8", env, cwd: root },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DATABASE_URL/);
  });
});

describe("audit file shape", () => {
  it("merge, hide, and PEI repair never delete a daycare row", () => {
    const files = [
      "scripts/merge-duplicate-listings.mjs",
      "scripts/repair-pei-names.mjs",
      "src/lib/listing-merge.ts",
      "src/lib/pei-name-repair.ts",
      "src/lib/server/admin-centres.ts",
      "migrations/0062_listing_merge.sql",
    ];
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      assert.doesNotMatch(source, /delete\s+from\s+daycares/i, file);
    }
    const repair = readFileSync(join(root, "scripts/repair-pei-names.mjs"), "utf8");
    assert.match(repair, /pei_name_unrecoverable/);
    assert.match(repair, /listing_active = 0/);
    const merge = readFileSync(join(root, "scripts/merge-duplicate-listings.mjs"), "utf8");
    assert.match(merge, /merged_into = \$1/);
    assert.match(merge, /hidden_review_possible_second_site|action\.flag/);
    assert.match(merge, /review_of = \$2/);
  });

  it("the committed fixture is not the production audit", () => {
    const fixture = readFileSync(new URL("./fixtures/merge-groups.json", import.meta.url), "utf8");
    assert.match(fixture, /fixture-keeper/);
    assert.doesNotMatch(fixture, /on-tor-14663/);
  });
});

describe("audited duplicate pairs", () => {
  it("retires the duplicate, swaps a claimed duplicate to keeper, and skips when both are claimed", () => {
    const facts = new Map([
      ["dup", row({ id: "dup", slug: "copy-centre", claimStatus: "unclaimed" })],
      ["keep", row({ id: "keep", slug: "live-centre", claimStatus: "unclaimed" })],
      ["claimed-dup", row({ id: "claimed-dup", slug: "claimed-copy", claimStatus: "approved", claimedAt: "2026-09-01T00:00:00.000Z" })],
      ["plain-keep", row({ id: "plain-keep", slug: "plain-live", claimStatus: "unclaimed" })],
      ["owned-a", row({ id: "owned-a", slug: "owned-a", ownerCount: 1 })],
      ["owned-b", row({ id: "owned-b", slug: "owned-b", claimStatus: "approved" })],
      ["kids", row({ id: "kids", slug: "kids-world-daycare-kh2t", claimStatus: "approved" })],
      ["other", row({ id: "other", slug: "other-centre" })],
    ]);
    const children = new Map([
      ["dup", { daycareId: "dup", savedUserIds: ["parent-1"], waitlistUserIds: ["parent-2"], reviewIds: ["rev-1"], tourIds: ["tour-1"] }],
    ]);
    const planned = planExplicitDuplicateMerges(
      [
        { duplicateId: "dup", keeperId: "keep", duplicateSlug: "copy-centre", keeperSlug: "live-centre" },
        { duplicateId: "claimed-dup", keeperId: "plain-keep", duplicateSlug: "claimed-copy", keeperSlug: "plain-live" },
        { duplicateId: "owned-a", keeperId: "owned-b", duplicateSlug: "owned-a", keeperSlug: "owned-b" },
        { duplicateId: "other", keeperId: "kids", duplicateSlug: "other-centre", keeperSlug: "kids-world-daycare-kh2t" },
      ],
      facts,
      children,
    );
    assert.equal(planned.plan.retired, 2);
    assert.equal(planned.plan.groups[0].keeperId, "keep");
    assert.deepEqual(planned.plan.groups[0].retiredIds, ["dup"]);
    assert.deepEqual(planned.plan.groups[0].moved.waitlistUserIds, ["parent-2"]);
    assert.deepEqual(planned.plan.groups[0].moved.savedUserIds, ["parent-1"]);
    assert.equal(planned.swaps.length, 1);
    assert.equal(planned.swaps[0].keeperId, "claimed-dup");
    assert.equal(planned.plan.groups[1].keeperId, "claimed-dup");
    assert.deepEqual(planned.plan.groups[1].retiredIds, ["plain-keep"]);
    assert.ok(planned.skipped.some((item) => item.reason === "both claimed"));
    assert.ok(planned.skipped.some((item) => item.reason === "protected listing"));
    assert.equal(
      planned.plan.groups.some((group) => group.retiredIds.includes("kids") || group.keeperId === "kids"),
      false,
    );
  });

  it("queues an address-differs row for admin review and leaves a claimed one public", () => {
    const facts = new Map([
      ["mx-review", row({ id: "mx-review", slug: "possible-copy", claimStatus: "unclaimed" })],
      ["mx-claimed", row({ id: "mx-claimed", slug: "claimed-copy", claimStatus: "approved" })],
    ]);
    const review = planAddressReviewHides(
      [
        {
          duplicateId: "mx-review",
          keeperId: "mb-1",
          duplicateSlug: "possible-copy",
          names: ["Possible Copy"],
          addresses: ["1 First St"],
          city: "Winnipeg",
          province: "MB",
        },
        {
          duplicateId: "mx-claimed",
          keeperId: "mb-2",
          duplicateSlug: "claimed-copy",
          names: ["Claimed Copy"],
          addresses: ["2 Second St"],
          city: "Winnipeg",
          province: "MB",
        },
      ],
      facts,
    );
    assert.equal(review.hides.length, 1);
    assert.equal(review.hides[0].hiddenId, "mx-review");
    assert.equal(review.hides[0].liveId, "mb-1");
    assert.equal(review.hides[0].flag, "hidden_review_possible_second_site");
    assert.equal(review.hides[0].listingActive, 0);
    assert.equal(review.skipped[0].reason, "claimed duplicate left public");
  });

  it("301s a hidden duplicate slug to the keeper in English and French", () => {
    const decision = decideListingLoader(
      "airdrie-daycare-first-avenue-23b47299",
      { slug: "airdrie-daycare-first-avenue-399B5954" },
      null,
    );
    assert.equal(decision.type, "redirect-keeper");
    assert.equal(decision.slug, "airdrie-daycare-first-avenue-399B5954");
    const english = readFileSync(join(root, "src/routes/daycare.$slug.tsx"), "utf8");
    const french = readFileSync(join(root, "src/routes/fr.daycare.$slug.tsx"), "utf8");
    assert.match(english, /redirect-keeper/);
    assert.match(english, /statusCode: 301/);
    assert.match(french, /redirect-keeper/);
    assert.match(french, /statusCode: 301/);
    assert.match(french, /\/fr\/daycare\/\$slug/);
  });
});
