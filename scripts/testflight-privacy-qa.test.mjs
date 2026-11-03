import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildTaxReceiptGroups, federalReceiptLines } from "../src/lib/tax-receipts.ts";
import { openInMapsHref } from "../src/lib/open-in-maps.ts";
import { orderSocialSignIn } from "../src/lib/auth/providers.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("tax receipt prints family, centre, amount, and period from paid bills", () => {
  const plain = buildTaxReceiptGroups({
    invoices: [
      {
        id: "inv-harbour",
        status: "paid",
        amountCents: 120000,
        paidAt: "2026-12-31",
        period: "2026",
        daycareId: "d1",
        daycareName: "Harbour Centre",
        province: "ON",
        parentUserId: "p1",
        parentName: "Nguyen family",
      },
    ],
  });
  const text = federalReceiptLines(plain.groups[0]).join("\n");
  assert.match(text, /Receipt for: Nguyen family/);
  assert.match(text, /Centre: Harbour Centre/);
  assert.match(text, /Amount:/);
  assert.match(text, /Period: 2026-01-01 to 2026-12-31/);
  assert.match(text, /KidEase reference:/);
  assert.doesNotMatch(text, /Child:/);
  const withChild = federalReceiptLines(
    buildTaxReceiptGroups({
      invoices: [
        {
          id: "inv-harbour-child",
          status: "paid",
          amountCents: 120000,
          paidAt: "2026-12-31",
          period: "2026",
          daycareId: "d1",
          daycareName: "Harbour Centre",
          province: "ON",
          childId: "c1",
          childName: "Amina",
          parentUserId: "p1",
          parentName: "Nguyen family",
        },
      ],
    }).groups[0],
  ).join("\n");
  assert.match(withChild, /Receipt for: Nguyen family/);
  assert.match(withChild, /Child: Amina/);
  const copy = src("src/lib/flagged-feature-copy.ts");
  assert.match(copy, /Receipt for/);
  assert.match(copy, /Reçu pour/);
  assert.match(copy, /taxChild: "Child"/);
  assert.match(copy, /taxChild: "Enfant"/);
  assert.doesNotMatch(src("src/components/tax-receipt-studio.tsx"), /amountPaid|Amount paid/);
});

test("map fallback stays provider-agnostic and opens the device maps app", () => {
  const ios = openInMapsHref({
    platform: "ios",
    native: true,
    address: "1 Main St, Winnipeg",
    lat: 49.8,
    lng: -97.1,
  });
  assert.match(ios, /^maps:\/\//);
  assert.doesNotMatch(ios, /google/i);
  const web = openInMapsHref({ platform: "ios", address: "1 Main St", lat: 49.8, lng: -97.1 });
  assert.match(web, /^https:\/\/maps\.apple\.com\//);
  const android = openInMapsHref({ platform: "android", address: "1 Main St", lat: 49.8, lng: -97.1 });
  assert.match(android, /^geo:/);
  const listing = src("src/components/listing-map.tsx");
  const search = src("src/components/map-view.tsx");
  assert.match(listing, /MapUnavailable/);
  assert.match(search, /MapUnavailable/);
  assert.doesNotMatch(search, /Google Maps timed out/);
  assert.match(src("src/components/map-unavailable.tsx"), /Map unavailable/);
  assert.match(src("src/components/map-unavailable.tsx"), /Open in Maps/);
  assert.doesNotMatch(src("src/routes/daycare.\$slug.tsx"), /google\.com\/maps/);
});

test("privacy, terms, and cookies match data minimization and name Kyle", () => {
  const legal = src("src/lib/legal-copy.ts");
  assert.match(legal, /Effective 29 October 2026/);
  assert.match(legal, /En vigueur le 29 octobre 2026/);
  assert.match(legal, /PIPEDA/);
  assert.match(legal, /Quebec Law 25/);
  assert.match(legal, /Loi 25/);
  assert.match(legal, /privacyOfficerLine/);
  assert.match(legal, /Child profile, only if you add one/);
  assert.match(legal, /Profil d’enfant, seulement si vous l’ajoutez/);
  assert.match(legal, /explicitly share/);
  assert.doesNotMatch(legal, /We do not ask for a child’s name, birthdate, or health information/);
  const privacy = legal.slice(0, legal.indexOf("export const TERMS_EN"));
  assert.match(privacy, /Kyle Lernout|privacyOfficerLine/);
  assert.match(privacy, /privacy@kidease\.ca|PRIVACY_CONTACT_EMAIL/);
});

test("delete account warns, confirms, signs out, and revokes Apple", () => {
  const panel = src("src/components/delete-account-panel.tsx");
  assert.match(panel, /data-ke="delete-account-warning"/);
  assert.match(panel, /deleteAccountWarn/);
  assert.match(panel, /DELETE_CONFIRM_PHRASE/);
  assert.match(panel, /signOut\("\/"\)/);
  assert.match(src("src/lib/server/family.ts"), /revokeStoredAppleSignIn\(uid\)/);
  const warn = src("src/lib/copy.ts");
  assert.match(warn, /deleteAccountWarn: "This closes your KidEase account/);
  assert.match(warn, /nous révoquons cette connexion/);
});

test("social buttons stay Apple, Google, Facebook on login and sign-up", () => {
  const ordered = orderSocialSignIn([
    { idp: "facebook" },
    { idp: "google" },
    { idp: "apple" },
  ]);
  assert.deepEqual(
    ordered.map((row) => row.idp),
    ["apple", "google", "facebook"],
  );
  assert.match(src("src/routes/login.tsx"), /SocialSignInButtons/);
  assert.match(src("src/components/parent-signup-form.tsx"), /SocialSignInButtons/);
});
