import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedFeeProgramBadge, subsidyNoteKey } from "../src/lib/fee-program.ts";

function row(overrides) {
  return {
    name: "Centre",
    city: "Winnipeg",
    province: "MB",
    amenities: "licensed,funded,ten-a-day",
    feeConfirmed: true,
    feeProgram: null,
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
    ...overrides,
  };
}

test("Saskatchewan shows $10 for licensed care under 6, not school-age only", () => {
  assert.equal(confirmedFeeProgramBadge(row({ province: "SK", city: "Regina", amenities: "licensed" })), "badgeTen");
  assert.equal(
    confirmedFeeProgramBadge(row({ province: "SK", amenities: "licensed,in-school", agesKnown: false })),
    null,
  );
  assert.equal(
    confirmedFeeProgramBadge(
      row({ province: "SK", amenities: "licensed", agesKnown: true, ageMinMonths: 72, ageMaxMonths: 144 }),
    ),
    null,
  );
});

test("Nunavut shows $10 on licensed centres, not family homes", () => {
  assert.equal(confirmedFeeProgramBadge(row({ province: "NU", city: "Iqaluit", name: "Aakuluk Daycare", amenities: "licensed" })), "badgeTen");
  assert.equal(confirmedFeeProgramBadge(row({ province: "NU", amenities: "licensed,home" })), null);
});

test("provinces that are not at $10 never get the pill", () => {
  for (const province of ["ON", "AB", "NB", "NS"]) {
    assert.equal(confirmedFeeProgramBadge(row({ province, feeConfirmed: true })), null, province);
  }
});

test("Manitoba, PEI, and Newfoundland need a sourced yes, not a harvested amenity", () => {
  assert.equal(confirmedFeeProgramBadge(row({ province: "MB" })), null);
  assert.equal(confirmedFeeProgramBadge(row({ province: "MB", feeProgram: "mb-10-day", feeConfirmed: false })), "badgeTen");
  assert.equal(confirmedFeeProgramBadge(row({ province: "PE", city: "Charlottetown" })), null);
  assert.equal(confirmedFeeProgramBadge(row({ province: "PE", feeProgram: "pe-10-day" })), "badgeTen");
  assert.equal(confirmedFeeProgramBadge(row({ province: "NL" })), null);
  assert.equal(confirmedFeeProgramBadge(row({ province: "NL", feeProgram: "nl-10-day" })), "badgeTen");
  assert.equal(confirmedFeeProgramBadge(row({ province: "YT" })), null);
  assert.equal(confirmedFeeProgramBadge(row({ province: "YT", feeProgram: "yt-reduced" })), "badgeReduced");
});

test("Quebec $9.65 only on a contribution-reduite match", () => {
  const subsidized = row({
    province: "QC",
    city: "Amqui",
    name: 'Centre De La Petite Enfance "Les P\'Tits Flots" Inc.',
    amenities: "licensed",
  });
  assert.equal(confirmedFeeProgramBadge(subsidized), "badgeQc965");
  assert.equal(subsidyNoteKey(subsidized), "subsidyNoteQc");
  const privateCentre = row({ province: "QC", city: "Amqui", name: "Garderie qui n'est pas subventionnee", amenities: "licensed" });
  assert.equal(confirmedFeeProgramBadge(privateCentre), null);
  assert.equal(subsidyNoteKey(privateCentre), "subsidyNoteQcNo");
});

test("British Columbia $10 only when the official name and city match", () => {
  assert.equal(
    confirmedFeeProgramBadge(row({ province: "BC", city: "Nelson", name: "Cornerstone Children's Centre", amenities: "licensed" })),
    "badgeTen",
  );
  assert.equal(
    confirmedFeeProgramBadge(row({ province: "BC", city: "Vancouver", name: "Bonnie Bairns Childcare Services", amenities: "licensed,funded" })),
    null,
  );
});

test("Northwest Territories reduced fees only on a directory subsidy yes", () => {
  assert.equal(
    confirmedFeeProgramBadge(row({ province: "NT", city: "Yellowknife", name: "A Bright Start Day Home", amenities: "licensed,home" })),
    "badgeReduced",
  );
  assert.equal(confirmedFeeProgramBadge(row({ province: "NT", city: "Yellowknife", name: "Not On The Directory" })), null);
  assert.equal(subsidyNoteKey(row({ province: "NT", city: "Yellowknife", name: "A Bright Start Day Home" })), "subsidyNoteReduced");
});
