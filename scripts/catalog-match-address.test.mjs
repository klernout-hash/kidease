import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseCsvRecords } from "../src/lib/catalog-master.ts";
import {
  catalogueStreetKey,
  catalogueStreetsCompatible,
  sameCatalogueCentre,
} from "../src/lib/catalog-match.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function row(partial) {
  return {
    name: partial.name,
    address: partial.address,
    city: partial.city || "",
    province: partial.province,
    postalCode: partial.postalCode || "",
    licenseNumber: partial.licenseNumber || "",
  };
}

describe("catalogue street keys from the October 2026 duplicate audit", () => {
  it("keeps the civic number on a numbered street", () => {
    assert.equal(catalogueStreetKey("9231 100 AVENUE"), "9231|100|ave");
    assert.equal(catalogueStreetKey("4201 46 STREET"), "4201|46|st");
    assert.equal(catalogueStreetKey("4801-48 STREET"), "4801|48|st");
    assert.equal(catalogueStreetKey("401 - 5 STREET"), "401|5|st");
    assert.equal(catalogueStreetKey("1 5115 45 STREET"), "5115|45|st");
    assert.equal(catalogueStreetKey("UNIT 101-103, 7101 49 STREET"), "7101|49|st");
    assert.equal(catalogueStreetKey("645, 7e avenue"), "645|7e|ave");
    assert.equal(catalogueStreetKey("99, 107e rue"), "99|107e|st");
  });

  it("treats a direction, a French type, and a joined lake shore as the same street", () => {
    assert.equal(catalogueStreetsCompatible("270 Gerrard St E", "270 Gerrard Street"), true);
    assert.equal(catalogueStreetsCompatible("1055 Gerrard St E", "1055 Gerrard Street"), true);
    assert.equal(catalogueStreetsCompatible("270 Gerrard St E", "270 Gerrard St W"), false);
    assert.equal(catalogueStreetsCompatible("3029 Lake Shore Blvd W", "3029 Lakeshore Boulevard"), true);
    assert.equal(catalogueStreetsCompatible("14 Pembroke Rue", "14 Pembroke St"), true);
    assert.equal(catalogueStreetsCompatible("480 Senez Street", "480 Senez Rue"), true);
    assert.equal(catalogueStreetsCompatible("150 Rue Carnforth", "150 Carnforth Rd"), true);
    assert.equal(catalogueStreetsCompatible("1236 Kingston Chemin", "1236 Kingston Rd"), true);
    assert.equal(catalogueStreetsCompatible("21 Channel Nine Crt", "21 Channel Nine Court"), true);
    assert.equal(catalogueStreetsCompatible("390 Bamburgh Cir", "390 Bamburgh Circle"), true);
    assert.equal(catalogueStreetsCompatible("75 Augusta Sq", "75 Augusta Square"), true);
    assert.equal(catalogueStreetsCompatible("20 Old Kingston Road Road", "20 Old Kingston Rd"), true);
    assert.equal(catalogueStreetsCompatible("175 Glenwood", "175 Glenwood Drive"), true);
    assert.equal(catalogueStreetKey(",   C.P. 69"), catalogueStreetKey("C.P. 69"));
    assert.equal(catalogueStreetsCompatible(",   C.P. 69", "CP 70"), false);
    assert.equal(catalogueStreetsCompatible("230 Jane St", "232 Jane St"), false);
  });

  it("matches an Alberta copy with the same numbered street even when the licence hash is longer", () => {
    const bundled = row({
      name: "AIRDRIE DAYCARE FIRST AVENUE",
      address: "513 1 AVENUE",
      province: "AB",
      licenseNumber: "ABFF399B5954ED5E",
    });
    const master = row({
      name: "Airdrie Daycare First Avenue",
      address: "513 1 AVENUE",
      province: "AB",
      licenseNumber: "ABFF399B5954ED5E0123456789ABCDEF",
    });
    assert.equal(sameCatalogueCentre(bundled, master), true);
    assert.equal(
      sameCatalogueCentre(
        { ...bundled, address: "Not Available", licenseNumber: "" },
        { ...master, address: "Not Available", licenseNumber: "" },
      ),
      false,
    );
    assert.equal(
      sameCatalogueCentre(
        { ...bundled, address: "Not Available" },
        { ...master, address: "Not Available" },
      ),
      true,
    );
    assert.equal(
      sameCatalogueCentre(
        row({ name: "Same Name", address: "Not Available", province: "AB", licenseNumber: "62634" }),
        row({ name: "Same Name", address: "Not Available", province: "AB", licenseNumber: "626340" }),
      ),
      false,
    );
  });

  it("matches Toronto and Quebec audit pairs that the strict street key used to miss", () => {
    assert.equal(
      sameCatalogueCentre(
        row({ name: "Pembroke Child Care", address: "14 Pembroke Rue", province: "ON" }),
        row({ name: "Pembroke Child Care", address: "14 Pembroke St", province: "ON" }),
      ),
      true,
    );
    assert.equal(
      sameCatalogueCentre(
        row({
          name: "Centre De La Petite Enfance Pirursaivik",
          address: ",   C.P. 69",
          province: "QC",
          licenseNumber: "qc-2175-centre-de-la",
        }),
        row({
          name: "Centre De La Petite Enfance Pirursaivik",
          address: "C.P. 69",
          province: "QC",
          licenseNumber: "QC-88421",
        }),
      ),
      true,
    );
    assert.equal(
      sameCatalogueCentre(
        row({ name: "Kids & Company", address: "10 Main St", province: "ON" }),
        row({ name: "Kids & Company", address: "12 Main St", province: "ON" }),
      ),
      false,
    );
  });

  it("matches most audited pairs from the committed merge list", () => {
    const table = parseCsvRecords(readFileSync(join(root, "data/ops/merge-duplicates-20261001.csv"), "utf8"));
    const header = table[0];
    const idx = Object.fromEntries(header.map((key, index) => [key, index]));
    let matched = 0;
    let identical = 0;
    let identicalMiss = 0;
    for (const cells of table.slice(1)) {
      if (!cells[idx.duplicate_site_id]) continue;
      const left = row({
        name: cells[idx.name],
        address: cells[idx.duplicate_address],
        city: cells[idx.city],
        province: cells[idx.province],
        postalCode: cells[idx.postal],
      });
      const right = row({
        name: cells[idx.keeper_name],
        address: cells[idx.keeper_address],
        city: cells[idx.city],
        province: cells[idx.province],
        postalCode: cells[idx.keeper_postal],
      });
      const same = sameCatalogueCentre(left, right);
      if (same) matched += 1;
      const identicalAddress = left.address.trim().toLowerCase() === right.address.trim().toLowerCase();
      if (identicalAddress) {
        identical += 1;
        if (!same) identicalMiss += 1;
      }
    }
    assert.equal(identical, 873);
    assert.ok(matched >= 980, `matched ${matched}`);
    assert.ok(identicalMiss < 40, `identical misses ${identicalMiss}`);
  });
});
