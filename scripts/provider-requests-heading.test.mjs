import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function requestsDesk() {
  const provider = src("src/routes/provider.tsx");
  const start = provider.indexOf('{desk === "requests" ? (');
  const end = provider.indexOf('{desk === "tours" ? (', start);
  assert.ok(start > 0 && end > start, "requests desk block");
  return provider.slice(start, end);
}

test("the Requests desk starts with its own Requests heading", () => {
  const desk = requestsDesk();
  const heading = desk.indexOf('<h1 className="font-display text-2xl" data-ke="provider-requests-title">{t("navRequests")}</h1>');
  const docs = desk.indexOf("<CentreFamilyDocs");
  const enquiries = desk.indexOf("<DaycareLeadInbox");
  const empty = desk.indexOf('t("enquiriesEmptyTitle")');
  assert.ok(heading > 0, "heading present");
  assert.ok(heading < docs, "heading before family documents");
  assert.ok(heading < enquiries && heading < empty, "heading before enquiries");
  // Family documents come after the enquiries, never first.
  assert.ok(docs > enquiries && docs > empty, "family documents after enquiries");
  assert.equal((desk.match(/<CentreFamilyDocs/g) || []).length, 1);
  assert.match(desk, /canWrite \? <CentreFamilyDocs hideWhenEmpty \/> : null/);
});

test("Requests heading is Requests / Demandes", () => {
  assert.match(src("src/lib/copy-en.ts"), /navRequests: "Requests",/);
  assert.match(src("src/lib/copy-fr.ts"), /navRequests: "Demandes",/);
});

test("family documents hide when there are none on the Requests desk", () => {
  const vault = src("src/components/family-vault.tsx");
  assert.match(vault, /export function CentreFamilyDocs\(\{ hideWhenEmpty = false \}/);
  assert.match(vault, /if \(hideWhenEmpty && documents\.length === 0\) return null;/);
});
