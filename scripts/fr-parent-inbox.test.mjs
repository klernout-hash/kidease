import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { tx } from "../src/lib/copy.ts";
import { deskFromPathname } from "../src/lib/desks.ts";
import { inboxListPath, parentDeskPath, sidebarDestinations } from "../src/lib/desk-nav.ts";
import { localeRedirectTarget } from "../src/lib/locale-geo.ts";
import { isFrenchDeskPath, localePath, localeSwitchPath } from "../src/lib/locale-path.ts";
import { destinationAfterSignIn } from "../src/lib/role-access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const document = { method: "GET", accept: "text/html", secFetchDest: "document" };

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("French parent and inbox URLs stay French", () => {
  assert.equal(isFrenchDeskPath("/fr/parent"), true);
  assert.equal(isFrenchDeskPath("/fr/inbox/abc"), true);
  assert.equal(localePath("/parent", "fr"), "/fr/parent");
  assert.equal(localePath("/inbox", "fr"), "/fr/inbox");
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
  assert.match(src("src/routes/fr.inbox.tsx"), /createFileRoute\("\/fr\/inbox"\)/);
  assert.match(src("src/routes/fr.inbox.$id.tsx"), /createFileRoute\("\/fr\/inbox\/\$id"\)/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath: '\/fr\/inbox\/\$id'/);
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
});

test("parent sidebar items are URLs and plan copy stays off when plans are hidden", () => {
  const dest = sidebarDestinations("parent", { subscriptionsEnabled: false });
  assert.ok(dest.includes("/parent?tab=children"));
  assert.ok(dest.includes("/parent?tab=enrolled"));
  assert.ok(dest.includes("/parent?tab=saved"));
  assert.ok(dest.includes("/parent?tab=waitlists"));
  assert.equal(dest.some((href) => href.startsWith("id:")), false);
  const badge = src("src/components/listing-status-badge.tsx");
  assert.match(badge, /useInNativeShell/);
  assert.match(badge, /ledgerLiveParentBills/);
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
});
