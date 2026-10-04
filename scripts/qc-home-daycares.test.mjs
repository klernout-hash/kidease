import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { qcHomeDaycaresEnabled } from "../src/lib/features.ts";
import { isQcHomePath } from "../src/lib/locale-path.ts";
import {
  QC_HOME_COPY,
  collectCopyStrings,
  formatQcHomeDryRun,
  isPersonalPublishedName,
  parseQcHomeCsv,
  publicDisplayName,
  qcHomePreviewFixtureAllowed,
  toPublicListing,
} from "../src/lib/qc-home-daycare.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (path) => readFileSync(join(root, path), "utf8");

const CSV = [
  "facility_id,name,licence_number,facility_type,care_type,licence_category,program_model,street_address,city,province,postal_code,full_address,phone,email,website,licence_status,ages_served,capacity,fees,fee_unit,source_name,source_url,last_verified,notes,provider_type,source,latitude,longitude,open_spots",
  'QC-TEST|1|aaaa,MARIE TESTEUR,,Milieu familial reconnu (RSGE),Home,RSGE,,123 Rue Secret,Montréal,QC,H2X 1A1,"123 Rue Secret, Montréal, QC",514-555-0199,secret@example.com,,Recognized,,,,,"Bureau coordonnateur: Bureau Test",https://example.com/bc,2026-10-03,PERSONAL_NAME_FLAG: yes,milieu_familial_reconnu,BC public page,45.5012,-73.5599,',
  'QC-TEST|1|bbbb,Les Amis du Parc,,Milieu familial reconnu (RSGE),Home,RSGE,,,Québec,QC,G1A 0A1,"Québec, QC",418-555-0100,,,Recognized,2 to 5,6,$9.00,per day,"Bureau coordonnateur: Bureau Test",https://example.com/bc,2026-10-03,not a personal name,milieu_familial_reconnu,BC public page,45.0,-71.0,2',
  "QC-TEST|1|cccc,Other Centre,,centre,centre,centre,,,,,ON,,,,,https://example.com/bc,2026-10-03,,child_care_centre,other,,,",
].join("\n");

test("FEATURE_QC_HOME_DAYCARES defaults off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_QC_HOME_DAYCARES, false);
  assert.equal(qcHomeDaycaresEnabled({}), false);
  assert.equal(qcHomeDaycaresEnabled({ FEATURE_QC_HOME_DAYCARES: "0" }), false);
  assert.equal(qcHomeDaycaresEnabled({ FEATURE_QC_HOME_DAYCARES: "1" }), true);
  assert.match(src(".env.example"), /^FEATURE_QC_HOME_DAYCARES=0$/m);
  assert.doesNotMatch(src(".env.example"), /^FEATURE_QC_HOME_DAYCARES=1$/m);
});

