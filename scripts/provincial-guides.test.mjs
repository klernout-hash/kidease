import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { START_DAYCARE_PTS } from "../src/lib/start-daycare-hub.ts";
import { provincialGuideCopy } from "../src/lib/provincial-guide-copy.ts";
import {
  CANADA_WIDE_CHILD_CARE_URL,
  PROVINCIAL_GUIDE_CODES,
  provincialGuideByCode,
  provincialGuidePaths,
} from "../src/lib/provincial-guides.ts";
import { LOCALE_PAIRED_PATHS } from "../src/lib/locale-path.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("provincial guides cite official pages and add no new fee figures", () => {
  assert.equal(PROVINCIAL_GUIDE_CODES.length, 13);
  assert.equal(provincialGuideByCode("mb")?.code, "MB");
  assert.equal(provincialGuideByCode("nope"), null);
  assert.equal(CANADA_WIDE_CHILD_CARE_URL.startsWith("https://www.canada.ca/"), true);
  for (const pt of START_DAYCARE_PTS) {
    assert.equal(pt.licensingUrl.startsWith("https://"), true);
    assert.equal(pt.fundingUrl.startsWith("https://"), true);
    assert.ok(SITEMAP_STATIC_PATHS.includes(`/guides/${pt.code.toLowerCase()}`));
    assert.ok(LOCALE_PAIRED_PATHS.includes(`/guides/${pt.code.toLowerCase()}`));
  }
  const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
  for (const path of provincialGuidePaths()) {
    assert.match(sitemap, new RegExp(`<loc>https://www\\.kidease\\.ca${path}</loc>`));
    assert.match(sitemap, new RegExp(`<loc>https://www\\.kidease\\.ca/fr${path}</loc>`));
  }
  const copy = provincialGuideCopy("en");
  const fr = provincialGuideCopy("fr");
  const blob = `${copy.feesBody} ${copy.waitlistBody} ${fr.waitlistBody} ${fr.feesBody}`;
  assert.doesNotMatch(blob, /—|free forever|Winnipeg-based|\$\d/);
  assert.match(copy.waitlistBody, /does not charge a waitlist fee/);
  assert.match(readFileSync(join(root, "src/routes/guides.$code.tsx"), "utf8"), /CANADA_WIDE_CHILD_CARE_URL/);
  assert.match(readFileSync(join(root, "src/routes/guides.$code.tsx"), "utf8"), /localePath\("\/claim"/);
  const index = readFileSync(join(root, "src/routes/guides.tsx"), "utf8");
  const frIndex = readFileSync(join(root, "src/routes/fr.guides.tsx"), "utf8");
  assert.match(index, /stripLocalePrefix\(pathname\)/);
  assert.match(index, /bare\.startsWith\("\/guides\/"\)/);
  assert.match(index, /return <Outlet \/>/);
  assert.match(frIndex, /GuidesIndex/);
  assert.match(frIndex, /path: "\/fr\/guides"/);
});
