import test from "node:test";
import assert from "node:assert/strict";
import { centreMissingInfo, missingInfoMessage } from "../src/lib/centre-missing-info.ts";

test("empty centre flags all seven fields with links", () => {
  const items = centreMissingInfo({ id: "mb-1" });
  assert.deepEqual(items.map((i) => i.field), ["license", "fees", "hours", "spots", "contact", "ages", "photos"]);
  for (const i of items) {
    assert.ok(i.href.desk);
    assert.ok(missingInfoMessage(i, "en").length > 20);
    assert.ok(missingInfoMessage(i, "fr").length > 20);
  }
  assert.match(missingInfoMessage(items[0], "en"), /licence photo/);
});

test("complete centre has nothing missing", () => {
  const items = centreMissingInfo({
    id: "mb-1", licenseNumber: "ABC12345", licensePhotoOnFile: true, licensedCapacity: 40,
    infantMonthly: 10, hours: "Mon–Fri 7:00–18:00", spotsUpdatedAt: "2026-10-01",
    phone: "204", contactEmail: "a@b.ca", website: "https://x.ca", agesKnown: true,
    photos: ["https://media.kidease.ca/photos/x.jpg"],
  });
  assert.deepEqual(items.map((i) => i.field), []);
});
