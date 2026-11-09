import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { ageOpenSpotsEnabled, childCheckinEnabled, eceJobsEnabled, waitlistToolsEnabled } from "../src/lib/features.ts";
import {
  ageFitsSpot,
  checkoutAllowed,
  gapCopy,
  jobDeskForViewer,
  jobDeskPowers,
  knownSum,
  matchOpenSpotParent,
  moveInLine,
  nextDoorAction,
  openSpotChannels,
  moneyCentreChoice,
  pickCentre,
  placeFromRank,
  provinceBucket,
  staffingShortage,
} from "../src/lib/gap-features.ts";
import { gapJobsPageOk } from "./e2e-smoke-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("gap flags default off and do not start checkout", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_ECE_JOBS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_WAITLIST_TOOLS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_AGE_OPEN_SPOTS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CHILD_CHECKIN, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_ORG_DASHBOARD, false);
  assert.equal(eceJobsEnabled({}), false);
  assert.equal(eceJobsEnabled({ FEATURE_ECE_JOBS: "1" }), true);
  assert.equal(waitlistToolsEnabled({}), false);
  assert.equal(ageOpenSpotsEnabled({ FEATURE_AGE_OPEN_SPOTS: "1" }), true);
  assert.equal(childCheckinEnabled({}), false);
  for (const flag of ["FEATURE_ECE_JOBS", "FEATURE_WAITLIST_TOOLS", "FEATURE_AGE_OPEN_SPOTS", "FEATURE_CHILD_CHECKIN", "FEATURE_ORG_DASHBOARD"]) {
    assert.match(src(".env.example"), new RegExp(`^${flag}=0$`, "m"));
    assert.doesNotMatch(src(".env.example"), new RegExp(`^${flag}=1$`, "m"));
  }
  const files = [
    "src/lib/server/ece-jobs.ts",
    "src/lib/server/open-spot-posts.ts",
    "src/lib/server/child-checkin.ts",
    "src/lib/server/org-occupancy.ts",
    "src/components/ece-job-desk.tsx",
  ];
  for (const file of files) {
    assert.doesNotMatch(src(file), /stripe|SUBSCRIPTIONS_ENABLED|showPayCtas|canUsePayCheckout/);
  }
});

test("job board powers differ on each desk and stay on one flag", () => {
  assert.deepEqual(jobDeskPowers("daycare"), { browse: false, apply: false, post: true, manage: true, shortage: false });
  assert.deepEqual(jobDeskPowers("org"), { browse: false, apply: false, post: true, manage: true, shortage: false });
  assert.deepEqual(jobDeskPowers("parent"), { browse: true, apply: true, post: false, manage: false, shortage: false });
  assert.deepEqual(jobDeskPowers("staff"), { browse: true, apply: true, post: false, manage: false, shortage: false });
  assert.deepEqual(jobDeskPowers("gov"), { browse: false, apply: false, post: false, manage: false, shortage: true });
  assert.equal(jobDeskForViewer({ centreOwner: true, surface: "today" }), "daycare");
  assert.equal(jobDeskForViewer({ centreOwner: false, surface: "today" }), "staff");
  assert.equal(jobDeskForViewer({ centreOwner: true, surface: "employees" }), "staff");
  assert.equal(jobDeskForViewer({ centreOwner: false, surface: "staff" }), "staff");
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /EceJobDesk mode=\{centreOwner \? "daycare" : "staff"\}/);
  assert.match(provider, /desk === "employees" \? <EceJobDesk mode="staff"/);
  assert.match(provider, /desk === "staff" \? <EceJobDesk mode="staff"/);
  const desk = src("src/components/ece-job-desk.tsx");
  assert.match(desk, /data-ke=\{`ece-jobs-\$\{mode\}`\}/);
  assert.match(desk, /data-ke="ece-jobs-gov"/);
  assert.match(provider, /ChildCheckinDesk/);
  assert.match(src("src/components/org-occupancy-desk.tsx"), /EceJobDesk mode="org"/);
  assert.match(src("src/components/parent-desk.tsx"), /EceJobDesk mode="parent"/);
  assert.match(src("src/components/gov/gov-dashboard.tsx"), /GovJobShortage/);
  const gov = src("src/lib/server/ece-jobs.ts");
  assert.match(gov, /listJobShortage/);
  assert.match(gov, /govAuthMiddleware/);
  assert.match(gov, /count\(\*\)::int as open_jobs/);
  assert.doesNotMatch(gov.slice(gov.indexOf("listJobShortage")), /a\.email|applicant/);
  assert.equal(staffingShortage([{ province: "MB", openJobs: 4, centres: 2 }], "MB").openJobs, 4);
  assert.equal(staffingShortage([], "ON").openJobs, 0);
  assert.equal(provinceBucket("Québec"), "QC");
  assert.equal(provinceBucket("Texas"), "");
});

