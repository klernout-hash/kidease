import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
import { masterListingId } from "../src/lib/catalog-master-sync.ts";
import { PEI_NAME_UNRECOVERABLE, planPeiNameRepair } from "../src/lib/pei-name-repair.ts";

const csv = readFileSync(new URL("./fixtures/pei-master-sample.csv", import.meta.url), "utf8");

describe("Prince Edward Island name repair", () => {
  it("recovers a name only from the master file and hides the rest", () => {
    const recoverableId = masterListingId("PE|fixture|L4487");
    const rows = [
      {
        id: recoverableId,
        slug: "stratford-pe-fixture",
        name: "Stratford, PE C1B 2W8",
        city: "Stratford",
        province: "PE",
        postalCode: "",
        licenseNumber: "L4487",
      },
      {
        id: "mx-fixture-hide",
        slug: "stratford-pe-hidden",
        name: "Stratford PE C1B 2W8",
        province: "PE",
        licenseNumber: "FIXTURE",
      },
    ];
    const missing = planPeiNameRepair(rows, null);
    assert.equal(missing.masterRows, 0);
    assert.equal(missing.recoverable.length, 0);
    assert.equal(missing.hide.length, 2);
    assert.equal(missing.hide[0].name.includes("Stratford"), true);

    const found = planPeiNameRepair(rows, csv);
    assert.equal(found.recoverable.length, 1);
    assert.equal(found.recoverable[0].id, recoverableId);
    assert.equal(found.recoverable[0].name, "Fixture Early Years");
    assert.equal(found.recoverable[0].postalCode, "C1B 2W8");
    assert.equal(found.recoverable[0].address, "41 Glen Stewart Drive");
    assert.equal(found.hide.length, 1);
    assert.equal(found.hide[0].id, "mx-fixture-hide");
    assert.equal(PEI_NAME_UNRECOVERABLE, "pei_name_unrecoverable");
  });

  it("does not treat a filled city as something to overwrite", () => {
    const rows = [
      {
        id: masterListingId("PE|fixture|L4487"),
        name: "Stratford, PE C1B 2W8",
        city: "Stratford",
        province: "PE",
        postalCode: "C1B 2W8",
        licenseNumber: "L4487",
      },
    ];
    const plan = planPeiNameRepair(rows, csv);
    assert.equal(plan.recoverable[0].city, null);
    assert.equal(plan.recoverable[0].postalCode, null);
  });

  it("dry-run lists the hidden fixture and does not require a database", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.MASTER_CSV_PATH;
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "scripts/repair-pei-names.mjs",
        "--rows",
        "scripts/fixtures/pei-rows.json",
        "--master-csv",
        "scripts/fixtures/pei-master-sample.csv",
      ],
      { encoding: "utf8", env, cwd: root },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /recoverable 1/);
    assert.match(result.stdout, /hide 1/);
    assert.match(result.stdout, /mode dry-run/);
    assert.match(result.stdout, /hide mx-fixture-hide/);
    assert.match(result.stdout, /recover mx-fixture-recover/);
    assert.doesNotMatch(result.stdout, /Glen Stewart/);
  });
});
