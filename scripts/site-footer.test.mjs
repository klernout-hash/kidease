import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const footer = src("src/components/site-footer.tsx");
const css = src("src/styles.css");
const copy = src("src/lib/copy.ts");

test("footer exposes Rate KidEase next to Get the app in Parents", () => {
  const getApp = footer.match(/to="\/get-app"/g) ?? [];
  assert.ok(getApp.length >= 2, "Get the app + Rate KidEase both link to /get-app on www");
  assert.match(footer, /t\("rateKidEase"\)/);
  assert.match(footer, /rateKidEaseFromMenu/);
});

test("footer keeps Support / Parents / Daycares groups without a duplicate legal row", () => {
  assert.match(footer, /ke-footer-cols/);
  assert.match(footer, /t\("support"\)/);
  assert.match(footer, />Parents</);
  assert.match(footer, /Garderies/);
  assert.match(footer, /Daycares/);
  assert.doesNotMatch(footer, /aria-label=\{fr \? "Juridique" : "Legal"\}/);
  const privacyLinks = footer.match(/to="\/privacy"/g) ?? [];
  assert.equal(privacyLinks.length, 1, "privacy lives in Support only; verify-listings goes to /verify");
  assert.match(footer, /to="\/about"/);
  assert.match(footer, /to="\/verify"/);
  assert.match(footer, /verifyListings/);
});

test("footer legal bar stays compact and uses FR-CA copy keys", () => {
  assert.match(footer, /ke-footer-inner/);
  assert.match(footer, /t\("footerCopy"\)/);
  assert.match(footer, /t\("neverSell"\)/);
  assert.match(footer, /t\("appStore"\)/);
  assert.match(footer, /t\("googlePlay"\)/);
  assert.match(footer, /t\("comingSoon"\)/);
  assert.match(footer, /t\("operatorSignIn"\)/);
  assert.match(footer, /showOperatorSignIn/);
  assert.match(footer, /!isPending && !user/);
  assert.match(copy, /comingSoon: "Coming soon"/);
  assert.match(copy, /comingSoon: "Bientôt"/);
  assert.match(copy, /operatorSignIn: "Operator sign-in"/);
  assert.match(copy, /operatorSignIn: "Connexion opérateur"/);
});

test("Support column drops the inbox email and uses Contact Us copy", () => {
  assert.match(footer, /t\("helpTitle"\)/);
  assert.match(footer, /t\("contactTitle"\)/);
  assert.match(footer, /to="\/contact"/);
  assert.match(footer, />FAQ</);
  assert.match(footer, /t\("howItWorksCta"\)/);
  assert.match(footer, /t\("privacy"\)/);
  assert.match(footer, /t\("terms"\)/);
  assert.match(footer, /t\("cookies"\)/);
  assert.doesNotMatch(footer, /deleteAccount/);
  assert.doesNotMatch(footer, /SUPPORT_INBOX_EMAIL/);
  assert.doesNotMatch(footer, /mailto:/);
  assert.match(copy, /contactTitle: "Contact Us"/);
  assert.match(copy, /contactTitle: "Nous joindre"/);
});

test("Parents column keeps product links and omits city hubs", () => {
  const parents = footer.slice(footer.indexOf(">Parents<"), footer.indexOf("Garderies"));
  assert.match(parents, /to="\/search"/);
  assert.match(parents, /parentSignIn/);
  assert.match(parents, /to="\/parent"/);
  assert.match(parents, /benefitsTab/);
  assert.match(parents, /tourChecklist/);
  assert.match(parents, /compare/);
  assert.match(parents, /saved/);
  assert.match(parents, /getApp/);
  assert.match(parents, /rateKidEase/);
  assert.doesNotMatch(parents, /cityHubs/);
  assert.doesNotMatch(parents, /cityHubPath/);
  assert.doesNotMatch(parents, /daycare\/city/);
  assert.match(src("src/routes/index.tsx"), /CITY_HUB_DEFS\.map/);
  assert.match(src("public/sitemap.xml"), /\/daycare\/city\/winnipeg/);
});

test("footer CSS clusters columns instead of stretching full width", () => {
  assert.match(css, /\.ke-footer-inner \{[\s\S]*?max-width: 44rem;/);
  assert.match(css, /grid-template-columns: 1fr 1fr;/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /gap: 3rem 4rem/);
});
