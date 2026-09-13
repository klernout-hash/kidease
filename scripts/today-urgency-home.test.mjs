import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DAYCARE_PRIMARY_NAV_IDS,
  visibleDeskNav,
  visiblePrimaryDeskNav,
  visibleSecondaryDeskNav,
  providerNavSearch,
} from "../src/lib/desk-nav.ts";
import { PROVIDER_TAB_KEYS } from "../src/lib/desks.ts";
import {
  collectPendingTourRows,
  collectUnreadMessageRows,
  collectConfirmedTodayRows,
  formatSlaCountdown,
  isConfirmedTourToday,
  todayEmptyTruth,
  tourSlaRemainingMs,
  TODAY_TOUR_SLA_HOURS,
} from "../src/lib/today-sla.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const now = Date.parse("2026-09-13T15:00:00.000Z");

test("daycare primary nav is Today, Messages, Tour times, My listings", () => {
  assert.deepEqual([...DAYCARE_PRIMARY_NAV_IDS], ["today", "messages", "tours", "listings"]);
  const primary = visiblePrimaryDeskNav("daycare", {
    providerSubscriptions: true,
    showPayCtas: true,
    centreOwner: true,
  }).map((i) => i.id);
  assert.deepEqual(primary, ["today", "messages", "tours", "listings"]);
  assert.equal(primary.length <= 4, true);
  const secondary = visibleSecondaryDeskNav("daycare", {
    providerSubscriptions: true,
    showPayCtas: true,
    centreOwner: true,
  }).map((i) => i.id);
  assert.equal(secondary.includes("requests"), true);
  assert.equal(secondary.includes("employees"), true);
  assert.equal(secondary.includes("screening"), true);
  assert.equal(secondary.includes("money"), true);
  assert.equal(secondary.includes("licence"), true);
  assert.equal(secondary.includes("contract"), true);
  assert.equal(secondary.includes("promote"), true);
  assert.equal(secondary.includes("subscription"), true);
  assert.equal(secondary.includes("claim"), true);
  assert.equal(secondary.includes("add"), true);
  assert.equal(secondary.at(-1), "account");
  assert.equal(secondary.includes("today"), false);
  assert.equal(visibleDeskNav("daycare").some((i) => i.label === "Lead inbox"), true);
  assert.equal(providerNavSearch("today").desk, "today");
  assert.equal(providerNavSearch("requests").desk, "requests");
  assert.equal(PROVIDER_TAB_KEYS.includes("today"), true);
});

test("parent and admin primary nav stay unchanged", () => {
  const parent = visiblePrimaryDeskNav("parent").map((i) => i.id);
  assert.equal(parent.includes("explore"), true);
  assert.equal(parent.includes("children"), true);
  assert.equal(visibleSecondaryDeskNav("parent").length, 0);
  const admin = visiblePrimaryDeskNav("admin").map((i) => i.id);
  assert.equal(admin.includes("queue"), true);
  assert.equal(admin.includes("daycares"), true);
});

test("Today rows order tours, unread, then confirmed today and hide secrets", () => {
  const created = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const tours = [
    {
      id: "t1",
      conversationId: "c1",
      daycareId: "d1",
      daycareName: "Bonnie",
      daycareSlug: "bonnie",
      childId: null,
      childName: null,
      parentName: "Alex",
      preferredTimes: [{ date: "2026-09-20", time: "10:00" }],
      parentNote: "peanut allergy secret",
      status: "pending",
      centreNote: null,
      createdAt: created,
      respondedAt: null,
    },
    {
      id: "t2",
      conversationId: "c2",
      daycareId: "d1",
      daycareName: "Bonnie",
      daycareSlug: "bonnie",
      childId: null,
      childName: null,
      parentName: "Sam",
      preferredTimes: [{ date: "2026-09-13", time: "16:00" }],
      parentNote: null,
      status: "accepted",
      centreNote: null,
      createdAt: created,
      respondedAt: created,
    },
  ];
  const pending = collectPendingTourRows(tours, "Parent", now);
  const unread = collectUnreadMessageRows(
    [{ id: "c3", daycareName: "Jordan", unread: true, lastAt: new Date(now - 1000).toISOString() }],
    "Parent",
  );
  const confirmed = collectConfirmedTodayRows(tours, "Parent", now);
  const rows = [...pending, ...unread, ...confirmed];
  assert.equal(rows[0]?.kind, "tour_request");
  assert.equal(rows[0]?.canDecide, true);
  assert.equal(rows.some((r) => r.kind === "unread"), true);
  assert.equal(rows.some((r) => r.kind === "confirmed_tour"), true);
  assert.doesNotMatch(JSON.stringify(rows), /peanut allergy/);
  assert.equal(isConfirmedTourToday({ status: "accepted", preferredTimes: [{ date: "2026-09-13", time: "16:00" }] }, now), true);
  assert.match(src("src/lib/today-urgency.ts"), /collectActionRequired/);
  assert.match(src("src/lib/today-urgency.ts"), /detail: "verified"/);
});

