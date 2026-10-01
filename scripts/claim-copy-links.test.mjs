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

test("claim perk says the phone apps are coming soon", () => {
  const copy = src("src/lib/copy.ts");
  const en = "Phone apps are coming soon. Manage your listing on the website for now.";
  const fr = "Les applications pour téléphone arrivent bientôt. Gérez votre fiche sur le site pour le moment.";
  assert.match(copy, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(copy, new RegExp(fr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(copy, /Everything managed from a mobile app/);
  assert.doesNotMatch(copy, /Tout se gère depuis/);
  for (const line of [en, fr]) {
    assert.doesNotMatch(line, /—/);
    assert.doesNotMatch(line, /free forever/i);
    assert.doesNotMatch(line, /Winnipeg-based/i);
  }
  const packs = {
    zh: "手机应用即将推出。请先在网站上管理您的名录。",
    yue: "手機應用程式即將推出。而家請喺網站管理你嘅刊登。",
    pa: "ਫ਼ੋਨ ਐਪਾਂ ਜਲਦੀ ਆਉਣਗੀਆਂ। ਹੁਣ ਲਈ ਆਪਣੀ ਲਿਸਟਿੰਗ ਵੈੱਬਸਾਈਟ ਉੱਤੇ ਸੰਭਾਲੋ।",
    es: "Las apps de teléfono llegan pronto. Por ahora, administra tu ficha en el sitio web.",
    ar: "تطبيقات الهاتف قادمة قريبًا. أدر إعلانك على الموقع الآن.",
    tl: "Malapit na ang mga phone app. Pamahalaan muna ang listing sa website.",
    it: "Le app per telefono arriveranno presto. Per ora gestisci la scheda sul sito.",
    de: "Die Telefon-Apps kommen bald. Verwalte dein Inserat vorerst auf der Website.",
  };
  for (const [code, line] of Object.entries(packs)) {
    const pack = JSON.parse(src(`src/lib/i18n/${code}.json`));
    assert.equal(pack.perkMobile, line);
    assert.doesNotMatch(line, /—/);
  }
});
