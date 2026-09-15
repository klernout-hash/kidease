import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const copy = src("src/lib/copy.ts");
const menu = src("src/routes/menu.tsx");
const verify = src("src/routes/verify.tsx");
const req = src("src/routes/daycare-requirements.tsx");
const store = src("src/lib/store-listing.ts");
const mail = src("src/lib/signup-user-mail.ts");

test("product trust copy is Canada-wide outside Childcare Benefits", () => {
  assert.match(copy, /footerCopy: "KidEase is a Canada-wide project serving families across the country\."/);
  assert.match(copy, /footerCopy: "KidEase est un projet pancanadien, au service des familles partout au pays\."/);
  assert.doesNotMatch(copy, /Winnipeg-based, Canada-wide project/);
  assert.doesNotMatch(copy, /projet basé à Winnipeg, au service des familles partout au Canada/);
  assert.doesNotMatch(copy, /Manitoba first/);
  assert.doesNotMatch(copy, /Le Manitoba d’abord/);
  assert.doesNotMatch(copy, /In Manitoba this is Facility Type/);
  assert.doesNotMatch(copy, /Au Manitoba, c’est le type d’établissement/);
  assert.match(copy, /loginLead: "Save licensed centres across Canada/);
  assert.match(copy, /loginLead: "Enregistrez des centres permis partout au Canada/);
  assert.match(copy, /reqMbTitle: "What varies by province"/);
  assert.match(copy, /mbChildcare: "Official provincial registries"/);
});

test("benefits still carry the Manitoba subsidy section", () => {
  assert.match(copy, /benefitsMbT: "Manitoba"/);
  assert.match(copy, /Apply on the Manitoba Child Care Subsidy page/);
  assert.match(copy, /page manitobaine de subvention/);
});

test("menu, verify, requirements, store, and onboard mail drop MB-only framing", () => {
  assert.doesNotMatch(menu, /childcaresearch\.gov\.mb\.ca/);
  assert.match(menu, /to="\/verify"/);
  assert.doesNotMatch(verify, /Manitoba catalogue matches/);
  assert.doesNotMatch(req, /Manitoba Child Abuse Registry documents/);
  assert.doesNotMatch(store, /Manitoba \$10-a-day funded spaces/);
  assert.doesNotMatch(store, /places financées 10 \$ par jour au Manitoba/);
  assert.match(mail, /does not run police checks/);
  assert.match(mail, /Your province may also require extra registry checks/);
  assert.doesNotMatch(mail, /In Manitoba, also upload/);
});
