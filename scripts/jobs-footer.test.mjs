import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("jobs pages are honest Canada waitlists, not a fake board", () => {
  const jobs = src("src/routes/jobs.tsx");
  const post = src("src/routes/jobs_.post.tsx");
  const form = src("src/components/jobs-interest-form.tsx");
  assert.match(jobs, /createFileRoute\("\/jobs"\)/);
  assert.match(post, /createFileRoute\("\/jobs\/post"\)/);
  assert.match(form, /submitPublicMessage/);
  assert.match(form, /kind: "contact"/);
  assert.doesNotMatch(jobs + post + form, /Open Road/i);
  assert.doesNotMatch(jobs + post, /ECE-24|hiring now|apply by friday/i);
  assert.match(src("src/lib/copy.ts"), /no invented job inventory/);
  assert.match(src("src/lib/copy.ts"), /n’invente aucun inventaire de postes/);
  assert.match(src("src/lib/copy.ts"), /findDaycareJobs: "Find daycare jobs"/);
  assert.match(src("src/lib/copy.ts"), /findDaycareJobs: "Trouver des emplois en garderie"/);
  assert.match(src("src/lib/copy.ts"), /addJobsAtKidEase: "Add jobs at KidEase"/);
  assert.match(src("src/lib/copy.ts"), /addJobsAtKidEase: "Afficher des postes sur KidEase"/);
});

test("jobs routes are locale-paired and listed in the sitemap sources", () => {
  const paired = src("src/lib/locale-path.ts");
  const sitemap = src("src/lib/sitemap.ts");
  assert.match(paired, /"\/jobs"/);
  assert.match(paired, /"\/jobs\/post"/);
  assert.match(sitemap, /"\/jobs"/);
  assert.match(sitemap, /"\/jobs\/post"/);
  assert.match(src("src/routeTree.gen.ts"), /id:\s*'\/jobs'/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath:\s*'\/jobs\/post'/);
  assert.match(src("src/routeTree.gen.ts"), /id:\s*'\/fr\/jobs'/);
  assert.match(src("src/routeTree.gen.ts"), /fullPath:\s*'\/fr\/jobs\/post'/);
});
