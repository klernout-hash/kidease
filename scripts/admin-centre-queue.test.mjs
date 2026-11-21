import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Data-reader tests only: authorization is the caller's responsibility.
// Execute the real queue mapping, licence-ref overlay and duplicate/QA rules.
// SQL is an allowlisted local stub; no service, live database or account is used.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = "__kideaseAdminCentreQueueReadTest";
const dbUrl = "kidease-admin-centre-queue-test:db";

function sourceFile(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:"))
    file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find(existsSync) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const file = sourceFile(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    return {
      url: file === join(root, "src/lib/db.ts") ? dbUrl : pathToFileURL(file).href,
      shortCircuit: true,
    };
  },
  load(url, context, nextLoad) {
    if (url !== dbUrl) return nextLoad(url, context);
    return {
      format: "module",
      source: `export async function getSql() { return globalThis.${key}.acquire(); }`,
      shortCircuit: true,
    };
  },
});

const { readAdminCentreQueueRows } = await import("../src/lib/server/admin-centre-queue.ts");
const { staffQueueRows } = await import("../src/lib/listing-visibility.ts");
const { tallyAdminCentreStats } = await import("../src/lib/admin-stat-filter.ts");

function centre(id, overrides = {}) {
  return {
    daycare_id: id,
    slug: id,
    name: `Synthetic ${id} Centre`,
    address: `1 ${id} Avenue`,
    city: "Winnipeg",
    province: "MB",
    phone: null,
    contact_email: null,
    claim_status: "waiting",
    claimed_at: null,
    claim_id: `claim-${id}`,
    claim_row_status: "waiting",
    provider_user_id: "synthetic-owner",
    provider_link_user_id: "synthetic-owner",
    provider_name: "Synthetic Owner",
    provider_email: "synthetic-owner@example.invalid",
    submitted_at: "2026-11-17T10:00:00.000Z",
    reviewed_at: null,
    review_note: null,
    license_number: `SYNTHETIC-MB-${id}`,
    license_status: "unverified",
    license_expiry: null,
    licensed_capacity: null,
    registry_match_state: "unmatched",
    license_verified_at: null,
    license_verification_source: null,
    staff_screening_attested: 0,
    staff_screening_attested_at: null,
    screening_on_file: 0,
    screening_on_file_at: null,
    license_photo: "on-file",
    photos: null,
    hours: null,
    ages_confirmed: 0,
    age_min_months: 0,
    age_max_months: 0,
    created_at: "2026-11-17T09:00:00.000Z",
    visibility: "public",
    is_test: 0,
    merged_into: null,
    merged_into_name: null,
    import_fault: null,
    review_of: null,
    ...overrides,
  };
}

function fixture() {
  return globalThis[key];
}

beforeEach(() => {
  const current = {
    rows: [],
    calls: [],
    unexpectedQueries: 0,
    claims: [],
    uploads: [],
    acquireError: null,
    queryError: null,
  };
  async function query(text, values = []) {
    current.calls.push({ text, values });
    if (/select\s+d\.id as daycare_id[\s\S]+from daycares d/i.test(text)) {
      if (current.queryError) throw current.queryError;
      return current.rows;
    }
    if (/^select distinct on \(daycare_id\)[\s\S]+from listing_claims/i.test(text))
      return current.claims;
    if (/^select distinct on \(daycare_id\)[\s\S]+from license_uploads/i.test(text))
      return current.uploads;
    current.unexpectedQueries += 1;
    throw new Error("Unexpected query outside the queue/licence-read allowlist");
  }
  const sql = (parts, ...values) =>
    query(
      parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""),
      values,
    );
  sql.query = query;
  current.acquire = () => {
    if (current.acquireError) throw current.acquireError;
    return sql;
  };
  globalThis[key] = current;
});

after(() => {
  hooks.deregister();
  delete globalThis[key];
});

test("shared queue reader maps persisted claims and requires licence evidence for Live", async () => {
  fixture().rows = [
    centre("willow"),
    centre("maple", {
      claim_status: "unclaimed",
      claim_id: null,
      claim_row_status: null,
    }),
    centre("elm", {
      claim_status: "approved",
      claim_row_status: "approved",
      license_status: "matched",
      registry_match_state: "matched",
    }),
    centre("birch", { claim_status: "approved", claim_row_status: "approved" }),
    centre("cedar", { claim_status: "declined", claim_row_status: "declined" }),
  ];
  const result = await readAdminCentreQueueRows();
  const byId = new Map(result.map((row) => [row.daycareId, row]));
  assert.equal(byId.get("willow").claimStatus, "waiting");
  assert.equal(byId.get("maple").claimStatus, "waiting");
  assert.equal(byId.get("maple").hasProviderLink, true);
  assert.equal(byId.get("elm").live, true);
  assert.equal(byId.get("birch").claimStatus, "approved");
  assert.equal(byId.get("birch").live, false);
  assert.equal(byId.get("cedar").claimStatus, "declined");
  assert.deepEqual(tallyAdminCentreStats(staffQueueRows(result, false)), {
    waiting: 2,
    approved: 1,
    declined: 1,
    all: 5,
  });
  assert.equal(fixture().calls.length, 1);
  assert.equal(fixture().unexpectedQueries, 0);
  assert.ok(result.every((row) => !Object.hasOwn(row, "addonLine")));
});

