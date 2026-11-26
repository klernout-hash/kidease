import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("org #37: the step-up dialog portals out of the page form and stops its submit there", () => {
  const dialog = src("src/components/reauth-dialog.tsx");
  assert.match(dialog, /import \{ createPortal \} from "react-dom";/);
  assert.match(dialog, /createPortal\(body, document\.body\)/);
  const stops = dialog.match(/e\.preventDefault\(\);\s+(\/\/[^\n]*\n\s+)*e\.stopPropagation\(\);/g) || [];
  assert.equal(stops.length, 2, "password and code submits both stop propagation");
  // The child form still renders the dialog and retries the save after confirm.
  assert.match(src("src/components/child-profile-form.tsx"), /\{reauth\.dialog\}/);
  assert.match(dialog, /const ok = await prompt\(\);\s+if \(!ok\) throw new Error\(REAUTH_REQUIRED_MESSAGE\);\s+return action\(\);/);
});

test("org #38: the care desk opens on the centre with enrolled children, not an arbitrary first listing", async () => {
  const { pickCareCentre } = await import("../src/lib/gap-features.ts");
  const ids = ["other", "qa"];
  const bookings = [
    { daycareId: "other", status: "requested" },
    { daycareId: "qa", status: "accepted" },
  ];
  assert.equal(pickCareCentre(ids, undefined, bookings), "qa");
  assert.equal(pickCareCentre(ids, "other", bookings), "other", "URL pick wins");
  assert.equal(pickCareCentre(ids, "nope", bookings), "qa", "unknown pick is ignored");
  assert.equal(pickCareCentre(ids, undefined, []), "other");
  assert.equal(pickCareCentre([], undefined, bookings), undefined);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /<ProviderCareDesk daycareId=\{pickCareCentre\(listings\.map\(\(row\) => row\.id\), search\.centre, requests\)\}/);
  assert.doesNotMatch(provider, /<ProviderCareDesk daycareId=\{listings\[0\]/);
});

test("org #39: the Today centre picker drives the URL and the remembered centre, like Work in this centre", () => {
  const home = src("src/components/host-today-home.tsx");
  assert.match(home, /onCentre\?\.\(event\.target\.value\)/);
  assert.match(home, /useState\(centreFromUrl \|\| listings\[0\]\?\.id \|\| ""\)/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /centreFromUrl=\{search\.centre\}\s+onCentre=\{\(id\) => \{[\s\S]{0,200}setOrgCentre\(\{ data: \{ daycareId: id \} \}\)[\s\S]{0,120}desk: "today", centre: id/);
});

test("org #40: /fr/parent/subsidy opens the subsidy page in French, not parent home", async () => {
  const { frParentAliasHref } = await import("../src/lib/locale-search.ts");
  assert.equal(frParentAliasHref("/fr/parent/subsidy"), "/parent/subsidy?lang=fr");
  assert.equal(frParentAliasHref("/fr/parent/subsidy/", "?centre=a"), "/parent/subsidy?centre=a&lang=fr");
  assert.equal(frParentAliasHref("/fr/parent/daily-feed"), null, "has its own FR route");
  assert.equal(frParentAliasHref("/fr/parent"), null);
  assert.equal(frParentAliasHref("/fr/parent/../admin"), null);
  assert.match(src("src/routes/parent.tsx"), /const frAlias = frParentAliasHref\(location\.pathname, location\.searchStr\);\s+if \(frAlias\) throw redirect/);
});

test("org #41: the profile page has a name and phone edit, and the photo pill says photo", () => {
  const account = src("src/routes/account.tsx");
  assert.match(account, /data-ke="profile-edit-details"/);
  assert.match(account, /"Edit name and phone"/);
  assert.match(account, /"Modifier le nom et le téléphone"/);
  assert.match(account, /photoLabel=\{locale === "fr" \? "Changer la photo" : "Change photo"\}/);
  assert.match(src("src/components/profile-hero.tsx"), /\{photoLabel \?\? t\("profileEdit"\)\}/);
});
