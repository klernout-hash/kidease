import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_CENTRE_STAT_COPY,
  adminCentreListingStatus,
  adminCentreMatchesStat,
  adminLeadStatHonesty,
  adminStatSearchValue,
  defaultAdminStat,
  filterAdminCentresByStat,
  isAdminLeadStat,
  parseAdminStatFilter,
  resolveAdminStat,
  selectAdminStat,
  tallyAdminCentreStats,
} from "../src/lib/admin-stat-filter.ts";
import { listingStatusFromClaim } from "../src/lib/listing-status.ts";
import { staffQueueRows } from "../src/lib/listing-visibility.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function centre(partial) {
  return {
    daycareId: partial.daycareId || partial.name || "id",
    name: partial.name || "Centre",
    claimStatus: partial.claimStatus,
    live: partial.live,
    claimedAt: partial.claimedAt ?? null,
    isTest: partial.isTest,
    slug: partial.slug,
    licenseNumber: partial.licenseNumber,
    address: partial.address,
  };
}

const staff = [
  centre({ daycareId: "wait-1", name: "Waiting Oak", claimStatus: "waiting" }),
  centre({ daycareId: "wait-2", name: "Pending Maple", claimStatus: "pending" }),
  centre({ daycareId: "live-1", name: "Live Cedar", claimStatus: "approved", live: true }),
  centre({ daycareId: "live-2", name: "Claimed Birch", claimStatus: "unclaimed", claimedAt: "2026-01-01T00:00:00.000Z" }),
  centre({ daycareId: "dec-1", name: "Declined Pine", claimStatus: "declined" }),
  centre({ daycareId: "dec-2", name: "Rejected Spruce", claimStatus: "rejected" }),
  centre({ daycareId: "dec-3", name: "Denied Fir", claimStatus: "denied", live: true }),
  centre({ daycareId: "qa-dec", name: "TEST Ghost Claim Lab", claimStatus: "declined", isTest: true, slug: "test-ghost-claim-lab" }),
];

test("pill selection switches dedicated tabs and keeps Live/Declined on the current list", () => {
  assert.deepEqual(selectAdminStat("queue", "waiting"), { tab: "queue", stat: "waiting" });
  assert.deepEqual(selectAdminStat("queue", "declined"), { tab: "queue", stat: "declined" });
  assert.deepEqual(selectAdminStat("queue", "live"), { tab: "queue", stat: "live" });
  assert.deepEqual(selectAdminStat("queue", "incomplete"), { tab: "incomplete", stat: "incomplete" });
  assert.deepEqual(selectAdminStat("queue", "all"), { tab: "daycares", stat: "all" });
  assert.deepEqual(selectAdminStat("daycares", "waiting"), { tab: "queue", stat: "waiting" });
  assert.deepEqual(selectAdminStat("daycares", "declined"), { tab: "daycares", stat: "declined" });
  assert.deepEqual(selectAdminStat("incomplete", "waiting"), { tab: "queue", stat: "waiting" });
  assert.deepEqual(selectAdminStat("incomplete", "live"), { tab: "daycares", stat: "live" });
  assert.deepEqual(selectAdminStat("incomplete", "license"), { tab: "verify", stat: "license" });
  assert.deepEqual(selectAdminStat("queue", "leads-open"), { tab: "queue", stat: "leads-open" });
  assert.equal(defaultAdminStat("queue"), "waiting");
  assert.equal(defaultAdminStat("daycares"), "all");
  assert.equal(resolveAdminStat("queue"), "waiting");
  assert.equal(resolveAdminStat("queue", "declined"), "declined");
  assert.equal(adminStatSearchValue("queue", "waiting"), undefined);
  assert.equal(adminStatSearchValue("queue", "declined"), "declined");
  assert.equal(parseAdminStatFilter("declined"), "declined");
  assert.equal(parseAdminStatFilter("nope"), undefined);
});

test("Declined list membership matches listingStatusFromClaim / counts.declined", () => {
  const production = staffQueueRows(staff, false);
  const counts = tallyAdminCentreStats(production);
  const declined = filterAdminCentresByStat(production, "declined");

  assert.equal(counts.declined, 3);
  assert.equal(declined.length, 3);
  assert.deepEqual(
    declined.map((c) => c.daycareId).sort(),
    ["dec-1", "dec-2", "dec-3"],
  );
  for (const row of declined) {
    assert.equal(listingStatusFromClaim(row.claimStatus, { live: row.live, claimedAt: row.claimedAt }), "declined");
    assert.equal(adminCentreListingStatus(row), "declined");
    assert.equal(adminCentreMatchesStat(row, "declined"), true);
  }
  assert.equal(
    declined.some((c) => c.daycareId === "qa-dec"),
    false,
    "QA fixtures stay out of Declined until Show QA fixtures",
  );

  const withQa = filterAdminCentresByStat(staffQueueRows(staff, true), "declined");
  assert.equal(withQa.length, 4);
  assert.ok(withQa.some((c) => c.daycareId === "qa-dec"));

  const live = filterAdminCentresByStat(production, "live");
  assert.equal(live.length, counts.approved);
  assert.ok(live.every((c) => listingStatusFromClaim(c.claimStatus, { live: c.live, claimedAt: c.claimedAt }) === "live"));
  assert.ok(!live.some((c) => c.claimStatus === "declined" || c.claimStatus === "denied"));

  const waiting = filterAdminCentresByStat(production, "waiting");
  assert.equal(waiting.length, counts.waiting);
  assert.deepEqual(
    waiting.map((c) => c.daycareId).sort(),
    ["wait-1", "wait-2"],
  );

  const needle = "pine";
  const searched = production.filter((c) => c.name.toLowerCase().includes(needle));
  assert.deepEqual(
    filterAdminCentresByStat(searched, "declined").map((c) => c.daycareId),
    ["dec-1"],
  );
});

test("lead pills stay count-only and do not invent centre rows", () => {
  assert.equal(isAdminLeadStat("leads-declined"), true);
  assert.deepEqual(filterAdminCentresByStat(staff, "leads-open"), []);
  assert.match(adminLeadStatHonesty("leads-declined", 0).body, /No lead requests/);
  assert.match(adminLeadStatHonesty("leads-open", 4).body, /4 lead requests recorded/);
  assert.match(adminLeadStatHonesty("leads-open", 4).body, /not listed here/);
});

test("admin desk Stat pills are buttons with selected state and Declined filter wiring", () => {
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /function Stat\(/);
  assert.match(admin, /type="button"/);
  assert.match(admin, /aria-pressed=\{Boolean\(accent\)\}/);
  assert.match(admin, /data-ke="admin-stat"/);
  assert.match(admin, /onSelectStat\("declined"\)/);
  assert.match(admin, /onSelectStat\("live"\)/);
  assert.match(admin, /onSelectStat\("leads-open"\)/);
  assert.match(admin, /filterAdminCentresByStat/);
  assert.match(admin, /selectAdminStat/);
  assert.match(admin, /data-ke-stat-list=\{stat\}/);
  assert.match(admin, /AdminCentresLoadBanner/);
  assert.match(admin, /ADMIN_IDLE_TIMEOUT_MESSAGE/);
  assert.match(admin, /showQaFixtures/);
  assert.match(src("src/lib/account-notify.ts"), /if \(search\.stat\) params\.set\("stat", search\.stat\)/);
  assert.equal(ADMIN_CENTRE_STAT_COPY.declined.title, "Declined");
});
