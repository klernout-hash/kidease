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
import {
  DOCUSIGN_CONSENT_MESSAGE,
  classifyDocusignFailure,
  listDocusignTemplatesFromApi,
  readDocusignOrNull,
} from "../src/lib/docusign-errors.ts";
import {
  centreEnvelopeCreateBody,
  docusignBrandId,
  withEnvelopeBrand,
} from "../src/lib/docusign-envelope.ts";
import {
  docusignConfig,
  docusignConfigIssues,
  docusignMode,
  normalizeDocusignPem,
} from "../src/lib/docusign-config.ts";
import { formatDocusignEnvIssues } from "../src/lib/docusign-copy.ts";
import { runtimeEnv, runtimeProcessEnv } from "../src/lib/runtime-env.ts";

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
  assert.match(envExample, /DOCUSIGN_BRAND_ID=/);
  assert.match(envExample, /FEATURE_SMS=0/);
  assert.doesNotMatch(envExample, /BEGIN (RSA )?PRIVATE KEY/);
  assert.doesNotMatch(envExample, /DOCUSIGN_WEBHOOK_SECRET=\S+/);
  assert.doesNotMatch(envExample, /DOCUSIGN_BRAND_ID=\S+/);
  const docs = src("docs/docusign.md");
  assert.match(docs, /JWT consent/);
  assert.match(docs, /api\/docusign\/webhook/);
  assert.match(docs, /query-string secrets/);
  assert.match(docs, /DOCUSIGN_BRAND_ID/);
  assert.match(docs, /brandId/);
  assert.doesNotMatch(docs, /\/api\/docusign\/webhook\?/);
});

test("envelope create includes brandId only when DOCUSIGN_BRAND_ID is set", () => {
  assert.equal(docusignBrandId({}), "");
  assert.equal(docusignBrandId({ DOCUSIGN_BRAND_ID: "  " }), "");
  assert.equal(docusignBrandId({ DOCUSIGN_BRAND_ID: "  brand-guid  " }), "brand-guid");
  assert.equal(withEnvelopeBrand({ emailSubject: "Hi" }, {}).brandId, undefined);
  assert.equal(withEnvelopeBrand({ emailSubject: "Hi" }, { DOCUSIGN_BRAND_ID: "" }).brandId, undefined);
  assert.equal(
    withEnvelopeBrand({ emailSubject: "Hi" }, { DOCUSIGN_BRAND_ID: " brand-guid " }).brandId,
    "brand-guid",
  );

  const shared = {
    documentName: "KidEase Licensed Centre Agreement",
    body: "By signing in DocuSign",
    signerName: "Director",
    signerEmail: "director@example.com",
    centreName: "Little Stars",
  };
  const branded = { DOCUSIGN_BRAND_ID: "brand-guid" };
  const template = centreEnvelopeCreateBody({ ...shared, templateId: "tmpl-1" }, branded);
  const document = centreEnvelopeCreateBody({ ...shared, templateId: "" }, branded);
  const unbrandedTemplate = centreEnvelopeCreateBody({ ...shared, templateId: "tmpl-1" }, {});
  const unbrandedDocument = centreEnvelopeCreateBody({ ...shared, templateId: null }, {});

  assert.equal(template.brandId, "brand-guid");
  assert.equal(template.templateId, "tmpl-1");
  assert.equal(document.brandId, "brand-guid");
  assert.ok(Array.isArray(document.documents));
  assert.equal(unbrandedTemplate.brandId, undefined);
  assert.equal(unbrandedDocument.brandId, undefined);
  assert.equal(Object.hasOwn(unbrandedTemplate, "brandId"), false);
  assert.equal(Object.hasOwn(unbrandedDocument, "brandId"), false);

  const server = src("src/lib/server/docusign.ts");
  const envelope = src("src/lib/docusign-envelope.ts");
  assert.match(server, /centreEnvelopeCreateBody/);
  assert.match(envelope, /DOCUSIGN_BRAND_ID/);
  assert.match(envelope, /brandId/);
  assert.doesNotMatch(server, /8d229b55-e59a-49b5-a380-67bd91d7ef1d/);
  assert.doesNotMatch(envelope, /8d229b55-e59a-49b5-a380-67bd91d7ef1d/);
});

