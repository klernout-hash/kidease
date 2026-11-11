import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

function src(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("an approved booking is enrolled on both desks", () => {
  const en = src("src/lib/copy-en.ts");
  assert.match(en, /statusAccepted: "Enrolled"/);
  assert.match(en, /statusOffered: "Enrolled"/);
  assert.match(src("src/components/parent-desk.tsx"), /monthlyAmount > 0/);
  assert.match(src("src/components/daily-care-desk.tsx"), /data-ke="care-enrolment"/);
  assert.match(src("src/components/status-badge.tsx"), /data-ke="booking-state"/);
});

test("inclusive diet stays in the search URL and the page query", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /diet\?: string/);
  assert.match(search, /careKeysParam\(parseCareKeys\(s\.diet\)\)/);
  assert.match(search, /function writeDiet/);
  assert.match(src("src/lib/server/daycares.ts"), /inclusiveFiltersEnabled\(\)/);
  assert.match(src("src/lib/search-cache.ts"), /input\.diet/);
});

test("admin daycares list can download a CSV when the flag is on", () => {
  const page = src("src/components/admin-desk-page.tsx");
  assert.match(page, /data-ke="admin-list-csv"/);
  assert.match(page, /listCsvOn/);
  assert.match(src("src/lib/server/desk-features.ts"), /listCsv: listCsvEnabled\(\)/);
});

test("held mail previews sit on the daycare desks and do not send", () => {
  const preview = src("src/components/phase0-mail-preview.tsx");
  assert.match(preview, /data-ke="tour-followup-preview"/);
  assert.match(preview, /data-ke="form-share-preview"/);
  assert.match(preview, /data-ke="family-email-preview"/);
  assert.doesNotMatch(preview, /deliverQaEmail|sendTransactionalMail|fetch\(/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /<FamilyEmailPreview/);
  assert.match(provider, /<FormSharePreview/);
  assert.match(provider, /<TourFollowupPreview/);
});
