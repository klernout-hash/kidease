import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
import { catalogueLicenceKey, catalogueNameKey, catalogueStreetKey, sameCatalogueCentre } from "../src/lib/catalog-match.ts";
import { planDuplicateMerges } from "../src/lib/listing-merge.ts";
import { dropStoredDuplicateAdditions, parseMasterFacilities, syncMasterCatalogue } from "../src/lib/catalog-master-sync.ts";

const casaStored = {
  id: "mb-1276",
  slug: "casa-montessori-amp-orff-school-fennel-1276",
  name: "Casa Montessori &amp; Orff School Fennel",
  address: "80 Fennel Street",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3T 3M4",
  licenseNumber: "MB-1276",
  lat: 49.85,
  lng: -97.15,
};

const casaMaster = `facility_id,name,licence_number,facility_type,street_address,city,province,postal_code,phone,email,website
MB|casa|1276,Casa Montessori & Orff School Fennel,1276,Centre,80 Fennel Street,Winnipeg,MB,R3P 2L7,,,
`;

const absorbentStored = {
  id: "on-tor-14663",
  slug: "absorbent-minds-montessori-east-14663",
  name: "Absorbent Minds Montessori East",
  address: "6534 Kingston Rd",
  city: "Toronto",
  province: "ON",
  postalCode: "M1C 1L4",
  licenseNumber: "14663",
  lat: 43.78,
  lng: -79.15,
};

const absorbentMaster = `facility_id,name,licence_number,facility_type,street_address,city,province,postal_code,phone,email,website
ON|absorbent|62955,Absorbent Minds Montessori East,62955,Centre,6534 Kingston Road,Scarborough,ON,M1C 1L4,,,
`;

