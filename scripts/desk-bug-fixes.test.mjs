import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { centrePickerLabel } from "../src/lib/centre-label.ts";
import { dedupeCentreTeam } from "../src/lib/centre-team.ts";
import { decodeBasicEntities } from "../src/lib/text-entities.ts";
import { buildContentSecurityPolicy } from "./csp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("centre pickers never show an internal d_ id", () => {
  assert.equal(centrePickerLabel("River Park", "Toronto", "d_abc"), "River Park");
  assert.equal(centrePickerLabel("d_abc123", "Toronto", "d_abc123"), "Toronto");
  assert.equal(centrePickerLabel("", null, "d_abc123"), "Centre");
  assert.equal(centrePickerLabel("d_abc123", "", "d_abc123"), "Centre");
});

test("employee rows collapse to one owner per centre and email", () => {
  const rows = dedupeCentreTeam([
    { id: "1", kind: "member", daycareId: "d_1", email: "A@Centre.ca", role: "staff" },
    { id: "2", kind: "member", daycareId: "d_1", email: "a@centre.ca", role: "owner" },
    { id: "3", kind: "invite", daycareId: "d_1", email: "a@centre.ca", role: "staff" },
    { id: "4", kind: "member", daycareId: "d_2", email: "a@centre.ca", role: "staff" },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["2", "4"],
  );
});

test("winnipeg names decode amp entities", () => {
  assert.equal(decodeBasicEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeBasicEntities("A &amp;amp; B"), "A & B");
});

test("maps stylesheets are allowed without unsafe-inline on style-src", () => {
  const csp = buildContentSecurityPolicy("abc+123/XYZ=");
  assert.match(csp, /style-src 'self' 'nonce-abc\+123\/XYZ=' https:\/\/maps\.googleapis\.com https:\/\/maps\.gstatic\.com/);
  assert.doesNotMatch(csp, /(?:^|; )style-src [^;]*'unsafe-inline'/);
});

test("desk pages name themselves and subscription is not the pay tab", () => {
  assert.match(src("src/routes/parent.tsx"), /Parent home · KidEase/);
  assert.match(src("src/routes/provider.tsx"), /Daycare desk · KidEase/);
  assert.match(src("src/routes/inbox.tsx"), /Family messages · KidEase/);
  assert.match(src("src/routes/account.tsx"), /Admin account · KidEase/);
  assert.match(src("src/lib/desk-nav.ts"), /search: \{ tab: "subscription" \}/);
  assert.doesNotMatch(src("src/routes/provider.tsx"), /city: "Winnipeg"/);
  assert.doesNotMatch(src("src/routes/provider.tsx"), /infantMonthly: 1200/);
  assert.match(src("src/components/parent-shortlist.tsx"), /t\("saved"\)/);
  assert.doesNotMatch(src("src/components/admin-mail.tsx"), /TITAN_APP_PASSWORD/);
  assert.match(src("src/routes/index.tsx"), /ke-home w-full/);
  assert.doesNotMatch(src("src/routes/index.tsx"), /ke-defer-paint/);
});