test("personal names become a municipality label and streets never ship", () => {
  const parsed = parseQcHomeCsv(CSV);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.summary.accepted, 2);
  assert.equal(parsed.summary.skipped, 1);
  assert.equal(parsed.summary.streetDropped, 1);
  assert.equal(parsed.summary.postalReduced, 2);
  assert.equal(parsed.summary.personalNames, 1);
  const personal = parsed.rows[0];
  const org = parsed.rows[1];
  assert.equal(personal.personalName, true);
  assert.equal(personal.postalFsa, "H2X");
  assert.equal(personal.municipality, "Montréal");
  assert.equal(personal.areaLat, 45.51);
  assert.notEqual(personal.areaLat, 45.5012);
  assert.equal(JSON.stringify(personal).includes("123 Rue"), false);
  assert.equal(JSON.stringify(personal).includes("H2X 1A1"), false);
  assert.equal(JSON.stringify(personal).includes("secret@example.com"), true);
  const pub = toPublicListing(
    {
      ...personal,
      areaLat: personal.areaLat,
      areaLng: personal.areaLng,
      areaRadiusM: personal.areaRadiusM,
      hasPhone: Boolean(personal.phone),
      hasEmail: Boolean(personal.email),
    },
    "fr",
  );
  assert.equal(pub.displayName, "Milieu familial reconnu \u2013 Montréal");
  assert.equal(pub.displayName.includes("MARIE"), false);
  assert.equal(pub.badgeText, "Reconnu par Bureau Test, vérifié le 3 oct. 2026");
  assert.equal(JSON.stringify(pub).includes("514-555"), false);
  assert.equal(JSON.stringify(pub).includes("secret@example.com"), false);
  assert.equal(JSON.stringify(pub).includes("123 Rue"), false);
  assert.ok(pub.area);
  assert.ok((pub.area?.radiusM || 0) >= 1500);
  assert.equal(org.personalName, false);
  assert.equal(org.openSpots, 2);
  assert.equal(org.capacity, 6);
  assert.equal(publicDisplayName(org, "en"), "Les Amis du Parc");
  const spots = toPublicListing(
    {
      id: org.id,
      slug: org.slug,
      publishedName: org.publishedName,
      personalName: false,
      municipality: org.municipality,
      neighbourhood: org.neighbourhood,
      postalFsa: org.postalFsa,
      bureauName: org.bureauName,
      sourceUrl: org.sourceUrl,
      verifiedOn: org.verifiedOn,
      capacity: org.capacity,
      openSpots: org.openSpots,
      openSpotsAsOf: org.openSpotsAsOf,
      agesServed: org.agesServed,
      feesText: org.feesText,
      areaLat: org.areaLat,
      areaLng: org.areaLng,
      areaRadiusM: org.areaRadiusM,
      hasPhone: true,
      hasEmail: false,
      website: null,
    },
    "en",
  );
  assert.match(spots.openSpotsText, /Open spots: 2, as of 3 Oct 2026/);
  assert.match(spots.openSpotsText, /may be out of date/);
  assert.doesNotMatch(spots.openSpotsText, /\$10|10-a-day|free forever/);
  assert.match(formatQcHomeDryRun(parsed.summary), /No database write/);
  assert.equal(isPersonalPublishedName("CLAUDIE PAQUET (village)", ""), true);
  assert.equal(isPersonalPublishedName("Les Amis du Parc", ""), false);
  assert.equal(isPersonalPublishedName("Jessica Le Houillier", ""), true);
  assert.equal(isPersonalPublishedName("France et Yvette", ""), true);
  assert.equal(isPersonalPublishedName("Garderie Soleil", ""), false);
  assert.equal(isPersonalPublishedName("(name not published)", ""), true);
  assert.equal(isPersonalPublishedName("RSGE de Otterburn Park", ""), false);
  assert.equal(isPersonalPublishedName("La Durantaye, Esther-Marilou Lachance", ""), true);
  assert.equal(isPersonalPublishedName("L'Ecuyer, Sylvie", ""), true);
  assert.equal(isPersonalPublishedName("Projet-pilote RSGE en communauté Isabelle Litalien", ""), true);
  assert.equal(isPersonalPublishedName("Chez Annie", ""), false);
  assert.equal(isPersonalPublishedName("Les Canaris", ""), false);
  assert.equal(isPersonalPublishedName("Service de garde Gilda", ""), false);
});

test("copy, privacy, and import stay free of outreach and em dashes", () => {
  const strings = collectCopyStrings(QC_HOME_COPY);
  for (const line of strings) {
    assert.equal(line.includes("\u2014"), false, line);
    assert.equal(/free forever/i.test(line), false, line);
  }
  assert.equal(QC_HOME_COPY.fr.correctLink, "C'est mon service de garde \u2013 corriger ou retirer");
  assert.match(QC_HOME_COPY.en.directoryLead, /Canadian company/);
  assert.match(QC_HOME_COPY.fr.directoryLead, /entreprise canadienne/);
  const privacy = src("src/lib/legal-copy.ts");
  const blob = privacy.slice(privacy.indexOf('id: "qc-home"'));
  assert.match(privacy, /id: "qc-home"/);
  assert.match(blob, /\[name to be supplied by Kyle\]/);
  assert.match(blob, /\[nom à fournir par Kyle\]/);
  assert.match(blob, /Law 25/);
  assert.match(blob, /Loi 25/);
  assert.match(blob, /CASL|LCAP/);
  assert.equal(blob.includes("\u2014"), false);
  assert.equal(/free forever/i.test(blob), false);
  assert.equal(isQcHomePath("/milieux-familiaux/qc-test"), true);
  assert.equal(isQcHomePath("/fr/milieux-familiaux"), true);
  const migration = src("migrations/0080_qc_home_daycares.sql");
  assert.match(migration, /milieu_familial_reconnu/);
  assert.doesNotMatch(migration, /\bupdate\s+daycares\b/i);
  assert.doesNotMatch(migration, /d_d85jtifbkh2t/);
  const server = src("src/lib/server/qc-home-daycares.ts");
  const script = src("scripts/import-qc-home-daycares.mjs");
  assert.doesNotMatch(server, /sendSms|sendMail|sendTransactional|resend|twilio/i);
  assert.doesNotMatch(script, /sendSms|sendMail|sendTransactional|resend|twilio/i);
  assert.match(script, /--dry-run/);
  assert.match(script, /KIDEASE_ALLOW_QC_IMPORT/);
  assert.equal(qcHomePreviewFixtureAllowed({ QC_HOME_PREVIEW_FIXTURE: "1", VERCEL: "1" }), false);
  assert.equal(qcHomePreviewFixtureAllowed({ QC_HOME_PREVIEW_FIXTURE: "1" }), true);
  assert.equal(qcHomePreviewFixtureAllowed({}), false);
});
