import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
import {
  buildRollbackSql,
  compareKeeper,
  followMergedListing,
  planDuplicateMerges,
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
  it("the committed fixture is not the production audit", () => {
    const fixture = readFileSync(new URL("./fixtures/merge-groups.json", import.meta.url), "utf8");
    assert.match(fixture, /fixture-keeper/);
    assert.doesNotMatch(fixture, /on-tor-14663/);
  });
});
