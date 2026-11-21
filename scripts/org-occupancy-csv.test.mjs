import assert from "node:assert/strict";
import { test } from "node:test";
import { orgOccupancyCsv } from "../src/lib/org-occupancy-csv.ts";

const report = {
  sites: [
    {
      id: "internal-site-2",
      name: 'Synthetic "Maple", North',
      city: "Winnipeg",
      province: "MB",
      licensedCapacity: 20,
      enrolled: 0,
      openSpots: 0,
      requests: 0,
      staff: 2,
      occupancyPercent: 0,
      note: "ready",
    },
    {
      id: "internal-site-1",
      name: "Synthetic Cedar",
      city: "",
      province: "",
      licensedCapacity: null,
      enrolled: null,
      openSpots: null,
      requests: null,
      staff: null,
      occupancyPercent: null,
      note: "capacity-missing",
    },
  ],
  totals: {
    sites: 2,
    ready: 1,
    capacity: 999,
    enrolled: 888,
    occupancyPercent: 12.5,
    requests: 17,
    staff: 5,
    openSpots: 4,
  },
};

test("exports seven visible columns in loaded order, preserving zero, missing values and quoted location", () => {
  const csv = orgOccupancyCsv(report, "en");
  assert.equal(
    csv,
    '\uFEFFCentre,Capacity,Enrolled,Open spots,Requests,Staff,Occupancy\n"Synthetic ""Maple"", North\nWinnipeg, MB",20,0,0,0,2,0%\nSynthetic Cedar,Not confirmed,Not confirmed,Not confirmed,Not confirmed,Not confirmed,Capacity is not on file.\n,,,,,,\nCentres with both numbers: 1 of 2,,,,,,12.5%\nDisplayed summary,,,4,17,5,\n',
  );
});

test("uses supplied visible summaries without exporting hidden numeric totals or identifiers", () => {
  const csv = orgOccupancyCsv(report, "en");
  assert(csv.includes("12.5%"));
  assert(csv.includes("Displayed summary,,,4,17,5,"));
  for (const hidden of ["999", "888", "internal-site-1", "internal-site-2"])
    assert(!csv.includes(hidden));
  assert.deepEqual(
    report.sites.map((site) => site.id),
    ["internal-site-2", "internal-site-1"],
  );
});

test("French headers, missing-enrolment reason and summary match the displayed copy", () => {
  const csv = orgOccupancyCsv(
    {
      sites: [
        {
          ...report.sites[1],
          name: "Centre synthétique Érable",
          licensedCapacity: 15,
          note: "enrolment-missing",
        },
      ],
      totals: {
        sites: 1,
        ready: 0,
        occupancyPercent: null,
        requests: null,
        staff: null,
        openSpots: null,
      },
    },
    "fr",
  );
  assert.equal(
    csv,
    "\uFEFFCentre,Capacité,Inscrits,Places libres,Demandes,Personnel,Occupation\nCentre synthétique Érable,15,Pas confirmé,Pas confirmé,Pas confirmé,Pas confirmé,L'inscription n'est pas au dossier.\n,,,,,,\nCentres avec les deux chiffres: 0 sur 1,,,,,,\nRésumé affiché,,,Pas confirmé,Pas confirmé,Pas confirmé,\n",
  );
});

test("normalizes CR/LF and escapes multiline text with the existing CSV formatter", () => {
  const csv = orgOccupancyCsv(
    {
      sites: [{ ...report.sites[0], name: 'Synthetic, "A"\r\nB\rC', city: "", province: "" }],
      totals: { sites: 1, ready: 1, occupancyPercent: 0 },
    },
    "en",
  );
  assert(csv.includes('"Synthetic, ""A""\nB\nC",20,0,0,0,2,0%'));
  assert(!csv.includes("\r"));
  assert(!csv.includes("Displayed summary"), "the optional footer must match its visible branch");
});
