import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { centreHasNotJoined } from "../src/lib/centre-joined.ts";
import {
  DESK_GROUPS,
  phoneDeskGroupOpen,
  sidebarDestinations,
  visibleDeskGroups,
  visibleDeskNav,
} from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

/**
 * Destinations the sidebars showed before the regroup.
 * A heading change must not add or drop a link.
 */
const PARENT_ON = [
  "/account?tab=profile&section=alerts&desk=parent",
  "/account?tab=profile&section=appearance&desk=parent",
  "/account?tab=profile&section=delete&desk=parent",
  "/account?tab=profile&section=email-sms&desk=parent",
  "/account?tab=profile&section=profile&desk=parent",
  "/account?tab=profile&section=security&desk=parent",
  "/inbox?view=family",
  "/parent?tab=explore",
  "/parent?tab=subscription",
  "/search",
  "id:alerts",
  "id:bookings",
  "id:care",
  "id:children",
  "id:payments",
  "id:saved",
  "id:waitlists",
];

const PARENT_OFF = PARENT_ON.filter((href) => href !== "/parent?tab=subscription");

const DAYCARE_ON = [
  "/account?tab=profile&section=alerts&desk=director",
  "/account?tab=profile&section=appearance&desk=director",
  "/account?tab=profile&section=delete&desk=director",
  "/account?tab=profile&section=email-sms&desk=director",
  "/account?tab=profile&section=profile&desk=director",
  "/account?tab=profile&section=security&desk=director",
  "/claim",
  "/inbox?view=centre",
  "/jobs/post",
  "/provider/subscription",
  "/provider?desk=contract",
  "/provider?desk=employees",
  "/provider?desk=licence",
  "/provider?desk=listings",
  "/provider?desk=money",
  "/provider?desk=promote",
  "/provider?desk=requests",
  "/provider?desk=screening",
  "/provider?desk=today",
  "/provider?desk=tours",
  "id:add",
];

const DAYCARE_OFF = DAYCARE_ON.filter((href) => href !== "/provider/subscription");

const DAYCARE_STAFF = [
  "/account?tab=profile&section=alerts&desk=director",
  "/account?tab=profile&section=appearance&desk=director",
  "/account?tab=profile&section=delete&desk=director",
  "/account?tab=profile&section=email-sms&desk=director",
  "/account?tab=profile&section=profile&desk=director",
  "/account?tab=profile&section=security&desk=director",
  "/inbox?view=centre",
  "/provider/subscription",
  "/provider?desk=listings",
  "/provider?desk=requests",
  "/provider?desk=screening",
  "/provider?desk=today",
  "/provider?desk=tours",
];

const owner = { providerSubscriptions: true, showPayCtas: true, subscriptionsEnabled: true, centreOwner: true };

test("parent and daycare sidebar hrefs match the set from before the regroup", () => {
  assert.deepEqual(sidebarDestinations("parent", { subscriptionsEnabled: true }), PARENT_ON);
  assert.deepEqual(sidebarDestinations("parent", { subscriptionsEnabled: false }), PARENT_OFF);
  assert.deepEqual(sidebarDestinations("daycare", owner), DAYCARE_ON);
  assert.deepEqual(sidebarDestinations("daycare", { ...owner, subscriptionsEnabled: false }), DAYCARE_OFF);
  assert.deepEqual(
    sidebarDestinations("daycare", { ...owner, showPayCtas: false, subscriptionsEnabled: false }),
    DAYCARE_OFF,
  );
  assert.deepEqual(
    sidebarDestinations("daycare", { subscriptionsEnabled: true, centreOwner: false }),
    DAYCARE_STAFF,
  );
});

