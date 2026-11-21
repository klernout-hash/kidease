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

test("discovery links do not eagerly import their desk panels", () => {
  const provider = src("src/routes/provider.tsx");
  for (const [name, file] of [["LearningStoriesDesk", "learning-stories-desk"], ["CurriculumPackDesk", "curriculum-pack"], ["OrgOccupancyDesk", "org-occupancy-desk"]]) {
    assert.ok(provider.includes(`const ${name} = lazy(`));
    const link = src(`src/components/${file}-link.tsx`);
    assert.ok(!link.includes(`@/components/${file}"`));
    assert.match(link, /min-h-11/);
  }
});

test("Registries overview uses plain EN and FR and does not promise a live check", () => {
  const trust = src("src/components/admin-trust.tsx");
  assert.match(trust, /This is not a live registry check/);
  assert.match(trust, /Ce n’est pas une vérification en direct/);
  assert.doesNotMatch(trust, /adapter stubs|fail closed|pretend a scrape/);
});
