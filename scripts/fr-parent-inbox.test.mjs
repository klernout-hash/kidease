import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { tx } from "../src/lib/copy.ts";
import { deskFromPathname, loginErrorCallbackUrl, sanitizePostLoginNext, twoFactorPageUrl } from "../src/lib/desks.ts";
import { accountDeskPath, deskHrefForLocale, inboxListPath, menuDeskPath, parentDeskPath, providerDeskPath, sidebarDestinations, supportDeskPath } from "../src/lib/desk-nav.ts";
import { localeRedirectTarget } from "../src/lib/locale-geo.ts";
import { FRENCH_DESK_PREFIXES, isFrenchDeskPath, localePath, localeSwitchPath, stripLocalePrefix } from "../src/lib/locale-path.ts";
import { destinationAfterSignIn } from "../src/lib/role-access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const document = { method: "GET", accept: "text/html", secFetchDest: "document" };

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("French parent and inbox URLs stay French", () => {
  assert.equal(isFrenchDeskPath("/fr/parent"), true);
  assert.equal(isFrenchDeskPath("/fr/inbox/abc"), true);
  assert.equal(isFrenchDeskPath("/fr/account"), true);
  assert.equal(isFrenchDeskPath("/account"), true);
  assert.equal(isFrenchDeskPath("/fr/menu"), true);
  assert.equal(isFrenchDeskPath("/fr/provider"), true);
  assert.equal(isFrenchDeskPath("/provider/subscription"), false);
  assert.deepEqual(
    [...FRENCH_DESK_PREFIXES],
    ["/parent", "/inbox", "/account", "/menu", "/provider", "/support"],
  );
  assert.equal(localePath("/parent", "fr"), "/fr/parent");
  assert.equal(localePath("/inbox", "fr"), "/fr/inbox");
  assert.equal(localePath("/account", "fr"), "/fr/account");
  assert.equal(localePath("/menu", "fr"), "/fr/menu");
  assert.equal(localePath("/provider", "fr"), "/fr/provider");
  assert.equal(localePath("/support", "fr"), "/fr/support");
  assert.equal(localePath("/provider/subscription", "fr"), "/provider/subscription");
  assert.equal(localeSwitchPath("/account", "fr"), "/fr/account");
  assert.equal(localeSwitchPath("/fr/menu", "en"), "/menu");
  assert.equal(accountDeskPath("/fr/account"), "/fr/account");
  assert.equal(menuDeskPath("/fr/menu"), "/fr/menu");
  assert.equal(providerDeskPath("/fr/provider"), "/fr/provider");
  assert.equal(supportDeskPath("/fr/support"), "/fr/support");
  assert.equal(deskHrefForLocale("/account?tab=profile", "/fr/parent"), "/fr/account?tab=profile");
  assert.equal(deskHrefForLocale("/provider/subscription", "/fr/provider"), "/provider/subscription");
  assert.equal(localeSwitchPath("/parent", "fr"), "/fr/parent");
  assert.equal(localeSwitchPath("/fr/inbox", "en"), "/inbox");
  assert.equal(localeRedirectTarget({ ...document, pathname: "/fr/parent", cookie: "en" }), null);
  assert.equal(localeRedirectTarget({ ...document, pathname: "/fr/inbox", cookie: "en" }), null);
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/fr/parent", search: "?lang=en", cookie: "en" }),
    null,
  );
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/fr/inbox", search: "?lang=en", cookie: "fr" }),
    null,
  );
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/fr/login", search: "?lang=en", cookie: "fr" }),
    "/login?lang=en",
  );
  assert.equal(parentDeskPath("/fr/parent"), "/fr/parent");
  assert.equal(inboxListPath("/fr/inbox/thread"), "/fr/inbox");
  assert.equal(deskFromPathname("/fr/parent"), "parent");
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/fr/parent?tab=saved" }), "/fr/parent?tab=saved");
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/fr/inbox" }), "/fr/inbox");
  assert.equal(destinationAfterSignIn({ role: "provider", next: "/fr/parent" }), "/provider");
  assert.match(src("src/routes/fr.account.tsx"), /createFileRoute\("\/fr\/account"\)/);
  assert.match(src("src/routes/fr.menu.tsx"), /createFileRoute\("\/fr\/menu"\)/);
  assert.match(src("src/routes/fr.provider.tsx"), /createFileRoute\("\/fr\/provider"\)/);
  assert.match(src("src/routes/fr.support.tsx"), /createFileRoute\("\/fr\/support"\)/);
  assert.match(src("src/routes/fr.inbox.tsx"), /createFileRoute\("\/fr\/inbox"\)/);
  assert.match(src("src/routes/fr.inbox.$id.tsx"), /createFileRoute\("\/fr\/inbox\/\$id"\)/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath: '\/fr\/inbox\/\$id'/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath: '\/fr\/account'/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath: '\/fr\/menu'/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath: '\/fr\/provider'/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath: '\/fr\/support'/);
});