test("SLA countdown uses 48h and empty truth never says no leads", () => {
  const created = new Date(now - 47 * 60 * 60 * 1000).toISOString();
  const remaining = tourSlaRemainingMs(created, now);
  const sla = formatSlaCountdown(remaining);
  assert.equal(TODAY_TOUR_SLA_HOURS, 48);
  assert.equal(sla.overdue, false);
  assert.equal(sla.hours, 1);
  const overdue = formatSlaCountdown(tourSlaRemainingMs(new Date(now - 50 * 60 * 60 * 1000).toISOString(), now));
  assert.equal(overdue.overdue, true);
  const empty = todayEmptyTruth({
    rows: [],
    tours: [],
    leads: [{ status: "requested" }],
    now,
  });
  assert.equal(empty?.kind, "all_set");
  assert.deepEqual(empty?.href, { to: "/provider", search: { desk: "requests" } });
  assert.doesNotMatch(JSON.stringify(empty), /no leads|leadNoCentre/i);
});

test("provider default desk is Today and clutter stays off that path", () => {
  const provider = src("src/routes/provider.tsx");
  const home = src("src/components/today-urgency-home.tsx");
  const shell = src("src/components/desk-shell.tsx");
  assert.match(provider, /DEFAULT_DESK: DaycareDesk = "today"/);
  assert.match(provider, /search\.desk \?\? DEFAULT_DESK/);
  assert.match(provider, /TodayUrgencyHome/);
  assert.match(provider, /desk === "today"/);
  assert.match(provider, /desk !== "today"/);
  assert.match(home, /todayAllSet/);
  assert.match(home, /acceptTour/);
  assert.match(home, /todayProposeTime/);
  assert.match(home, /declineTour/);
  assert.doesNotMatch(home, /Promote|Subscription|Claim a centre|FreePageExplainer|DirectorNudge|VacancyConfirm|ProviderPlanBanner|first-run|modal/);
  assert.match(shell, /visiblePrimaryDeskNav/);
  assert.match(shell, /visibleSecondaryDeskNav/);
  assert.match(shell, /bg-primary text-primary-fg/);
  assert.doesNotMatch(shell, /underline/);
  const todayBlock = provider.slice(provider.indexOf('desk === "today"'), provider.indexOf('desk === "requests"'));
  assert.doesNotMatch(todayBlock, /DirectorNudgeQueue|VacancyConfirmLoop|FreePageExplainer|ProviderPlanBanner|CompletenessChecklist|DemandCues|DirectorProStrip/);
  assert.match(provider, /desk === "listings"[\s\S]*DirectorNudgeQueue/);
  assert.match(provider, /desk === "listings"[\s\S]*VacancyConfirmLoop/);
  assert.match(provider, /CompletenessChecklist/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /disabled=\{!dirty\}/);
});

test("Sprint 1 does not rewrite public, parent, or admin IA", () => {
  const index = src("src/routes/index.tsx");
  const parent = src("src/components/parent-desk.tsx");
  const admin = src("src/routes/admin.tsx");
  assert.match(index, /homeLandPath/);
  assert.doesNotMatch(index, /TodayUrgencyHome|desk === "today"/);
  assert.doesNotMatch(parent, /TodayUrgencyHome/);
  assert.doesNotMatch(admin, /TodayUrgencyHome/);
  assert.match(src("src/lib/desk-nav.ts"), /id: "explore"/);
  assert.match(src("src/lib/desk-nav.ts"), /id: "queue"/);
});