test("queue selection retains one claim and provider link without broadening its SQL membership", async () => {
  await readAdminCentreQueueRows();
  const text = fixture().calls[0].text;
  assert.equal((text.match(/left join lateral/gi) ?? []).length, 2);
  assert.match(text, /from listing_claims\s+where daycare_id = d\.id/);
  assert.match(text, /when status in \('waiting', 'pending', 'verified'\) then 0/);
  assert.match(text, /when status = 'superseded' then 3/);
  assert.match(text, /created_at desc nulls last\s+limit 1/);
  assert.match(text, /select user_id from provider_daycares where daycare_id = d\.id limit 1/);
  assert.match(text, /where d\.claimed_at is not null/);
  assert.match(text, /exists \(select 1 from listing_claims lc where lc\.daycare_id = d\.id\)/);
  assert.match(text, /d\.merged_into is not null/);
  assert.match(text, /nullif\(btrim\(coalesce\(d\.import_fault, ''\)\), ''\) is not null/);
  assert.equal(fixture().unexpectedQueries, 0);
});

test("canonical review collapse keeps the licensed Live row and preserves hidden review work", async () => {
  fixture().rows = [
    centre("older-live", {
      claim_status: "approved",
      claim_row_status: "approved",
      license_number: "SYNTHETIC-SHARED-LICENCE",
      license_status: "matched",
      submitted_at: "2026-11-16T10:00:00.000Z",
    }),
    centre("newer-waiting", {
      license_number: "SYNTHETIC-SHARED-LICENCE",
      submitted_at: "2026-11-17T11:00:00.000Z",
    }),
    centre("merged", {
      name: "Synthetic Z Merged Centre",
      merged_into: "older-live",
      merged_into_name: "Synthetic Keeper Centre",
    }),
    centre("fault", {
      name: "Synthetic A Review Centre",
      import_fault: "possible_second_site",
    }),
    centre("superseded", {
      claim_status: "superseded",
      claim_row_status: "superseded",
    }),
  ];
  const result = await readAdminCentreQueueRows();
  assert.deepEqual(
    result.map((row) => row.daycareId),
    ["older-live", "fault", "merged"],
  );
  assert.equal(result[0].live, true);
  assert.equal(result[1].importFault, "possible_second_site");
  assert.equal(result[2].mergedInto, "older-live");
  assert.equal(fixture().unexpectedQueries, 0);
});

test("production counts exclude named QA while keeping real waiting claims and hidden review rows", async () => {
  fixture().rows = [
    centre("real-waiting", { is_test: 1 }),
    centre("qa-waiting", { name: "TEST Synthetic Nursery", is_test: 1 }),
    centre("qa-live", {
      name: "QA Synthetic Licensed Nursery",
      claim_status: "approved",
      claim_row_status: "approved",
      license_status: "matched",
      is_test: 1,
    }),
    centre("hidden-review", { import_fault: "possible_second_site", is_test: 1 }),
  ];
  const result = await readAdminCentreQueueRows();
  assert.equal(result.length, 4);
  const production = staffQueueRows(result, false);
  assert.deepEqual(
    new Set(production.map((row) => row.daycareId)),
    new Set(["real-waiting", "hidden-review"]),
  );
  assert.deepEqual(tallyAdminCentreStats(production), {
    waiting: 2,
    approved: 0,
    declined: 0,
    all: 2,
  });
  assert.equal(staffQueueRows(result, true).length, 4);
  assert.equal(fixture().unexpectedQueries, 0);
});

test("reader overlays a stored licence reference without any unrelated enrichment read", async () => {
  fixture().rows = [
    centre("from-claim", { license_photo: null }),
    centre("from-upload", { license_photo: null }),
  ];
  fixture().claims = [
    { daycare_id: "from-claim", license_photo: "r2:private/synthetic-claim.pdf" },
  ];
  fixture().uploads = [
    { daycare_id: "from-upload", license_photo: "r2:private/synthetic-upload.pdf" },
  ];
  const result = await readAdminCentreQueueRows();
  assert.equal(result.length, 2);
  assert.ok(result.every((row) => row.licensePhoto));
  assert.equal(fixture().calls.length, 3);
  assert.equal(fixture().unexpectedQueries, 0);
});

test("real empty queue stays empty while acquisition and queue-query failures reject", async () => {
  assert.deepEqual(await readAdminCentreQueueRows(), []);
  fixture().acquireError = new Error("Synthetic queue acquisition failure");
  await assert.rejects(readAdminCentreQueueRows(), /Synthetic queue acquisition failure/);
  fixture().acquireError = null;
  fixture().queryError = new Error("Synthetic queue read failure");
  await assert.rejects(readAdminCentreQueueRows(), /Synthetic queue read failure/);
  fixture().queryError = "Synthetic non-error failure";
  await assert.rejects(readAdminCentreQueueRows(), /Could not load the admin queue/);
  assert.equal(fixture().unexpectedQueries, 0);
});
