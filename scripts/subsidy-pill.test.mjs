import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedFeeProgramBadge, listingSubsidy, subsidyNoteKey } from "../src/lib/fee-program.ts";

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

test("Saskatchewan needs stored program proof and known under-six ages", () => {
  const regina = row({ province: "SK", city: "Regina", amenities: "licensed", feeProgram: "sk-10-day", agesKnown: true, ageMinMonths: 0, ageMaxMonths: 60 });
  assert.equal(confirmedFeeProgramBadge(regina), "badgeTen");
  assert.equal(listingSubsidy(regina)?.subsidy_label, "$10 / Day");
  assert.equal(listingSubsidy({ ...regina, feeProgram: null }), null);
  assert.equal(listingSubsidy({ ...regina, agesKnown: false }), null);
  assert.equal(listingSubsidy({ ...regina, ageMinMonths: null, ageMaxMonths: null }), null);
  assert.equal(
    confirmedFeeProgramBadge({ ...regina, facilityType: "school_age" }),
    null,
  );
  assert.equal(
    confirmedFeeProgramBadge(
      { ...regina, ageMinMonths: 72, ageMaxMonths: 144 },
    ),
    null,
  );
});

test("Nunavut needs program proof, known preschool ages and a stored facility type", () => {
  const centre = row({ province: "NU", city: "Iqaluit", feeProgram: "nu-10-day", facilityType: "child_care_centre", amenities: "licensed", agesKnown: true, ageMinMonths: 0, ageMaxMonths: 60 });
  assert.equal(confirmedFeeProgramBadge(centre), "badgeTen");
  assert.equal(listingSubsidy({ ...centre, feeProgram: null }), null);
  assert.equal(listingSubsidy({ ...centre, facilityType: null }), null);
  assert.equal(listingSubsidy({ ...centre, agesKnown: false }), null);
  assert.equal(listingSubsidy({ ...centre, ageMinMonths: 72, ageMaxMonths: 144 }), null);
  assert.equal(listingSubsidy({ ...centre, facilityType: "school_age" }), null);
  assert.equal(confirmedFeeProgramBadge({ ...centre, facilityType: "family_home" }), "badgeTen");
});

test("a province, licence, harvested amenity or mismatched fee code never proves a $10 rate", () => {
  for (const province of ["MB", "SK", "NU", "BC", "PE", "NL"]) {
    assert.equal(listingSubsidy(row({ province, facilityType: "child_care_centre", agesKnown: true, ageMinMonths: 0, ageMaxMonths: 60 })), null, province);
  }
  assert.equal(listingSubsidy(row({ province: "ON", feeProgram: "mb-10-day" })), null);
  assert.equal(listingSubsidy(row({ province: "MB", feeProgram: "sk-10-day" })), null);
});

test("provinces that are not at $10 never get the pill", () => {
  for (const [province, city] of [
    ["ON", "Toronto"],
    ["AB", "Calgary"],
    ["NB", "Moncton"],
    ["NS", "Halifax"],
  ]) {
    const sample = row({ province, city, feeConfirmed: true, amenities: "licensed,funded,ten-a-day" });
    assert.equal(confirmedFeeProgramBadge(sample), null, province);
    assert.equal(listingSubsidy(sample), null, province);
    assert.equal(listingSubsidy(sample)?.subsidy_label, undefined);
  }
});

test("Manitoba, PEI, and Newfoundland need a sourced yes, not a harvested amenity", () => {
  assert.equal(confirmedFeeProgramBadge(row({ province: "MB" })), null);
  assert.equal(listingSubsidy(row({ province: "MB", city: "Winnipeg" })), null);
  const funded = row({ province: "MB", city: "Winnipeg", feeProgram: "mb-10-day", feeConfirmed: false });
  assert.equal(confirmedFeeProgramBadge(funded), "badgeTen");
  assert.equal(listingSubsidy(funded)?.subsidy_label, "$10 / Day");
  assert.equal(listingSubsidy(funded)?.subsidy_label_fr, "10 $ / jour");
  assert.match(listingSubsidy(funded)?.subsidy_note ?? "", /capped at \$10\/day for eligible 4–10-hour care/);
  assert.match(listingSubsidy(funded)?.subsidy_note ?? "", /school-day schedules differ/);
  assert.match(listingSubsidy(funded)?.subsidy_note ?? "", /subsidy is separate/);
  assert.equal(confirmedFeeProgramBadge(row({ province: "PE", city: "Charlottetown" })), null);
  assert.equal(listingSubsidy(row({ province: "PE", feeProgram: "pe-10-day" }))?.subsidy_label, "$10 / Day");
  assert.equal(confirmedFeeProgramBadge(row({ province: "NL" })), null);
  assert.equal(listingSubsidy(row({ province: "NL", feeProgram: "nl-10-day" }))?.subsidy_label, "$10 / Day");
  assert.equal(confirmedFeeProgramBadge(row({ province: "YT" })), null);
  assert.equal(listingSubsidy(row({ province: "YT", feeProgram: "yt-reduced" }))?.subsidy_label, "Reduced fees");
});

test("Quebec $9.65 only on a contribution-reduite match", () => {
  const subsidized = row({
    province: "QC",
    city: "Montreal",
    name: "Cabane Habile Enr",
    amenities: "licensed",
  });
  assert.equal(confirmedFeeProgramBadge(subsidized), "badgeQc965");
  assert.equal(listingSubsidy(subsidized)?.subsidy_label, "$9.65/day subsidized");
  assert.equal(subsidyNoteKey(subsidized), "subsidyNoteQc");
  const privateCentre = row({ province: "QC", city: "Amqui", name: "Garderie qui n'est pas subventionnee", amenities: "licensed" });
  assert.equal(confirmedFeeProgramBadge(privateCentre), null);
  assert.equal(listingSubsidy(privateCentre), null);
  assert.equal(subsidyNoteKey(privateCentre), "subsidyNoteQcNo");
});

test("British Columbia $10 only when the official name and city match", () => {
  const listed = row({ province: "BC", city: "Nelson", name: "Cornerstone Children's Centre", amenities: "licensed" });
  assert.equal(confirmedFeeProgramBadge(listed), "badgeTen");
  assert.equal(listingSubsidy(listed)?.subsidy_label, "$10 / Day");
  const random = row({ province: "BC", city: "Vancouver", name: "Bonnie Bairns Childcare Services", amenities: "licensed,funded" });
  assert.equal(confirmedFeeProgramBadge(random), null);
  assert.equal(listingSubsidy(random)?.subsidy_label ?? "", "");
  assert.doesNotMatch(listingSubsidy(random)?.subsidy_label ?? "", /\$10/);
});

test("Northwest Territories reduced fees only on a directory subsidy yes", () => {
  const yellowknife = row({ province: "NT", city: "Yellowknife", name: "A Bright Start Day Home", amenities: "licensed,home" });
  assert.equal(confirmedFeeProgramBadge(yellowknife), "badgeReduced");
  assert.equal(listingSubsidy(yellowknife)?.subsidy_label, "Reduced fees");
  assert.doesNotMatch(listingSubsidy(yellowknife)?.subsidy_label ?? "", /\$10/);
  assert.equal(confirmedFeeProgramBadge(row({ province: "NT", city: "Yellowknife", name: "Not On The Directory" })), null);
  assert.equal(subsidyNoteKey(yellowknife), "subsidyNoteReduced");
});