test("French sidebar strings are translated in every shipped locale", () => {
  for (const key of ["childrenLimit", "showTestListings", "childProfileSendLead"]) {
    assert.notEqual(tx("fr", key), tx("en", key));
    assert.doesNotMatch(tx("fr", key), /Up to 4 profiles|Show test listings|Save the child profile/);
    for (const code of ["zh", "yue", "pa", "es", "ar", "tl", "it", "de"]) {
      assert.notEqual(tx(code, key), "");
      assert.equal(typeof tx(code, key), "string");
    }
  }
  assert.match(tx("fr", "childrenLimit"), /profils/);
  assert.match(tx("fr", "showTestListings"), /essai/);
  assert.match(tx("fr", "childProfileSendLead"), /profil/);
  assert.notEqual(tx("fr", "accountUnconfirmedTitle"), tx("en", "accountUnconfirmedTitle"));
  assert.notEqual(tx("fr", "accountSaveFailed"), tx("en", "accountSaveFailed"));
  assert.notEqual(tx("fr", "contractsLoading"), tx("en", "contractsLoading"));
  assert.match(src("src/routes/provider.tsx"), /t\("addressLabel"\)/);
  assert.match(src("src/routes/provider.tsx"), /t\("showTestListings"\)/);
  assert.match(src("src/components/parent-desk.tsx"), /t\("childProfileSendLead"\)/);
  assert.match(src("src/lib/desk-nav.ts"), /hintKey: "childrenLimit"/);
  for (const [key, english] of [
    ["exploreForYou", "Home"],
    ["deskNavForYouHint", "Matches near you"],
    ["saved", "Saved"],
    ["deskNavShortlistOpenHint", "Calls, tours, and compare"],
    ["navRequestsShort", "Requests"],
    ["deskNavBookingsHint", "Tours, waitlist, and spots"],
    ["navWaitlists", "Waitlists"],
    ["deskNavWaitlistsHint", "Your spot requests"],
    ["messages", "Messages"],
    ["deskNavParentMessagesHint", "Centre threads + tours"],
    ["children", "Children"],
    ["childrenLimit", "Up to 4 profiles"],
    ["dailyCare", "Daily care"],
    ["dailyCareHint", "Presence, journal, meds, and rooms"],
    ["payments", "Pay"],
    ["deskNavPaymentsHint", "Bills from your centre"],
    ["search", "Search"],
    ["searchAlerts", "Search alerts"],
    ["deskNavAlertsHint", "Saved searches + notify"],
    ["profile", "Profile"],
    ["appearance", "Appearance"],
    ["deleteAccount", "Delete account"],
    ["notificationPrefs", "Notification preferences"],
    ["loginSecurity", "Login and security"],
    ["emailAndSms", "Email and SMS"],
  ]) {
    assert.notEqual(tx("fr", key), english, key);
    assert.notEqual(tx("fr", key), tx("en", key), key);
  }
});

test("parent sidebar items are URLs and plan copy stays off when plans are hidden", () => {
  const dest = sidebarDestinations("parent", { subscriptionsEnabled: false });
  assert.ok(dest.includes("/parent?tab=children"));
  assert.ok(dest.includes("/parent?tab=enrolled"));
  assert.ok(dest.includes("/parent?tab=saved"));
  assert.ok(dest.includes("/parent?tab=waitlists"));
  assert.equal(dest.some((href) => href.startsWith("id:")), false);
  const badge = src("src/components/listing-status-badge.tsx");
  assert.match(badge, /useStoreShell/);
  assert.match(badge, /surface === "money" && !showPlans/);
  assert.match(badge, /ledgerLiveParentBills/);
  assert.match(src("src/lib/use-native-shell.ts"), /shellBlocksCommerce\(channel\)/);
  assert.match(src("src/routes/pay.$bookingId.tsx"), /bookingPayLeadKey\(showPlans\)/);
  const footer = src("src/components/site-footer.tsx");
  assert.doesNotMatch(footer, /Coming soon/);
  assert.doesNotMatch(footer, /App Store/);
  assert.doesNotMatch(footer, /data-ke="store-coming-soon"/);
});

test("offline page is not served for 401 or Unauthorized", () => {
  const sw = src("public/sw.js");
  assert.match(sw, /kidease-shell-v8/);
  assert.match(sw, /navigator\.onLine === false/);
  assert.match(sw, /status === 401/);
  assert.match(sw, /Unauthorized/);
  assert.match(sw, /isNetworkFailure/);
  assert.match(sw, /instanceof TypeError/);
  const authAt = sw.indexOf("function isAuthFailure");
  const offlineAt = sw.indexOf('caches.match("/offline.html")');
  assert.ok(authAt > 0 && authAt < offlineAt);
  assert.match(sw, /caches\.delete\(key\)/);
  assert.doesNotMatch(sw, /signOut|document\.cookie|Clear-Site-Data/);
  assert.equal(stripLocalePrefix("/fr/parent/"), "/parent");
  assert.equal(stripLocalePrefix("/fr/parent//"), "/parent");
  assert.equal(stripLocalePrefix("/fr/inbox/"), "/inbox");
  assert.equal(sanitizePostLoginNext("/fr/parent"), "/fr/parent");
  assert.equal(sanitizePostLoginNext("/fr/parent/"), "/fr/parent");
  assert.equal(sanitizePostLoginNext("/fr/parent?tab=saved"), "/fr/parent?tab=saved");
  assert.equal(sanitizePostLoginNext("/fr/inbox/thread-1"), "/fr/inbox/thread-1");
  assert.equal(sanitizePostLoginNext("/fr/account"), "/fr/account");
  assert.equal(sanitizePostLoginNext("/fr/provider"), "/fr/provider");
  assert.equal(loginErrorCallbackUrl({ intent: "in", next: "/fr/parent", loginPath: "/fr/login" }), "/fr/login?intent=in&next=%2Ffr%2Fparent");
  assert.match(twoFactorPageUrl("/fr/parent"), /next=%2Ffr%2Fparent/);
  assert.match(src("src/components/parent-desk.tsx"), /target !== urlTab/);
  assert.doesNotMatch(src("src/routes/inbox.$id.tsx"), /strict:\s*false/);
  assert.match(src("src/routes/inbox.$id.tsx"), /Route\.useParams\(\)/);
  assert.match(src("src/routes/fr.inbox.$id.tsx"), /Route\.useParams\(\)/);
  assert.match(src("src/routes/inbox.$id.tsx"), /if \(!id\)/);
  assert.match(src("src/routeTree.gen.ts"), /interface Register/);
});