const SAMPLE_PEM = "-----BEGIN RSA PRIVATE KEY-----\\nMIIB\\n-----END RSA PRIVATE KEY-----";

function jwtEnv(overrides = {}) {
  return {
    DOCUSIGN_INTEGRATION_KEY: "ik-1",
    DOCUSIGN_USER_ID: "user-1",
    DOCUSIGN_ACCOUNT_ID: "acct-1",
    DOCUSIGN_PRIVATE_KEY: SAMPLE_PEM,
    ...overrides,
  };
}

test("docusignConfig is live when JWT names are set and PEM has BEGIN", () => {
  const env = jwtEnv();
  assert.equal(docusignMode(env), "live");
  const cfg = docusignConfig(env);
  assert.ok(cfg);
  assert.equal(cfg.integrationKey, "ik-1");
  assert.equal(cfg.userId, "user-1");
  assert.equal(cfg.accountId, "acct-1");
  assert.match(cfg.privateKey, /BEGIN RSA PRIVATE KEY/);
  assert.match(cfg.privateKey, /\n/);
  assert.deepEqual(docusignConfigIssues(env), []);
});

test("docusignConfig accepts DOCUSIGN_CLIENT_ID and quoted / base64 PEM", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----";
  const quoted = jwtEnv({
    DOCUSIGN_INTEGRATION_KEY: "",
    DOCUSIGN_CLIENT_ID: " client-id ",
    DOCUSIGN_PRIVATE_KEY: `"${SAMPLE_PEM}\\n"`,
  });
  assert.equal(docusignMode(quoted), "live");
  assert.equal(docusignConfig(quoted)?.integrationKey, "client-id");

  const b64 = jwtEnv({
    DOCUSIGN_PRIVATE_KEY: Buffer.from(pem, "utf8").toString("base64"),
  });
  assert.equal(docusignMode(b64), "live");
  assert.match(docusignConfig(b64)?.privateKey || "", /BEGIN PRIVATE KEY/);
});

test("docusignConfig is demo and names the specific missing key", () => {
  assert.equal(docusignMode({}), "demo");
  const empty = docusignConfigIssues({});
  assert.deepEqual(
    empty.map((row) => row.name),
    ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_PRIVATE_KEY"],
  );
  assert.ok(empty.every((row) => row.reason === "missing"));

  const noUser = docusignConfigIssues(jwtEnv({ DOCUSIGN_USER_ID: "  " }));
  assert.deepEqual(noUser, [{ name: "DOCUSIGN_USER_ID", reason: "missing" }]);
  assert.equal(docusignMode(jwtEnv({ DOCUSIGN_USER_ID: "" })), "demo");

  const badPem = docusignConfigIssues(jwtEnv({ DOCUSIGN_PRIVATE_KEY: "not-a-pem" }));
  assert.deepEqual(badPem, [{ name: "DOCUSIGN_PRIVATE_KEY", reason: "not_pem" }]);
  assert.equal(docusignMode(jwtEnv({ DOCUSIGN_PRIVATE_KEY: "not-a-pem" })), "demo");

  assert.equal(formatDocusignEnvIssues("en", noUser), "Missing: DOCUSIGN_USER_ID.");
  assert.match(formatDocusignEnvIssues("en", badPem), /BEGIN/);
  assert.doesNotMatch(formatDocusignEnvIssues("en", badPem), /not-a-pem/);
  assert.match(formatDocusignEnvIssues("fr", noUser), /DOCUSIGN_USER_ID/);
});

