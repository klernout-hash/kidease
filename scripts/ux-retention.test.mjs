import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parentLoginSearch } from "../src/lib/auth/parent-login.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("parent login search returns visitors to the page they left", () => {
  assert.deepEqual(parentLoginSearch("/daycare/maple-grove"), {
    role: "parent",
    desk: "parent",
    intent: "in",
    next: "/daycare/maple-grove",
  });
  assert.equal(parentLoginSearch("search").next, "/search");
});

test("listing detail keeps website CTAs, login next, and a back link", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /parentLoginSearch\(`\/daycare\/\$\{slug\}`\)/);
  assert.match(listing, /backToExplore/);
  assert.match(listing, /listingCtaLead/);
  assert.match(listing, /searchNearby/);
  assert.match(listing, /lg:hidden \[\[data-channel=app\]_&\]:bottom-20/);
  assert.doesNotMatch(listing, /\[\[data-channel=website\]_&\]:hidden/);
  assert.doesNotMatch(listing, /to="\/checkin\/\$id"/);
  assert.doesNotMatch(listing, /<Button disabled>\{t\("notOnKidEase"\)\}<\/Button>/);
});

test("waitlist and account guest sign-in keep a next path", () => {
  const waitlist = src("src/components/waitlist-opt-in.tsx");
  assert.match(waitlist, /parentLoginSearch\(next \?\? "\/search"\)/);
  const account = src("src/routes/account.tsx");
  assert.match(account, /parentLoginSearch\(/);
  assert.match(account, /\/parent\?tab=saved/);
  assert.match(account, /DeskSkeleton/);
});

test("Explore empty states distinguish load failure from a true empty radius", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /searchFailedTitle/);
  assert.match(search, /searchFailedLead/);
  assert.match(search, /widenSearchRadius/);
  assert.match(search, /ExploreHint/);
  assert.match(search, /ke-skel size-full/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /searchFailedTitle: "Couldn't load centres"/);
  assert.match(copy, /searchFailedTitle: "Impossible de charger les centres"/);
  assert.match(copy, /exploreHintTitle: "What to do next"/);
  assert.match(copy, /backToExplore: "Back to Explore"/);
});

test("error surfaces and get-app offer a next step instead of a dead end", () => {
  const err = src("src/lib/error-component.tsx");
  assert.match(err, /Reload Explore/);
  assert.match(err, /Back to home/);
  assert.match(err, /Email support/);
  assert.match(err, /SUPPORT_INBOX_EMAIL/);
  const rootCrash = src("src/routes/__root.tsx");
  assert.match(rootCrash, /href="\/search"/);
  assert.match(rootCrash, /href="\/"/);
  const getApp = src("src/routes/get-app.tsx");
  assert.match(getApp, /getAppBrowse/);
  assert.match(getApp, /to="\/search"/);
});

test("listing cards label the heart as compare, not save", () => {
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /addToCompare/);
  assert.match(card, /comparing/);
  assert.doesNotMatch(card, /aria-label=\{t\("saved"\)\}/);
});

test("home offers a resume CTA and records a sanitized last path", () => {
  const home = src("src/routes/index.tsx");
  const copy = src("src/lib/copy.ts");
  const boot = src("src/components/posthog-boot.tsx");
  const shell = src("src/components/shell.tsx");
  assert.match(home, /ResumeVisitCard/);
  assert.match(boot, /captureRetentionTouch/);
  assert.match(shell, /rememberResumePath/);
  assert.match(copy, /resumeVisitTitle: "Pick up where you left off"/);
  assert.match(copy, /resumeVisitTitle: "Reprenez là où vous étiez"/);
  assert.match(src("docs/posthog.md"), /retention_touch/);
  assert.match(src("docs/posthog.md"), /7-13/);
});

test("signed-in drawer Account goes to /account, not a stranded /parent default", () => {
  const shell = src("src/components/shell.tsx");
  assert.match(shell, /accountHref="\/account"/);
  assert.match(shell, /accountSearch=\{accountSearch\(sticky\)\}/);
  const drawer = src("src/components/nav-drawer.tsx");
  assert.match(drawer, /accountHref = "\/account"/);
  assert.match(drawer, /accountSearch/);
  assert.match(drawer, /to=\{accountHref\}[\s\S]*justify-center[\s\S]*text-center[\s\S]*\{accountLabel\}/);
  assert.match(drawer, /onSignOut\(\)[\s\S]*justify-center[\s\S]*text-center[\s\S]*Sign out/);
  assert.doesNotMatch(drawer, /text-left text-base text-fg ring-1 ring-border/);
});
