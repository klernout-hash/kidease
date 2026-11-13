import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GOV_SITEMAP_PATHS } from "../src/lib/gov/access.ts";
import { sitemapPublicPaths } from "../src/lib/sitemap.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public browsing has no government offering banner and keeps only the sign-in footer link", () => {
  const shell = read("src/components/shell.tsx");
  const footer = read("src/components/site-footer.tsx");
  assert.doesNotMatch(shell, /gov-public-browse|Return to the government desk|Public licensed listings, all of Canada/);
  assert.doesNotMatch(footer, /For governments|Pour les gouvernements/);
  assert.match(footer, /"\/fr\/gov\/login"\s*:\s*"\/gov\/login"/);
  assert.match(footer, /Connexion gouvernement/);
  assert.match(footer, /Government sign-in/);
});

test("government terms use the desk authorization and private response rules", () => {
  const terms = read("src/routes/gov-terms.tsx");
  assert.match(terms, /beforeLoad:[\s\S]*await guardGovDesk/);
  assert.match(terms, /if \(access\.nativeOnly\) throw notFound\(\)/);
  assert.match(terms, /head: \(\) => govRobotsHead/);
  assert.match(terms, /headers: govRobotsHeaders/);
  assert.doesNotMatch(terms, /pageSeoHead/);
  const publicPaths = sitemapPublicPaths();
  assert.ok(GOV_SITEMAP_PATHS.includes("/gov-terms"));
  for (const path of GOV_SITEMAP_PATHS) assert.ok(!publicPaths.includes(path), path);
});