test("waitlist rank, open-spot match, and door rules stay honest", () => {
  const line = [
    { id: "a", rank: 1, joinedAt: "2026-01-01", status: "waiting" },
    { id: "b", rank: 2, joinedAt: "2026-01-02", status: "waiting" },
  ];
  const moved = moveInLine(line, "b", "up");
  assert.equal(moved?.[0]?.id, "b");
  assert.equal(placeFromRank(moved, "b"), 1);
  assert.equal(moveInLine(line, "a", "up"), null);
  assert.equal(matchOpenSpotParent("infant", { userId: "p", waitlistAge: "infant", interestAge: null, saved: false, searchAges: [] }), "waitlist");
  assert.equal(matchOpenSpotParent("infant", { userId: "p", waitlistAge: null, interestAge: null, saved: true, searchAges: ["school-age"] }), null);
  assert.equal(matchOpenSpotParent("toddler", { userId: "p", waitlistAge: null, interestAge: null, saved: true, searchAges: [] }), "saved");
  assert.equal(ageFitsSpot("preschool", "any"), true);
  assert.deepEqual(openSpotChannels({ featureOn: false, mailOn: true, pushOn: true }), { inApp: false, mail: false, push: false });
  assert.deepEqual(openSpotChannels({ featureOn: true, mailOn: false, pushOn: true }), { inApp: true, mail: false, push: true });
  assert.equal(nextDoorAction(null), "check_in");
  assert.equal(nextDoorAction("check_in"), "check_out");
  assert.equal(checkoutAllowed("Sam Lee", []).ok, true);
  assert.deepEqual(checkoutAllowed("", [{ name: "Sam Lee" }]), { ok: false, reason: "need_pickup" });
  assert.equal(checkoutAllowed("Sam Lee", [{ name: "Sam Lee" }]).ok, true);
  assert.equal(checkoutAllowed("Pat", [{ name: "Sam Lee" }]).ok, false);
  assert.equal(knownSum([null, null]), null);
  assert.equal(knownSum([1, null, 2]), 3);
  assert.equal(pickCentre(["c1"], "c2"), null);
  assert.equal(pickCentre(["c1"], "c1"), "c1");
  assert.deepEqual(moneyCentreChoice(["oaks", "pines"], null), { id: null, needsPick: true });
  assert.deepEqual(moneyCentreChoice(["oaks", "pines"], "pines"), { id: "pines", needsPick: false });
  assert.deepEqual(moneyCentreChoice(["oaks", "pines"], "other"), { id: null, needsPick: true });
  assert.deepEqual(moneyCentreChoice(["oaks"], null), { id: "oaks", needsPick: false });
  const en = JSON.stringify(gapCopy("en"));
  const fr = JSON.stringify(gapCopy("fr"));
  assert.doesNotMatch(en + fr, /\bzip\b|\bcounty\b|\bcenter\b|\bunited states\b/i);
  assert.match(fr, /centre|Poste|Arrivée/i);
  assert.match(src("src/components/spot-offer-desk.tsx"), /rankWaitlistEntry/);
  assert.match(src("src/components/child-checkin-desk.tsx"), /data-ke="child-checkin"/);
  assert.match(src("src/components/child-checkin-desk.tsx"), /data-ke="child-check-history"/);
  assert.match(src("src/components/age-open-spots-desk.tsx"), /data-ke="age-open-spots"/);
  assert.match(src("src/routes/provider.tsx"), /AgeOpenSpotsDesk/);
  assert.match(src("src/routes/provider.tsx"), /ChildCheckinDesk/);
  assert.match(src("src/components/parent-desk.tsx"), /ChildCheckHistory/);
  assert.match(src("migrations/0161_job_board_manage.sql"), /centre_job_posts/);
  assert.match(src("migrations/0165_org_centre_focus.sql"), /org_centre_focus/);
});

test("jobs page smoke stays on a Canadian heading", () => {
  assert.equal(gapJobsPageOk({ status: 200, bodyText: "Find daycare jobs in Canada" }).ok, true);
  assert.equal(gapJobsPageOk({ status: 500, bodyText: "Find daycare jobs in Canada" }).ok, false);
  assert.equal(gapJobsPageOk({ status: 200, bodyText: "Find daycare jobs in Canada. Enter a zip code." }).ok, false);
});
