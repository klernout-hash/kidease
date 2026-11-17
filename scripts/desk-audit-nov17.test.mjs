import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("message filters stay on one scrollable row with nonshrinking targets", () => {
 const page = src("src/components/inbox-list.tsx");
 assert.match(page, /flex-nowrap[^"\n]*overflow-x-auto/);
 assert.match(page, /min-h-11 shrink-0 whitespace-nowrap/);
});
test("additional provider panels load only when rendered", () => {
 const page = src("src/routes/provider.tsx");
 for (const name of ["EceJobDesk", "AgeOpenSpotsDesk", "SpotOfferDesk", "CentreFamilyDocs", "CentrePipeline"]) {
  assert.ok(page.includes(`const ${name} = lazy(`), name);
 }
 assert.match(page, /<Suspense fallback=/);
});
