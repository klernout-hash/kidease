import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { centreEnvelopeCreateBody } from "../src/lib/docusign-envelope.ts";
import { isPackKind, parsePackKind } from "../src/lib/docusign-packs.ts";
import { parentAgreementEnabled } from "../src/lib/features.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  agreementError,
  agreementFeeIsPublic,
  agreementPhotoUrl,
  agreementStatusLabel,
  canViewParentAgreement,
  defaultAgreementTerms,
  lawClause,
  normalizeAgreementTerms,
  parentAgreementDocument,
  parentAgreementStatusFromConnect,
  parentAgreementSubject,
  sendAgreementAction,
} from "../src/lib/parent-agreement.ts";
import { parseConnectPayload } from "../src/lib/server/docusign-connect.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const parties = {
  centreName: "Little Stars",
  address: "12 River Ave",
  city: "Winnipeg",
  provinceCode: "MB",
  licence: "MB-100",
  photoUrl: null,
  parentName: "Amina B.",
  childName: "Noah B.",
  childBirthdate: "2022-04-03",
  directorName: "Priya S.",
  startDate: "2026-09-01",
};

function readyTerms() {
  return normalizeAgreementTerms({
    ...defaultAgreementTerms(),
    feeEn: "$840 per month",
    feeFr: "840 $ par mois",
    clauses: [{ en: "Outdoor time follows the weather.", fr: "Le temps dehors suit la météo." }],
  });
}

test("parent agreement flag stays off unless both switches are on", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PARENT_AGREEMENT, false);
  assert.equal(parentAgreementEnabled({}), false);
  assert.equal(parentAgreementEnabled({ FEATURE_PARENT_AGREEMENT: "1" }), false);
  assert.equal(parentAgreementEnabled({ FEATURE_ENROLMENT_ESIGN: "1" }), false);
  assert.equal(
    parentAgreementEnabled({ FEATURE_PARENT_AGREEMENT: "1", FEATURE_ENROLMENT_ESIGN: "1" }),
    true,
  );
  assert.match(src(".env.example"), /^FEATURE_PARENT_AGREEMENT=0$/m);
  assert.doesNotMatch(src(".env.example"), /^FEATURE_PARENT_AGREEMENT=1$/m);
  assert.equal(isPackKind("parent_enrolment_agreement"), true);
  assert.equal(parsePackKind("parent_enrolment_agreement"), "parent_enrolment_agreement");
});

test("agreement text is bilingual, branded, and limited to the centre province", () => {
  const defaults = defaultAgreementTerms();
  assert.match(defaults.hoursFr, /vendredi/);
  assert.match(defaults.noticeEn, /30 days/);
  const body = parentAgreementDocument(readyTerms(), parties);
  assert.match(body, /Little Stars/);
  assert.match(body, /MB-100/);
  assert.match(body, /Amina B\./);
  assert.match(body, /Noah B\./);
  assert.match(body, /2022-04-03/);
  assert.match(body, /2026-09-01/);
  assert.match(body, /laws of Manitoba, Canada/);
  assert.match(body, /Manitoba \(Canada\)/);
  assert.match(body, /Sent via KidEase/);
  assert.match(body, /Envoyé via KidEase/);
  assert.match(body, /Parent signature \/ Signature du parent/);
  assert.match(body, /Centre signature \/ Signature du centre/);
  assert.match(body, /not a public listing price/);
  assert.match(body, /Outdoor time follows the weather/);
  assert.doesNotMatch(body, /<img/);
  assert.doesNotMatch(body, /Photo pending/);
  assert.doesNotMatch(body, /United States/);
  assert.doesNotMatch(body, /subscription/i);
  assert.equal(agreementFeeIsPublic(), false);
  assert.equal(lawClause("NY"), null);
  assert.match(lawClause("QC").fr, /Québec/);
  assert.throws(() => parentAgreementDocument(readyTerms(), { ...parties, provinceCode: "NY" }), /province_required/);
  const escaped = parentAgreementDocument(
    normalizeAgreementTerms({ ...readyTerms(), clauses: [{ en: "<script>alert(1)</script>", fr: "Texte" }] }),
    parties,
  );
  assert.match(escaped, /&lt;script&gt;/);
  assert.doesNotMatch(escaped, /<script>/);
  const withPhoto = parentAgreementDocument(readyTerms(), {
    ...parties,
    photoUrl: "https://cdn.kidease.ca/photos/little-stars-logo.webp",
  });
  assert.match(withPhoto, /little-stars-logo\.webp/);
  assert.match(withPhoto, /alt="Little Stars"/);
  assert.equal(
    agreementPhotoUrl("https://www.kidease.ca", "/photos/community.jpg,/photos/little-stars-logo.webp"),
    "https://www.kidease.ca/photos/little-stars-logo.webp",
  );
  assert.equal(agreementPhotoUrl("https://www.kidease.ca", "/photos/community.jpg"), null);
  assert.equal(parentAgreementSubject("Little Stars", "Noah"), "Please sign: Enrolment agreement: Little Stars — Noah");
});

