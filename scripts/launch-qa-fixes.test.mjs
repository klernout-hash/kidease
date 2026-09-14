import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { listingAgeRangeText, listingAgesConfirmed } from "../src/lib/listing-ages.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("B-02 guest contact retries send without reminting Turnstile first", () => {
  const contact = src("src/routes/contact.tsx");
  assert.match(contact, /const challenge = token\.trim\(\)/);
  assert.match(contact, /await submitPublicMessage\(\{ data: payload \}\)/);
  assert.match(contact, /catch \{\s*await submitPublicMessage\(\{ data: payload \}\)/);
  assert.doesNotMatch(contact.slice(contact.indexOf("async function send"), contact.indexOf("return (")), /takeChallenge/);
});

test("H-01 request info keeps success and error on the sheet", () => {
  const sheet = src("src/components/request-info.tsx");
  assert.match(sheet, /data-ke="request-info-success"/);
  assert.match(sheet, /data-ke="request-info-error"/);
  assert.match(sheet, /setDone\(true\)/);
  assert.match(sheet, /setFormError/);
  assert.doesNotMatch(sheet, /\[open, onClose, user\]/);
});

test("H-02 compare bar hides while listing request sheets are open", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /<CompareBar hidden=\{infoOpen \|\| requestOpen \|\| tourOpen\} \/>/);
  assert.match(src("src/components/compare-bar.tsx"), /if \(hidden \|\| !ids\.length\) return null/);
});

test("H-05 child profile save is visible, not toast-only", () => {
  const form = src("src/components/child-profile-form.tsx");
  assert.match(form, /data-ke="child-saved"/);
  assert.match(form, /role="status"/);
  assert.match(form, /setSaved\(true\)/);
});

test("parent can delete an owned child profile after confirm", () => {
  const family = src("src/lib/server/family.ts");
  const desk = src("src/components/parent-desk.tsx");
  const form = src("src/components/child-profile-form.tsx");
  const control = src("src/components/delete-child-control.tsx");
  const copy = src("src/lib/copy.ts");
  const deleteFn = family.slice(family.indexOf("export const deleteChild"), family.indexOf("export const toggleSave"));
  assert.match(deleteFn, /authMiddleware/);
  assert.match(deleteFn, /user_id = \$\{context\.userId\}/);
  assert.match(deleteFn, /delete from children/);
  assert.doesNotMatch(deleteFn, /callerIsAdmin/);
  assert.match(control, /data-ke="delete-child"/);
  assert.match(control, /data-ke="delete-child-dialog"/);
  assert.match(control, /data-ke="delete-child-confirm"/);
  assert.match(control, /role="dialog"/);
  assert.match(desk, /DeleteChildControl/);
  assert.match(form, /DeleteChildControl/);
  assert.match(copy, /deleteChildTitle: "Delete this child profile\?"/);
  assert.match(copy, /Supprimer ce profil d’enfant\?/);
});

test("M-01 public ages require confirmed min/max and never invent 12–60", () => {
  assert.equal(listingAgesConfirmed({ agesKnown: false, ageMinMonths: 12, ageMaxMonths: 60 }), false);
  assert.equal(listingAgeRangeText({ agesKnown: false, ageMinMonths: 12, ageMaxMonths: 60 }), "");
  assert.equal(listingAgeRangeText({ agesKnown: true, ageMinMonths: 12, ageMaxMonths: 12 }), "");
  assert.equal(listingAgeRangeText({ agesKnown: true, ageMinMonths: 6, ageMaxMonths: 72 }), "6 m – 72 m");
  assert.equal(listingAgeRangeText({ agesKnown: true, ageMinMonths: 6, ageMaxMonths: 72 }, "months"), "6–72 months");
  assert.match(src("src/components/daycare-card.tsx"), /listingAgeRangeText\(item, "months"\)/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /listingAgeRangeText\(d\)/);
  assert.match(src("src/lib/listing-seo.ts"), /listingAgesConfirmed/);
});

test("M-03 home does not mount CompareBar", () => {
  const home = src("src/routes/index.tsx");
  assert.doesNotMatch(home, /CompareBar/);
  assert.doesNotMatch(home, /compare-bar/);
});

test("M-06 settled user keeps last session while refetch is pending", () => {
  const hook = src("src/lib/auth/use-current-user.ts");
  assert.match(hook, /lastUser/);
  assert.match(hook, /if \(mapped\) return \{ user: mapped, isPending: false \}/);
  assert.match(hook, /user: lastUser, isPending: !lastUser/);
});

test("B-03 employee invite is saved even when mail fails", () => {
  const members = src("src/lib/server/centre-members.ts");
  assert.match(members, /trySendEmployeeInviteEmail/);
  assert.match(members, /mailed/);
  assert.match(src("src/lib/server/invite-mail.ts"), /export async function trySendEmployeeInviteEmail/);
  assert.match(src("src/components/centre-employees.tsx"), /employeeInviteSaved/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /employeeInviteSaved:/);
});

test("C-01 Today All set is suppressed when Action required exists", () => {
  const home = src("src/components/today-urgency-home.tsx");
  assert.match(home, /collectActionRequired/);
  assert.match(home, /actionRequired \? null : todayEmptyTruth/);
});