test("parent and daycare groups use the new headings and keep every previous link", () => {
  assert.deepEqual(
    DESK_GROUPS.parent.map((group) => group.id),
    ["find-care", "my-requests", "my-family", "account", "settings"],
  );
  assert.deepEqual(
    DESK_GROUPS.parent.map((group) => [...group.itemIds]),
    [
      ["search", "explore", "saved", "alerts"],
      ["bookings", "waitlists", "messages"],
      ["children", "care", "payments"],
      ["profile", "appearance", "upgrade", "delete"],
      ["notify-prefs", "security", "email-sms"],
    ],
  );
  assert.deepEqual(
    DESK_GROUPS.daycare.map((group) => group.id),
    ["daily", "my-centre", "team", "money", "account", "settings"],
  );
  assert.deepEqual(
    DESK_GROUPS.daycare.map((group) => [...group.itemIds]),
    [
      ["today", "requests", "tours", "messages"],
      ["listings", "add", "claim", "licence", "screening", "contract"],
      ["employees", "post-job"],
      ["money", "promote"],
      ["profile", "appearance", "subscription", "delete"],
      ["notify-prefs", "security", "email-sms"],
    ],
  );
  assert.equal(DESK_GROUPS.parent.find((group) => group.id === "find-care")?.labelKey, "navFindCare");
  assert.equal(DESK_GROUPS.parent.find((group) => group.id === "my-requests")?.labelKey, "navMyRequests");
  assert.equal(DESK_GROUPS.daycare.find((group) => group.id === "daily")?.labelKey, "navDaily");
  assert.equal(DESK_GROUPS.daycare.find((group) => group.id === "my-centre")?.labelKey, "navMyCentre");
  assert.equal(DESK_GROUPS.daycare.find((group) => group.id === "money")?.labelKey, "navMoney");
});

test("phones open only the group that holds the current page", () => {
  const parent = visibleDeskGroups("parent", visibleDeskNav("parent", { subscriptionsEnabled: true }));
  const open = parent.filter((row) => phoneDeskGroupOpen(row.items, "explore", "/parent")).map((row) => row.group.id);
  assert.deepEqual(open, ["find-care"]);
  const daycare = visibleDeskGroups("daycare", visibleDeskNav("daycare", owner));
  const daily = daycare.filter((row) => phoneDeskGroupOpen(row.items, "today", "/provider")).map((row) => row.group.id);
  assert.deepEqual(daily, ["daily"]);
  const drawer = src("src/components/nav-drawer.tsx");
  assert.match(drawer, /phoneDeskGroupOpen/);
  assert.match(drawer, /max-width: 767px/);
  assert.match(drawer, /if \(holdsPage && !event\.currentTarget\.open\) event\.currentTarget\.open = true/);
});

test("listings page keeps Add and Claim in the sidebar and adds the same actions on the page", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /data-ke="listings-actions"/);
  assert.match(provider, /t\("deskListingsAdd"\)/);
  assert.match(provider, /t\("deskNavClaim"\)/);
  assert.match(provider, /to="\/claim"/);
  assert.equal(DESK_GROUPS.daycare.find((group) => group.id === "my-centre")?.itemIds.includes("add"), true);
  assert.equal(DESK_GROUPS.daycare.find((group) => group.id === "my-centre")?.itemIds.includes("claim"), true);
});

test("an unclaimed listing shows joined-later text instead of the waitlist button", () => {
  assert.equal(centreHasNotJoined({ claimStatus: "unclaimed" }), true);
  assert.equal(centreHasNotJoined({ claimStatus: null }), true);
  assert.equal(centreHasNotJoined({ claimStatus: "unclaimed", live: true }), false);
  assert.equal(centreHasNotJoined({ claimStatus: "pending" }), false);
  assert.equal(centreHasNotJoined({ claimStatus: "approved", claimedAt: "2026-01-01" }), false);
  const page = src("src/routes/daycare.$slug.tsx");
  const panel = src("src/components/join-waitlist.tsx");
  assert.match(page, /unclaimed=\{centreHasNotJoined\(d\)\}/);
  assert.match(panel, /data-ke="centre-not-joined"/);
  assert.match(panel, /t\("centreNotJoined"\)/);
  assert.match(src("src/lib/server/spot-offers.ts"), /centreHasNotJoined/);
  assert.match(src("src/lib/copy.ts"), /centreNotJoined: "This centre hasn't joined KidEase yet"/);
  assert.match(src("src/lib/copy.ts"), /centreNotJoined: "Ce centre n’a pas encore rejoint KidEase"/);
  assert.match(src("src/lib/copy.ts"), /navMyRequests: "My requests"/);
  assert.match(src("src/lib/copy.ts"), /navMyRequests: "Mes demandes"/);
  assert.match(src("src/lib/copy.ts"), /navDaily: "Daily"/);
  assert.match(src("src/lib/copy.ts"), /navDaily: "Quotidien"/);
});
