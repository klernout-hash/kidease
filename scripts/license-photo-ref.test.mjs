import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { overlayStoredLicensePhotos } from "../src/lib/server/license-photo-ref.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("a stored claim or enroll file fills an empty daycare licence photo", async () => {
  const queries = [];
  const sql = {
    query: async (text, params) => {
      queries.push({ text, params });
      assert.match(text, /btrim\(license_photo\) <> ''/);
      assert.match(text, /distinct on \(daycare_id\)/);
      if (text.includes("from listing_claims")) {
        assert.deepEqual(params[0], ["ab-kh2t", "ab-enroll", "ab-none"]);
        return [{ daycare_id: "ab-kh2t", license_photo: "licenses/ab-kh2t/licence.pdf" }];
      }
      if (text.includes("from license_uploads")) {
        assert.deepEqual(params[0], ["ab-enroll", "ab-none"]);
        return [{ daycare_id: "ab-enroll", license_photo: "licenses/ab-enroll/enrol.pdf" }];
      }
      throw new Error(text);
    },
  };
  const rows = await overlayStoredLicensePhotos(sql, [
    { daycare_id: "ab-kh2t", license_photo: null, license_number: "70051797" },
    { daycare_id: "ab-file", license_photo: "licenses/ab-file/current.pdf" },
    { daycare_id: "ab-enroll", license_photo: "  " },
    { daycare_id: "ab-none", license_photo: null },
  ]);
  assert.equal(rows[0].license_photo, "licenses/ab-kh2t/licence.pdf");
  assert.equal(rows[0].license_number, "70051797");
  assert.equal(rows[1].license_photo, "licenses/ab-file/current.pdf");
  assert.equal(rows[2].license_photo, "licenses/ab-enroll/enrol.pdf");
  assert.equal(rows[3].license_photo, null);
  assert.equal(queries.length, 2);

  assert.match(src("src/lib/server/admin-centres.ts"), /overlayStoredLicensePhotos/);
  assert.match(src("src/routes/api/license-docs.$daycareId.ts"), /overlayStoredLicensePhotos/);
  assert.match(src("src/lib/server/admin-centres.ts"), /nullif\(btrim\(c\.license_photo\), ''\)/);
});
