import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GHOST_LISTING } from "../src/lib/ghost-listing.ts";
import { isAdminOnlyListing, staffQueueRows } from "../src/lib/listing-visibility.ts";
import { highlightDesk, isDeskNeutralPath } from "../src/lib/desks.ts";
import { resolveInboxView } from "../src/lib/inbox-view.ts";
import { adapterStatusHint, adapterStatusLabel } from "../src/lib/province-registry.ts";
import { CHAT_SCAFFOLD_EMPTY, CHAT_SCAFFOLD_MESSAGE } from "../src/lib/chat-scaffold.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Guest: live vs all counts, empty-search lead, and listing login handoff", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /liveVsAllNone/);
  assert.match(search, /noLiveResultsLead/);
  assert.match(search, /areaPresence\(catalog\)/);
  assert.match(search, /parentLoginSearch\("\/search"\)/);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /needSignInTour/);
  assert.match(listing, /guestListingTrust/);
  assert.match(listing, /guestBrowse/);
  const login = src("src/routes/login.tsx");
  assert.match(login, /loginLeadListing/);
  assert.match(login, /loginLeadSearchSave/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /noLiveResultsLead:/);
  assert.match(copy, /guestSignInReturn:/);
});

test("Parent: request empty copy, inbox subtitle, and search ↔ child wayfinding", () => {
  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /title=\{t\("noRequests"\)\} body=\{t\("noRequestsLead"\)\}/);
  assert.match(parent, /sendChildProfile/);
  const inbox = src("src/components/inbox-list.tsx");
  assert.match(inbox, /inboxHasThreads/);
  assert.doesNotMatch(inbox, /items && items.length \? <p className="mt-2 text-sm text-muted">\{t\("noInboxLead"\)\}/);
  const search = src("src/routes/search.tsx");
  assert.match(search, /wayfindChildProfile/);
  assert.match(search, /tab: "children"/);
  const card = src("src/components/child-care-card.tsx");
  assert.match(card, /tab: "children"/);
  const rails = src("src/components/parent-desk-rails.tsx");
  assert.match(rails, /parentRailsEmptyLead/);
});

test("Daycare P1: Messages opens a centre inbox, not Messages with centres", () => {
  const nav = src("src/lib/desk-nav.ts");
  assert.match(nav, /view: "centre"/);
  assert.match(nav, /Parent inquiries \+ tours/);
  const inbox = src("src/lib/server/inbox.ts");
  assert.match(inbox, /view === "centre"/);
  const list = src("src/components/inbox-list.tsx");
  assert.match(list, /inboxCentreTitle/);
  assert.match(list, /noInboxCentre/);
  assert.match(list, /DeskShell/);
  assert.match(list, /desk="daycare"/);
  assert.equal(resolveInboxView({ search: "centre" }), "centre");
  assert.equal(resolveInboxView({ sticky: "provider" }), "centre");
  assert.equal(resolveInboxView({}), "family");
});

test("Daycare P2: Account stays on Daycare pill; unclaimed desk is guided onboarding", () => {
  const desks = src("src/lib/desks.ts");
  assert.match(desks, /isDeskNeutralPath/);
  assert.match(desks, /highlightDesk/);
  assert.doesNotMatch(desks, /\["\/account", "parent"\]/);
  assert.equal(isDeskNeutralPath("/account"), true);
  assert.equal(isDeskNeutralPath("/inbox"), true);
  assert.equal(highlightDesk("/account", "provider"), "provider");
  assert.equal(highlightDesk("/provider", "parent"), "provider");
  const switcher = src("src/components/desk-switcher.tsx");
  assert.match(switcher, /highlightDesk/);
  assert.match(switcher, /inboxSearch/);
  const account = src("src/routes/account.tsx");
  assert.match(account, /accountBackDaycare/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /ProviderOnboarding/);
  assert.match(provider, /providerOnboardingClaim/);
  assert.match(provider, /listings.length === 0 && !showNewForm/);
});

test("Admin P1: QA fixtures are opt-in on staff queues", () => {
  const live = { id: "mb-1", slug: "bonnie-bairns", name: "Bonnie Bairns" };
  const hidden = staffQueueRows([GHOST_LISTING, live, { name: "TEST Extra Claim Lab" }], false);
  assert.deepEqual(
    hidden.map((r) => r.slug || r.name),
    ["bonnie-bairns"],
  );
  assert.equal(staffQueueRows([GHOST_LISTING, live], true).length, 2);
  assert.equal(isAdminOnlyListing(GHOST_LISTING), true);
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /staffQueueRows/);
  assert.match(admin, /showQaFixtures/);
  assert.match(admin, /Show QA fixtures/);
});

test("Admin: registry stub labels and chat/activity guidance", () => {
  assert.match(adapterStatusLabel("stub"), /Adapter stub/);
  assert.match(adapterStatusLabel("stub"), /manual review/i);
  assert.match(adapterStatusLabel("manual"), /Manual review/);
  assert.match(adapterStatusLabel("manual"), /no live adapter/i);
  assert.match(adapterStatusLabel("adapter_ready"), /not a live scrape/i);
  assert.match(adapterStatusHint("stub"), /No live government scrape/);
  assert.match(adapterStatusHint("manual"), /Fail closed/);
  const trust = src("src/components/admin-trust.tsx");
  assert.match(trust, /adapterStatusHint/);
  assert.match(trust, /fail closed to operator manual review/);
  assert.match(trust, /Ontario, Alberta, British Columbia, Saskatchewan, and Québec/);
  assert.match(CHAT_SCAFFOLD_MESSAGE, /not a chat product/i);
  assert.match(CHAT_SCAFFOLD_EMPTY, /\/inbox/);
  const activity = src("src/routes/admin.tsx");
  assert.match(activity, /No platform events yet/);
  assert.match(activity, /Waiting on you/);
});