test("status, access, and the two-signer envelope stay on the parent agreement", () => {
  assert.equal(parentAgreementStatusFromConnect({ envelopeStatus: "sent" }), "sent");
  assert.equal(
    parentAgreementStatusFromConnect({
      envelopeStatus: "sent",
      signers: [{ recipientId: "1", routingOrder: "1", status: "completed" }],
    }),
    "parent_signed",
  );
  assert.equal(parentAgreementStatusFromConnect({ envelopeStatus: "completed" }), "completed");
  assert.equal(
    parentAgreementStatusFromConnect({
      envelopeStatus: "signed",
      signers: [{ recipientId: "1", status: "completed" }],
    }),
    "parent_signed",
  );
  assert.equal(parentAgreementStatusFromConnect({ envelopeStatus: "voided" }), "void");
  assert.equal(agreementStatusLabel("parent_signed", "fr"), "Parent a signé");
  assert.equal(agreementStatusLabel("void", "en"), "Void");
  assert.equal(sendAgreementAction(null, true), "send");
  assert.equal(sendAgreementAction("sent", true), "wait");
  assert.equal(sendAgreementAction("completed", true), "download");
  assert.equal(sendAgreementAction("void", true), "send");
  assert.equal(sendAgreementAction("sent", false), "hidden");
  assert.equal(
    canViewParentAgreement({
      viewerId: "parent",
      parentUserId: "parent",
      centreUserIds: ["director"],
      coparentUserIds: ["co"],
      coparentFlag: false,
    }),
    true,
  );
  assert.equal(
    canViewParentAgreement({
      viewerId: "director",
      parentUserId: "parent",
      centreUserIds: ["director"],
      coparentUserIds: ["co"],
      coparentFlag: false,
    }),
    true,
  );
  assert.equal(
    canViewParentAgreement({
      viewerId: "co",
      parentUserId: "parent",
      centreUserIds: ["director"],
      coparentUserIds: ["co"],
      coparentFlag: false,
    }),
    false,
  );
  assert.equal(
    canViewParentAgreement({
      viewerId: "co",
      parentUserId: "parent",
      centreUserIds: ["director"],
      coparentUserIds: ["co"],
      coparentFlag: true,
    }),
    true,
  );
  assert.equal(
    canViewParentAgreement({
      viewerId: "stranger",
      parentUserId: "parent",
      centreUserIds: ["director"],
      coparentUserIds: ["co"],
      coparentFlag: true,
    }),
    false,
  );
  const payload = JSON.stringify({
    event: "recipient-completed",
    data: {
      envelopeId: "env-parent",
      envelopeSummary: {
        status: "sent",
        recipients: { signers: [{ recipientId: "1", routingOrder: "1", status: "completed" }] },
      },
    },
  });
  const parsed = parseConnectPayload(payload);
  assert.equal(parsed.envelopeId, "env-parent");
  assert.equal(parsed.signers[0].status, "completed");
  assert.equal(
    parentAgreementStatusFromConnect({ envelopeStatus: parsed.status, signers: parsed.signers }),
    "parent_signed",
  );
  const envelope = centreEnvelopeCreateBody(
    {
      packKind: "parent_enrolment_agreement",
      documentName: "Enrolment agreement",
      body: "<p>Parent signature / Signature du parent</p>",
      signerName: "Amina B.",
      signerEmail: "parent@example.com",
      centreName: "Little Stars",
      fileExtension: "html",
      emailSubject: "Please sign: Enrolment agreement: Little Stars — Noah",
      signers: [
        {
          email: "parent@example.com",
          name: "Amina B.",
          recipientId: "1",
          routingOrder: "1",
          anchorString: "Parent signature / Signature du parent",
          roleName: "Parent",
        },
        {
          email: "director@example.com",
          name: "Priya S.",
          recipientId: "2",
          routingOrder: "2",
          anchorString: "Centre signature / Signature du centre",
          roleName: "Director",
        },
      ],
    },
    { DOCUSIGN_BRAND_ID: "brand-guid" },
  );
  assert.equal(envelope.brandId, "brand-guid");
  assert.equal(envelope.documents[0].fileExtension, "html");
  assert.equal(envelope.recipients.signers.length, 2);
  assert.equal(envelope.recipients.signers[0].routingOrder, "1");
  assert.equal(envelope.recipients.signers[1].email, "director@example.com");
  assert.match(agreementError("docusign_off", "fr"), /DocuSign/);
});

test("the fee stays out of public listing code and send does not add another message", () => {
  const server = src("src/lib/server/parent-agreement.ts");
  const panel = src("src/components/parent-agreement-panel.tsx");
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(server, /createCentreEnvelope/);
  assert.match(server, /parentAgreementEnabled/);
  assert.doesNotMatch(server, /notifyPlatform|sendMail|sendSms/);
  assert.match(panel, /Send agreement/);
  assert.match(panel, /not become the public listing price/);
  assert.doesNotMatch(panel, /subscription|sponsored|free forever/i);
  assert.doesNotMatch(listing, /centre_agreement_terms|parent_enrolment_agreement/);
  assert.match(src("src/routes/api/contracts.$id.pdf.ts"), /parentAgreementReadable/);
  assert.match(src("migrations/0158_parent_enrolment_agreement.sql"), /parent_enrolment_agreements/);
});
