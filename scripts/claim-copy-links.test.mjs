import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const TITAN =
  "https://support.titan.email/hc/en-us/articles/360038535773-Titan-Privacy-Policy";
const CANADA =
  "https://www.canada.ca/en/early-learning-child-care-agreement/agreements-provinces-territories.html";

test("privacy and start-a-daycare point at live official pages", () => {
  const legal = src("src/lib/legal-copy.ts");
  assert.equal(legal.split(TITAN).length - 1, 2);
  assert.doesNotMatch(legal, /titan\.email\/privacy/);
  const registry = src("src/lib/province-registry.ts");
  assert.match(registry, new RegExp(CANADA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(registry, /early-learning-child-care\.html/);
  assert.match(src("src/routes/start-a-daycare.tsx"), /canadaFallbackUrl\(\)/);
});

test("claim perk describes managing a listing without prelaunch promises", () => {
  const copy = (src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts"));
  const en = "Manage your listing on your phone or computer.";
  const fr = "Gérez votre fiche sur votre téléphone ou votre ordinateur.";
  assert.match(copy, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(copy, new RegExp(fr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(copy, /Everything managed from a mobile app/);
  assert.doesNotMatch(copy, /Tout se gère depuis/);
  for (const line of [en, fr]) {
    assert.doesNotMatch(line, /—/);
    assert.doesNotMatch(line, /free forever/i);
    assert.doesNotMatch(line, /Winnipeg-based/i);
  }
  for (const code of ["zh", "yue", "pa", "es", "ar", "tl", "it", "de"]) {
    const pack = JSON.parse(src(`src/lib/i18n/${code}.json`));
    assert.match(pack.perkMobile, /\S/);
    assert.doesNotMatch(pack.perkMobile, /coming soon|bientôt|即将推出|即將推出|ਜਲਦੀ ਆਉਣਗੀਆਂ|llegan pronto|قادمة قريب|Malapit na|arriveranno presto|kommen bald/i);
  }
});