test("runtimeEnv reads live process env and ignores a mocked snapshot when injected", () => {
  const probe = "KIDEASE_RUNTIME_ENV_PROBE";
  const prev = process.env[probe];
  process.env[probe] = "  live-value  ";
  try {
    assert.equal(runtimeEnv(probe), "live-value");
    assert.equal(runtimeEnv(probe, { [probe]: "injected" }), "injected");
    assert.equal(runtimeEnv(probe, {}), "");
    assert.equal(runtimeProcessEnv()[probe], "  live-value  ");
  } finally {
    if (prev === undefined) delete process.env[probe];
    else process.env[probe] = prev;
  }

  const runtimeSrc = src("src/lib/runtime-env.ts");
  const runtimeCode = runtimeSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/'(?:\\.|[^'\\])*'/g, "")
    .replace(/"(?:\\.|[^"\\])*"/g, "");
  assert.doesNotMatch(runtimeCode, /process\.env/);
  assert.match(runtimeSrc, /globalThis/);
  assert.match(runtimeSrc, /Function\(/);

  const configSrc = src("src/lib/docusign-config.ts");
  assert.doesNotMatch(configSrc, /process\.env/);
  assert.match(configSrc, /runtimeEnv/);
  const server = src("src/lib/server/docusign.ts");
  assert.match(server, /docusign-config/);
  assert.doesNotMatch(server, /process\.env\[name\]/);
  const vite = src("vite.config.ts");
  assert.match(vite, /keepProcessEnv:\s*true/);
  const copy = src("src/lib/docusign-copy.ts");
  assert.match(copy, /formatDocusignEnvIssues/);
  assert.match(src("src/components/admin-contracts.tsx"), /docusign-missing-env/);
});

test("normalizeDocusignPem keeps BEGIN after oneline Vercel pastes", () => {
  assert.match(normalizeDocusignPem(SAMPLE_PEM), /BEGIN RSA PRIVATE KEY/);
  assert.match(normalizeDocusignPem(`"${SAMPLE_PEM}"`), /BEGIN RSA PRIVATE KEY/);
  assert.equal(normalizeDocusignPem("not-a-pem").includes("BEGIN"), false);
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

test("DocuSign JWT auth failure returns an empty list and never throws", async () => {
  const authErr = new Error(
    'DocuSign auth 400: {"error":"invalid_grant","error_description":"user_not_found"}',
  );
  assert.equal(classifyDocusignFailure(authErr).code, "consent");
  assert.equal(classifyDocusignFailure(authErr).message, DOCUSIGN_CONSENT_MESSAGE);
  const listed = await listDocusignTemplatesFromApi(async () => {
    throw authErr;
  });
  assert.deepEqual(listed.templates, []);
  assert.equal(listed.error?.code, "consent");
  assert.equal(listed.error?.message, DOCUSIGN_CONSENT_MESSAGE);
  const status = await readDocusignOrNull(async () => {
    throw authErr;
  });
  assert.equal(status, null);
  const contracts = src("src/lib/server/contracts.ts");
  assert.match(contracts, /listDocusignTemplatesSafe/);
  assert.match(contracts, /docusignError/);
  assert.match(contracts, /docusignEnvIssues/);
  assert.match(contracts, /emptyAdminContractsPayload/);
  assert.match(src("src/components/admin-contracts.tsx"), /docusign-consent-banner/);
  assert.match(src("src/lib/docusign-copy.ts"), /DocuSign not connected — finish JWT consent/);
  assert.match(src(".env.example"), /FEATURE_SMS=0/);
  assert.doesNotMatch(src(".env.example"), /^FEATURE_SMS=1$/m);
});

test("legal copy names DocuSign in EN and FR", () => {
  const legal = src("src/lib/legal-copy.ts");
  assert.match(legal, /DocuSign, when centre paperwork is sent/);
  assert.match(legal, /DocuSign, lorsque les documents du centre sont envoyés/);
});
