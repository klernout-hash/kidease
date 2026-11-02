import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DESK_GROUPS,
  sidebarDestinations,
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
  "/parent?tab=alerts",
  "/parent?tab=care",
  "/parent?tab=children",
  "/parent?tab=enrolled",
  "/parent?tab=explore",
  "/parent?tab=payments",
  "/parent?tab=saved",
  "/parent?tab=subscription",
  "/parent?tab=waitlists",
  "/search",
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

const DAYCARE_OFF = DAYCARE_ON.filter(
  (href) => href !== "/provider/subscription" && href !== "/provider?desk=promote",
);

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

test("parent and daycare groups stay on the live headings", () => {
  assert.deepEqual(
    DESK_GROUPS.parent.map((group) => group.id),
    ["family", "my-family", "search-tools", "account", "settings"],
  );
  assert.deepEqual(
    DESK_GROUPS.parent.map((group) => [...group.itemIds]),
    [
      ["explore", "saved", "bookings", "waitlists", "messages"],
      ["children", "care", "payments"],
      ["search", "alerts"],
      ["profile", "appearance", "upgrade", "delete"],
      ["notify-prefs", "security", "email-sms"],
    ],
  );
  assert.deepEqual(
    DESK_GROUPS.daycare.map((group) => group.id),
    ["desk", "business", "team", "compliance", "grow", "account", "settings"],
  );
  assert.equal(DESK_GROUPS.parent.find((group) => group.id === "family")?.labelKey, "familyDeskTitle");
  assert.equal(DESK_GROUPS.parent.find((group) => group.id === "search-tools")?.labelKey, "navSearchTools");
  assert.equal(DESK_GROUPS.daycare.find((group) => group.id === "desk")?.labelKey, "daycareDeskTitle");
  assert.equal(DESK_GROUPS.daycare.find((group) => group.id === "business")?.labelKey, "navBusiness");
  const drawer = src("src/components/nav-drawer.tsx");
  assert.doesNotMatch(drawer, /phoneDeskGroupOpen/);
  assert.doesNotMatch(src("src/routes/provider.tsx"), /data-ke="listings-actions"/);
  assert.doesNotMatch(src("src/lib/copy.ts"), /navMyRequests:/);
  assert.doesNotMatch(src("src/components/join-waitlist.tsx"), /centre-not-joined/);
});

test("messages, daily care, pay, and search alerts update the URL", () => {
  const parent = visibleDeskNav("parent", { subscriptionsEnabled: true });
  const byId = Object.fromEntries(parent.map((item) => [item.id, item]));
  assert.equal(byId.messages?.href, "/inbox");
  assert.equal(byId.messages?.search?.view, "family");
  assert.equal(byId.care?.href, "/parent");
  assert.equal(byId.care?.search?.tab, "care");
  assert.equal(byId.payments?.href, "/parent");
  assert.equal(byId.payments?.search?.tab, "payments");
  assert.equal(byId.alerts?.href, "/parent");
  assert.equal(byId.alerts?.search?.tab, "alerts");
});