describe("catalogue dedupe failure cases", () => {
  it("treats MB-1276 and 1276 as one licence, including a leading zero", () => {
    assert.equal(catalogueLicenceKey("MB-1276"), "1276");
    assert.equal(catalogueLicenceKey("1276"), "1276");
    assert.equal(catalogueLicenceKey("MB-01276"), "1276");
    assert.equal(catalogueLicenceKey("08456"), "8456");
    assert.equal(catalogueNameKey("Casa Montessori &amp; Orff School Fennel"), catalogueNameKey("Casa Montessori & Orff School Fennel"));
  });

  it("does not add a second Manitoba row when the stored licence has a province prefix and the name has &amp;", () => {
    const incoming = {
      id: "mx-casa",
      slug: "casa-montessori-orff-school-fennel",
      name: "Casa Montessori & Orff School Fennel",
      address: "80 Fennel Street",
      city: "Winnipeg",
      province: "MB",
      postalCode: "R3P 2L7",
      licenseNumber: "1276",
    };
    const dropped = dropStoredDuplicateAdditions([incoming], [casaStored]);
    assert.equal(dropped.dropped, 1);
    assert.equal(dropped.rows.length, 0);
    const plan = syncMasterCatalogue([casaStored], casaMaster);
    assert.equal(plan.summary.matched, 1);
    assert.equal(plan.summary.added, 0);
    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0].id, "mb-1276");
  });

  it("does not add a provincial Ontario row when the Toronto row is already stored", () => {
    const provincial = {
      id: "on-62955",
      slug: "absorbent-minds-montessori-east-62955",
      name: "Absorbent Minds Montessori East",
      address: "6534 Kingston Road",
      city: "Scarborough",
      province: "ON",
      postalCode: "M1C 1L4",
      licenseNumber: "62955",
    };
    const dropped = dropStoredDuplicateAdditions([provincial], [absorbentStored]);
    assert.equal(dropped.dropped, 1);
    assert.equal(
      sameCatalogueCentre(
        { ...absorbentStored, address: "6534 Kingston Rd" },
        { name: "Absorbent Minds Montessori East", address: "6534 Kingston Road", city: "Scarborough", province: "ON", postalCode: "M1C 1L4", licenseNumber: "62955" },
      ),
      true,
    );
    const plan = syncMasterCatalogue([absorbentStored], absorbentMaster);
    assert.equal(plan.summary.matched, 1);
    assert.equal(plan.summary.added, 0);
    assert.equal(plan.rows[0].id, "on-tor-14663");
  });

  it("matches Allenby Day Care to Allenby Daycare Inc. on the normalized street", () => {
    assert.equal(
      sameCatalogueCentre(
        {
          name: "Allenby Day Care",
          address: "391 St Clements Ave",
          city: "Toronto",
          province: "ON",
          postalCode: "M5N 1M2",
          licenseNumber: "3712",
        },
        {
          name: "Allenby Daycare Inc.",
          address: "391 St.Clements Avenue",
          city: "Toronto",
          province: "ON",
          postalCode: "M5N 1M2",
          licenseNumber: "08456",
        },
      ),
      true,
    );
  });

  it("skips a Prince Edward Island row whose name is only a city and postal code", () => {
    const csv = `facility_id,name,licence_number,facility_type,street_address,city,province,postal_code
PE|stratford|L4487,"Stratford, PE C1B 2W8",L4487,Centre,Mailing Address: 41 Glen Stewart Drive,Stratford,PE,
`;
    const parsed = parseMasterFacilities(csv);
    assert.equal(parsed.rows.length, 0);
    assert.equal(parsed.invalid, 1);
  });

  it("uses facility_name when the name column is a city and postal code", () => {
    const csv = `facility_id,name,licence_number,facility_type,street_address,city,province,postal_code,facility_name
PE|stratford|L4487,"Stratford, PE C1B 2W8",L4487,Centre,Mailing Address: 41 Glen Stewart Drive,,,,Fixture Early Years
`;
    const parsed = parseMasterFacilities(csv);
    assert.equal(parsed.invalid, 0);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].name, "Fixture Early Years");
    assert.equal(parsed.rows[0].city, "Stratford");
    assert.equal(parsed.rows[0].province, "PE");
    assert.equal(parsed.rows[0].postal, "C1B 2W8");
    assert.equal(parsed.rows[0].address, "41 Glen Stewart Drive");
  });

  it("does not match two Kids & Company branches on the name", () => {
    const bloor = {
      name: "Kids & Company",
      address: "160 Bloor St E",
      city: "Toronto",
      province: "ON",
      postalCode: "M4W 1B9",
      licenseNumber: "9815",
    };
    const front = {
      name: "Kids & Company",
      address: "320 Front St W",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 3B6",
      licenseNumber: "9847",
    };
    assert.equal(sameCatalogueCentre(bloor, front), false);
    assert.equal(sameCatalogueCentre({ ...bloor, address: "", licenseNumber: "" }, { ...front, address: "", licenseNumber: "" }), false);
    const dropped = dropStoredDuplicateAdditions(
      [{ id: "on-tor-9847", slug: "kids-front", ...front }],
      [{ id: "on-tor-9815", slug: "kids-bloor", ...bloor }],
    );
    assert.equal(dropped.dropped, 0);
    assert.deepEqual(dropped.rows.map((row) => row.id), ["on-tor-9847"]);
  });

  it("does not match Angelgate at 230 Jane St with Angelgate at 232 Jane St", () => {
    const jane230 = {
      name: "Angelgate Daycare Ltd.",
      address: "230 Jane St",
      city: "Toronto",
      province: "ON",
      postalCode: "M6S 3Z1",
      licenseNumber: "13180",
    };
    const jane232 = {
      name: "Angelgate Daycare Ltd.",
      address: "232 Jane St",
      city: "Toronto",
      province: "ON",
      postalCode: "M6S 3Z1",
      licenseNumber: "13181",
    };
    assert.notEqual(catalogueStreetKey("230 Jane St"), catalogueStreetKey("232 Jane St"));
    assert.equal(catalogueStreetKey("232 Jane St"), catalogueStreetKey("232 Jane Street"));
    assert.equal(sameCatalogueCentre(jane230, jane232), false);
    const plan = planDuplicateMerges([
      {
        rows: [
          { id: "on-tor-13180", ...jane230, created_at: "2026-09-02T00:00:00.000Z" },
          { id: "on-tor-13181", ...jane232, created_at: "2026-09-03T00:00:00.000Z" },
        ],
      },
    ]);
    assert.equal(plan.keepers, 0);
    assert.equal(plan.retired, 0);
    assert.equal(plan.skipped.length, 0);
    assert.equal(plan.hiddenReviews.length, 1);
    assert.equal(plan.hiddenReviews[0].reason, "different street addresses");
    assert.equal(plan.hiddenReviews[0].liveId, "on-tor-13180");
    assert.equal(plan.hiddenReviews[0].hiddenId, "on-tor-13181");
    assert.equal(plan.hiddenReviews[0].flag, "hidden_review_possible_second_site");
    assert.equal(plan.hiddenReviews[0].listingActive, 0);
    assert.equal(plan.hiddenReviews[0].visibility, "admin_only");
  });

  it("matches 240 Avenue Rd with 240 Avenue Road when the name is the same", () => {
    const avenueRd = {
      name: "Unicorn Day Care Centre",
      address: "240 Avenue Rd",
      city: "Toronto",
      province: "ON",
      postalCode: "M5R 2J4",
      licenseNumber: "13257",
    };
    const avenueRoad = {
      name: "Unicorn Day Care Centre Inc.",
      address: "240 Avenue Road",
      city: "Toronto",
      province: "ON",
      postalCode: "M5R 2J6",
      licenseNumber: "56174",
    };
    assert.equal(catalogueStreetKey("240 Avenue Rd"), catalogueStreetKey("240 Avenue Road"));
    assert.equal(sameCatalogueCentre(avenueRd, avenueRoad), true);
    const dropped = dropStoredDuplicateAdditions(
      [{ id: "on-56174", slug: "unicorn-avenue-road", ...avenueRoad }],
      [{ id: "on-tor-13257", slug: "unicorn-avenue-rd", ...avenueRd }],
    );
    assert.equal(dropped.dropped, 1);
  });

  it("matches Civic #35117 with 35117 PTH 15 Rd 60N when the licence is the same", () => {
    const civic = {
      name: "Springfield Learning Centres Incorporated",
      address: "Civic #35117",
      city: "Anola",
      province: "MB",
      postalCode: "R0E 0K0",
      licenseNumber: "102535",
    };
    const highway = {
      name: "Springfield Learning Centres",
      address: "35117 PTH 15 Rd 60N",
      city: "Anola",
      province: "MB",
      postalCode: "R0E 0A0",
      licenseNumber: "MB-102535",
    };
    assert.notEqual(catalogueStreetKey(civic.address), catalogueStreetKey(highway.address));
    assert.equal(sameCatalogueCentre(civic, highway), true);
    assert.equal(sameCatalogueCentre(civic, { ...highway, licenseNumber: "9999" }), false);
    assert.equal(
      sameCatalogueCentre(civic, { ...highway, licenseNumber: "MB|SpringfieldLearningCentresInc.|Anola" }),
      false,
    );
    const dropped = dropStoredDuplicateAdditions(
      [{ id: "mx-springfield", slug: "springfield-civic", ...civic }],
      [{ id: "mb-102535", slug: "springfield-pth", ...highway }],
    );
    assert.equal(dropped.dropped, 1);
  });

  it("holds Prairie Nature, St. Adolphe, and KidFit instead of merging them", () => {
    const cases = [
      {
        name: "Prairie Nature Children's Centre",
        rows: [
          {
            id: "mb-7858",
            name: "Prairie Nature Children's Centre",
            address: "600  Hoka Street",
            city: "Winnipeg",
            province: "MB",
            postalCode: "R2C 2V1",
            licenseNumber: "MB-7858",
            created_at: "2026-09-02T00:00:00.000Z",
          },
          {
            id: "mx-prairie",
            name: "Prairie Nature Children's Centre Inc.",
            address: "115 Sanford Fleming Road",
            city: "Winnipeg",
            province: "MB",
            postalCode: "R2C 2V1",
            licenseNumber: "7858",
            created_at: "2026-09-24T00:00:00.000Z",
            claim_status: "approved",
          },
        ],
        reason: "different street addresses",
      },
      {
        name: "St. Adolphe Child Care Centre",
        rows: [
          {
            id: "mb-100758",
            name: "St. Adolphe Child Care Centre Inc.",
            address: "444 La Seine Street",
            city: "St. Adolphe",
            province: "MB",
            postalCode: "R5A 1C2",
            licenseNumber: "MB-100758",
            created_at: "2026-09-02T00:00:00.000Z",
          },
          {
            id: "mx-adolphe",
            name: "St. Adolphe Child Care Centre",
            address: "372 Main Street",
            city: "St. Adolphe",
            province: "MB",
            postalCode: "R5A 1A9",
            licenseNumber: "100758",
            created_at: "2026-09-24T00:00:00.000Z",
            claim_status: "approved",
          },
        ],
        reason: "different street addresses",
      },
      {
        name: "KidFit 60",
        rows: [
          {
            id: "mb-102743",
            name: "KidFit 60",
            address: "1295 Salter Street",
            city: "Winnipeg",
            province: "MB",
            postalCode: "R2V 3T2",
            licenseNumber: "MB-102743",
            created_at: "2026-09-24T00:00:00.000Z",
          },
          {
            id: "mx-kidfit",
            name: "KidFit 60 Inc.",
            address: "Vince Leah Community Centre",
            city: "Winnipeg",
            province: "MB",
            postalCode: "R2V 0R4",
            licenseNumber: "102743",
            created_at: "2026-09-02T00:00:00.000Z",
            claim_status: "approved",
          },
        ],
        reason: "named venue with a different postal code",
      },
    ];
    for (const sample of cases) {
      assert.equal(sameCatalogueCentre(sample.rows[0], sample.rows[1]), false, sample.name);
      const plan = planDuplicateMerges([{ rows: sample.rows }]);
      assert.equal(plan.keepers, 0, sample.name);
      assert.equal(plan.retired, 0, sample.name);
      assert.equal(plan.hiddenReviews.length, 1, sample.name);
      assert.equal(plan.hiddenReviews[0].reason, sample.reason, sample.name);
      assert.equal(plan.hiddenReviews[0].liveId, sample.rows[0].id, sample.name);
      assert.equal(plan.hiddenReviews[0].hiddenId, sample.rows[1].id, sample.name);
      assert.equal(plan.hiddenReviews[0].flag, "hidden_review_possible_second_site", sample.name);
      assert.equal(plan.hiddenReviews[0].listingActive, 0, sample.name);
      assert.equal(plan.hiddenReviews[0].visibility, "admin_only", sample.name);
      assert.equal(plan.hiddenReviews[0].mergedInto, undefined, sample.name);
      assert.ok(plan.hiddenReviews[0].names.some((name) => name.includes(sample.name.split(" ")[0])), sample.name);
    }
  });

  it("merges a room, a unit prefix, and a matching civic number into the street row", () => {
    assert.equal(catalogueStreetKey("10/11/12 20 Island Shore Blvd."), catalogueStreetKey("20 Island Shore Blvd."));
    assert.equal(catalogueStreetKey("866  Autumnwood Drive"), catalogueStreetKey("866 Autumnwood Drive"));
    const rainbow = planDuplicateMerges([
      {
        rows: [
          {
            id: "mx-rainbow",
            name: "Rainbow Day Nursery Inc. (Phase 1)",
            address: "10/11/12 20 Island Shore Blvd.",
            city: "Wpg",
            province: "MB",
            postalCode: "R2J 3Z7",
            licenseNumber: "1140",
            created_at: "2026-09-24T00:00:00.000Z",
          },
          {
            id: "mb-1140",
            name: "Rainbow Day Nursery Inc. (Phase 1)",
            address: "20 Island Shore Blvd.",
            city: "Winnipeg",
            province: "MB",
            postalCode: "R3X 1N6",
            licenseNumber: "MB-1140",
            created_at: "2026-09-02T00:00:00.000Z",
          },
        ],
      },
    ]);
    assert.equal(rainbow.keepers, 1);
    assert.equal(rainbow.retired, 1);
    assert.equal(rainbow.needsReview.length, 0);
    const frontenac = planDuplicateMerges([
      {
        rows: [
          {
            id: "mx-frontenac",
            name: "Frontenac Before and After School Program",
            address: "Room 1 and gym",
            city: "Wpg.",
            province: "MB",
            postalCode: "R3K 0Z8",
            licenseNumber: "100238",
            created_at: "2026-09-01T00:00:00.000Z",
          },
          {
            id: "mb-100238",
            name: "Frontenac Before and After School Program",
            address: "866  Autumnwood Drive",
            city: "Winnipeg",
            province: "MB",
            postalCode: "R2J 1C1",
            licenseNumber: "MB-100238",
            created_at: "2026-09-24T00:00:00.000Z",
          },
        ],
      },
    ]);
    assert.equal(frontenac.groups[0].keeperId, "mb-100238");
    assert.deepEqual(frontenac.groups[0].retiredIds, ["mx-frontenac"]);
    assert.equal(frontenac.needsReview.length, 0);
    const springfield = planDuplicateMerges([
      {
        rows: [
          {
            id: "mx-springfield",
            name: "Springfield Learning Centres Incorporated",
            address: "Civic #35117",
            city: "Anola",
            province: "MB",
            postalCode: "R0E 0K0",
            licenseNumber: "102535",
            created_at: "2026-09-24T00:00:00.000Z",
          },
          {
            id: "mb-102535",
            name: "Springfield Learning Centres",
            address: "35117 PTH 15 Rd 60N",
            city: "Anola",
            province: "MB",
            postalCode: "R0E 0A0",
            licenseNumber: "MB-102535",
            created_at: "2026-09-02T00:00:00.000Z",
          },
          {
            id: "mx-e220a7741d23",
            name: "Springfield Learning Centres Inc.",
            address: "Civic #35117",
            city: "Anola",
            province: "MB",
            postalCode: "R0E 0K0",
            licenseNumber: "MB|SpringfieldLearningCentresInc.|Anola",
            created_at: "2026-09-24T00:00:00.000Z",
          },
        ],
      },
    ]);
    assert.equal(springfield.groups[0].keeperId, "mb-102535");
    assert.deepEqual(springfield.groups[0].retiredIds, ["mx-springfield"]);
    assert.deepEqual(springfield.groups[0].unrelatedIds, ["mx-e220a7741d23"]);
    assert.equal(springfield.needsReview.length, 0);
  });

  it("python importer self-test matches the MB-1276 and on-tor cases", () => {
    const result = spawnSync("python3", ["scripts/catalogue_match.py"], { encoding: "utf8", cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "ok");
  });
});
