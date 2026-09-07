import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  authorizedWebhook,
  mapEnvelopeStatus,
  parseConnectPayload,
  webhookUrlHasSecret,
} from "../src/lib/server/docusign-connect.ts";
import {
  contractPdfKey,
  defaultTemplateEnvName,
  defaultTemplateId,
  isPackKind,
  packDocumentBody,
  parsePackKind,
  signedPdfPath,
} from "../src/lib/docusign-packs.ts";
import { allowContentType, allowContractPdfType } from "../src/lib/server/r2.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("pack kinds and bilingual documents stay FR-CA", () => {
  assert.equal(isPackKind("enrolment_pack"), true);
  assert.equal(parsePackKind("nope"), "provider_agreement");
  assert.equal(defaultTemplateEnvName("enrolment_pack"), "DOCUSIGN_TEMPLATE_ENROLMENT_PACK");
  assert.equal(defaultTemplateId("provider_agreement", {}), null);
  assert.equal(
    defaultTemplateId("provider_agreement", { DOCUSIGN_TEMPLATE_PROVIDER_AGREEMENT: "  tmpl-1  " }),
    "tmpl-1",
  );
  const agreement = packDocumentBody("provider_agreement", {
    centreName: "Little Stars",
    city: "Winnipeg",
    province: "MB",
    signerEmail: "director@example.com",
  });
  const enrolment = packDocumentBody("enrolment_pack", {
    centreName: "Little Stars",
    city: "Winnipeg",
    province: "MB",
  });
  assert.match(agreement, /ENTENTE DU CENTRE PERMIS/);
  assert.match(agreement, /By signing in DocuSign/);
  assert.match(enrolment, /TROUSSE D’INSCRIPTION/);
  assert.match(enrolment, /profil KidEase/);
  assert.equal(signedPdfPath("ct_1"), "/api/contracts/ct_1/pdf");
  assert.equal(contractPdfKey("dc-1", "ct_2"), "contracts/dc-1/ct_2.pdf");
});

test("Connect HMAC accepts base64 or hex and rejects query secrets", () => {
  const secret = "test-webhook-secret";
  const body = '{"event":"envelope-completed","data":{"envelopeId":"env-1","envelopeSummary":{"status":"completed"}}}';
  const base64 = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const ok = new Request("https://www.kidease.ca/api/docusign/webhook", {
    headers: { "x-docusign-signature-1": base64 },
  });
  const okHex = new Request("https://www.kidease.ca/api/docusign/webhook", {
    headers: { "x-docusign-signature-1": hex },
  });
  const leaked = new Request(`https://www.kidease.ca/api/docusign/webhook?secret=${secret}`, {
    headers: { "x-docusign-signature-1": base64 },
  });
  const missing = new Request("https://www.kidease.ca/api/docusign/webhook");
  assert.equal(authorizedWebhook(ok, body, secret), true);
  assert.equal(authorizedWebhook(okHex, body, secret), true);
  assert.equal(authorizedWebhook(ok, body, ""), false);
  assert.equal(authorizedWebhook(leaked, body, secret), false);
  assert.equal(authorizedWebhook(missing, body, secret), false);
  assert.equal(webhookUrlHasSecret(leaked), true);
  assert.equal(webhookUrlHasSecret(ok), false);
  const parsed = parseConnectPayload(body);
  assert.equal(parsed?.envelopeId, "env-1");
  assert.equal(parsed?.status, "signed");
  assert.equal(mapEnvelopeStatus("delivered"), "viewed");
  assert.equal(parseConnectPayload("<DocuSignEnvelopeInformation><EnvelopeStatus><EnvelopeID>xml-9</EnvelopeID><Status>Completed</Status></EnvelopeStatus></DocuSignEnvelopeInformation>")?.envelopeId, "xml-9");
});

test("webhook and poll routes fail closed without query secrets", () => {
  const webhook = src("src/routes/api/docusign.webhook.ts");
  assert.match(webhook, /webhookUrlHasSecret/);
  assert.match(webhook, /DOCUSIGN_WEBHOOK_SECRET/);
  assert.match(webhook, /Method Not Allowed/);
  assert.doesNotMatch(webhook, /searchParams\.get\("secret"\)/);
  const poll = src("src/routes/api/docusign.poll.ts");
  assert.match(poll, /cronAuthorized/);
  assert.match(poll, /searchParams\.has\("secret"\)/);
  const pdf = src("src/routes/api/contracts.$id.pdf.ts");
  assert.match(pdf, /application\/pdf/);
  assert.match(pdf, /requireUserId/);
  assert.match(pdf, /provider_daycares/);
});

test("env example lists DocuSign names only and FEATURE_SMS stays off", () => {
  const envExample = src(".env.example");
  assert.match(envExample, /DOCUSIGN_INTEGRATION_KEY=/);
  assert.match(envExample, /DOCUSIGN_USER_ID=/);
  assert.match(envExample, /DOCUSIGN_ACCOUNT_ID=/);
  assert.match(envExample, /DOCUSIGN_PRIVATE_KEY=/);
  assert.match(envExample, /DOCUSIGN_WEBHOOK_SECRET=/);
  assert.match(envExample, /DOCUSIGN_TEMPLATE_PROVIDER_AGREEMENT=/);
  assert.match(envExample, /DOCUSIGN_TEMPLATE_ENROLMENT_PACK=/);
  assert.match(envExample, /FEATURE_SMS=0/);
  assert.doesNotMatch(envExample, /BEGIN (RSA )?PRIVATE KEY/);
  assert.doesNotMatch(envExample, /DOCUSIGN_WEBHOOK_SECRET=\S+/);
  const docs = src("docs/docusign.md");
  assert.match(docs, /JWT consent/);
  assert.match(docs, /api\/docusign\/webhook/);
  assert.match(docs, /query-string secrets/);
  assert.doesNotMatch(docs, /\/api\/docusign\/webhook\?/);
});

test("Send stays off unless DocuSign is live and photo allowlist stays images", () => {
  const contracts = src("src/components/admin-contracts.tsx");
  const copy = src("src/lib/docusign-copy.ts");
  assert.match(copy, /Send \(DocuSign off\)/);
  assert.match(contracts, /mode === "live"/);
  assert.match(contracts, /packEnrolment/);
  assert.throws(() => allowContentType("application/pdf"));
  assert.equal(allowContractPdfType("application/pdf"), "application/pdf");
});

test("legal copy names DocuSign in EN and FR", () => {
  const legal = src("src/lib/legal-copy.ts");
  assert.match(legal, /DocuSign, when centre paperwork is sent/);
  assert.match(legal, /DocuSign, lorsque les documents du centre sont envoyés/);
});
