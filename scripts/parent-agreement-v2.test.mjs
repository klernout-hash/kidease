import assert from "node:assert/strict";
import { test } from "node:test";
import { centreEnvelopeCreateBody } from "../src/lib/docusign-envelope.ts";
import { defaultAgreementTerms } from "../src/lib/parent-agreement.ts";
import { agreementTemplateV2, DIRECTOR_ANCHORS, guardianAnchors, parentAgreementDocumentV2, PROVINCE_NOTES } from "../src/lib/parent-agreement-v2.ts";

const terms = { ...defaultAgreementTerms(), feeEn: "$500", feeFr: "500 $" };
const base = { centreName: "Little Stars", address: "12 Elm St", city: "Winnipeg", provinceCode: "MB", licence: "L-1", photoUrl: null, parentName: "Pat Parent", childName: "Kid", childBirthdate: "2023-01-01", directorName: "Dee Director", startDate: "2026-12-01", isHomeDaycare: false };

test("v2 is off by default", () => {
  assert.equal(agreementTemplateV2({}), false);
  assert.equal(agreementTemplateV2({ AGREEMENT_TEMPLATE: "v2" }), true);
});
test("all 13 jurisdictions have a note", () => assert.equal(Object.keys(PROVINCE_NOTES).length, 13));
test("anchors and required sections", () => {
  const html = parentAgreementDocumentV2(terms, { ...base, guardians: [{ name: "A" }, { name: "B" }] });
  for (const a of [guardianAnchors(0).sign, guardianAnchors(1).sign, guardianAnchors(1).date, DIRECTOR_ANCHORS.sign, DIRECTOR_ANCHORS.initial]) assert.ok(html.includes(a), a);
  for (const s of ["custody", "Immunization", "Emergency medical", "separate opt-in", "privacy@kidease.ca", "paper copy", "Electronic Record and Signature Disclosure", "licensing office", "not a party", "Base fee before reduction"]) assert.ok(html.includes(s), s);
  assert.ok(!/endorsed by|approved by the government/i.test(html.replace("no government has endorsed", "")));
  assert.ok(!/\d{7,}\s*(Manitoba|Ontario)?\s*(Ltd|Inc)/i.test(html));
});
test("home daycare hides street", () => {
  const html = parentAgreementDocumentV2(terms, { ...base, isHomeDaycare: true });
  assert.ok(!html.includes("12 Elm St"));
  assert.ok(html.includes("Winnipeg"));
});
test("Quebec is French first and records language; subsidized links Ministère form", () => {
  const html = parentAgreementDocumentV2(terms, { ...base, provinceCode: "QC", city: "Montréal", quebecSubsidized: true });
  assert.ok(html.includes('<html lang="fr">'));
  assert.ok(html.indexOf("Entente d’inscription") < html.indexOf("Enrolment agreement"));
  assert.ok(html.includes("présentée en premier"));
  assert.ok(html.includes("ministère de la Famille"));
  assert.ok(html.includes("/qcmfa/"));
});
test("envelope carries initial and date tabs", () => {
  const body = centreEnvelopeCreateBody({ documentName: "x", body: "x", signerName: "a", signerEmail: "a@x.ca", signers: [{ email: "a@x.ca", name: "a", recipientId: "1", routingOrder: "1", anchorString: "/pg1sig/", initialAnchor: "/pg1ini/", dateAnchor: "/pg1date/" }] }, {});
  const tabs = body.recipients.signers[0].tabs;
  assert.equal(tabs.initialHereTabs[0].anchorString, "/pg1ini/");
  assert.equal(tabs.dateSignedTabs[0].anchorString, "/pg1date/");
});
