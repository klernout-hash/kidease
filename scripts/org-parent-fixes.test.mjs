import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("org #37: the step-up dialog portals out of the page form and stops its submit there", () => {
  const dialog = src("src/components/reauth-dialog.tsx");
  assert.match(dialog, /import \{ createPortal \} from "react-dom";/);
  assert.match(dialog, /createPortal\(body, document\.body\)/);
  const stops = dialog.match(/e\.preventDefault\(\);\s+(\/\/[^\n]*\n\s+)*e\.stopPropagation\(\);/g) || [];
  assert.equal(stops.length, 2, "password and code submits both stop propagation");
  // The child form still renders the dialog and retries the save after confirm.
  assert.match(src("src/components/child-profile-form.tsx"), /\{reauth\.dialog\}/);
  assert.match(dialog, /const ok = await prompt\(\);\s+if \(!ok\) throw new Error\(REAUTH_REQUIRED_MESSAGE\);\s+return action\(\);/);
});

test("org #38: the care desk opens on the centre with enrolled children, not an arbitrary first listing", async () => {
  const { pickCareCentre } = await import("../src/lib/gap-features.ts");
  const ids = ["other", "qa"];
  const bookings = [
    { daycareId: "other", status: "requested" },
    { daycareId: "qa", status: "accepted" },
  ];
  assert.equal(pickCareCentre(ids, undefined, bookings), "qa");
  assert.equal(pickCareCentre(ids, "other", bookings), "other", "URL pick wins");
  assert.equal(pickCareCentre(ids, "nope", bookings), "qa", "unknown pick is ignored");
  assert.equal(pickCareCentre(ids, undefined, []), "other");
  assert.equal(pickCareCentre([], undefined, bookings), undefined);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /<ProviderCareDesk daycareId=\{pickCareCentre\(listings\.map\(\(row\) => row\.id\), search\.centre, requests\)\}/);
  assert.doesNotMatch(provider, /<ProviderCareDesk daycareId=\{listings\[0\]/);
});
