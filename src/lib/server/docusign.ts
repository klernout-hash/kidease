import { createPrivateKey, createSign } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  contractPdfKey,
  defaultTemplateId,
  packEmailBlurb,
  packEmailSubject,
  parsePackKind,
  templateRoleName,
  type PackKind,
} from "@/lib/docusign-packs";
import {
  classifyDocusignFailure,
  listDocusignTemplatesFromApi,
  readDocusignOrNull,
  type DocusignTemplateList,
} from "@/lib/docusign-errors";
import {
  authorizedWebhook,
  mapEnvelopeStatus,
  parseConnectPayload,
} from "@/lib/server/docusign-connect";

export type DocusignMode = "live" | "demo";

export type EnvelopeResult = {
  mode: DocusignMode;
  envelopeId: string;
  signingUrl: string | null;
  status: string;
};

export type DocusignTemplate = {
  templateId: string;
  name: string;
};

type JwtConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  authBase: string;
  baseUri: string;
};

function env(name: string) {
  return (process.env[name] || "").trim();
}

function normalizePem(raw: string) {
  return raw.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
}

export function docusignConfig(): JwtConfig | null {
  const integrationKey = env("DOCUSIGN_INTEGRATION_KEY") || env("DOCUSIGN_CLIENT_ID");
  const userId = env("DOCUSIGN_USER_ID");
  const accountId = env("DOCUSIGN_ACCOUNT_ID");
  const privateKey = normalizePem(env("DOCUSIGN_PRIVATE_KEY"));
  if (!integrationKey || !userId || !accountId || !privateKey.includes("BEGIN")) return null;
  const demo = env("DOCUSIGN_ENV").toLowerCase() !== "production";
  return {
    integrationKey,
    userId,
    accountId,
    privateKey,
    authBase: env("DOCUSIGN_AUTH_BASE") || (demo ? "https://account-d.docusign.com" : "https://account.docusign.com"),
    baseUri: (env("DOCUSIGN_BASE_URI") || (demo ? "https://demo.docusign.net" : "https://na4.docusign.net")).replace(
      /\/$/,
      "",
    ),
  };
}

export function docusignMode(): DocusignMode {
  return docusignConfig() ? "live" : "demo";
}

export function appOrigin() {
  return (env("APP_ORIGIN") || env("VITE_APP_URL") || "https://www.kidease.ca").replace(/\/$/, "");
}

export function defaultTemplateIds() {
  return {
    provider_agreement: defaultTemplateId("provider_agreement"),
    enrolment_pack: defaultTemplateId("enrolment_pack"),
  };
}

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload: Record<string, unknown>, pem: string) {
  const data = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  return `${data}.${signer.sign(createPrivateKey(pem)).toString("base64url")}`;
}

async function accessToken(cfg: JwtConfig) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      iss: cfg.integrationKey,
      sub: cfg.userId,
      aud: cfg.authBase.replace(/^https?:\/\//, ""),
      iat: now,
      exp: now + 3500,
      scope: "signature impersonation",
    },
    cfg.privateKey,
  );
  const res = await fetch(`${cfg.authBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`DocuSign auth ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("DocuSign did not return an access token");
  return json.access_token;
}

async function ds<T>(cfg: JwtConfig, token: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init?.body && !(init.body instanceof Uint8Array)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${cfg.baseUri}/restapi/v2.1/accounts/${cfg.accountId}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DocuSign ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function dsBytes(cfg: JwtConfig, token: string, path: string) {
  const res = await fetch(`${cfg.baseUri}/restapi/v2.1/accounts/${cfg.accountId}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/pdf",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DocuSign ${res.status}: ${text.slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function webhookNotification() {
  return {
    url: `${appOrigin()}/api/docusign/webhook`,
    loggingEnabled: "true",
    requireAcknowledgment: "true",
    includeDocuments: "false",
    envelopeEvents: [
      { envelopeEventStatusCode: "sent" },
      { envelopeEventStatusCode: "delivered" },
      { envelopeEventStatusCode: "completed" },
      { envelopeEventStatusCode: "declined" },
      { envelopeEventStatusCode: "voided" },
    ],
    eventData: {
      version: "restv2.1",
      format: "json",
      includeData: ["recipients"],
    },
  };
}

export async function listDocusignTemplatesSafe(): Promise<DocusignTemplateList> {
  const cfg = docusignConfig();
  if (!cfg) return { templates: [], error: null };
  const listed = await listDocusignTemplatesFromApi(async () => {
    const token = await accessToken(cfg);
    const json = await ds<{ envelopeTemplates?: { templateId?: string; name?: string }[] }>(
      cfg,
      token,
      "/templates?count=80",
    );
    return (json.envelopeTemplates || [])
      .filter((row) => row.templateId)
      .map((row) => ({
        templateId: String(row.templateId),
        name: (row.name || row.templateId || "Template").trim(),
      }));
  });
  if (listed.error) {
    console.error("[docusign] list templates failed", listed.error.code, listed.error.message);
  }
  return listed;
}

export async function listDocusignTemplates(): Promise<DocusignTemplate[]> {
  const listed = await listDocusignTemplatesSafe();
  return listed.templates;
}

export async function createCentreEnvelope(input: {
  contractId: string;
  packKind?: PackKind;
  documentName: string;
  body: string;
  signerName: string;
  signerEmail: string;
  templateId?: string | null;
  centreName?: string;
}): Promise<EnvelopeResult> {
  const packKind = parsePackKind(input.packKind);
  const cfg = docusignConfig();
  if (!cfg) {
    return {
      mode: "demo",
      envelopeId: `demo_${input.contractId}`,
      signingUrl: `${appOrigin()}/sign/${input.contractId}`,
      status: "sent",
    };
  }

  let token: string;
  try {
    token = await accessToken(cfg);
  } catch (err) {
    console.error("[docusign] create envelope auth failed", err);
    throw new Error(classifyDocusignFailure(err).message);
  }
  const subject = packEmailSubject(packKind, input.centreName || input.documentName);
  const templateId = (input.templateId || "").trim();
  let created: { envelopeId: string; status?: string };
  try {
    created = templateId
    ? await ds<{ envelopeId: string; status?: string }>(cfg, token, "/envelopes", {
        method: "POST",
        body: JSON.stringify({
          emailSubject: subject,
          emailBlurb: packEmailBlurb(packKind),
          templateId,
          templateRoles: [
            {
              email: input.signerEmail,
              name: input.signerName,
              roleName: templateRoleName(),
            },
          ],
          eventNotification: webhookNotification(),
          status: "sent",
        }),
      })
    : await ds<{ envelopeId: string; status?: string }>(cfg, token, "/envelopes", {
        method: "POST",
        body: JSON.stringify({
          emailSubject: subject,
          emailBlurb: packEmailBlurb(packKind),
          documents: [
            {
              documentBase64: Buffer.from(input.body, "utf8").toString("base64"),
              name: input.documentName,
              fileExtension: "txt",
              documentId: "1",
            },
          ],
          recipients: {
            signers: [
              {
                email: input.signerEmail,
                name: input.signerName,
                recipientId: "1",
                tabs: {
                  signHereTabs: [
                    {
                      anchorString: "By signing in DocuSign",
                      anchorUnits: "pixels",
                      anchorXOffset: "0",
                      anchorYOffset: "20",
                    },
                  ],
                },
              },
            ],
          },
          eventNotification: webhookNotification(),
          status: "sent",
        }),
      });
  } catch (err) {
    console.error("[docusign] create envelope failed", err);
    throw new Error(classifyDocusignFailure(err).message);
  }

  return {
    mode: "live",
    envelopeId: created.envelopeId,
    signingUrl: null,
    status: created.status || "sent",
  };
}

export async function voidCentreEnvelope(envelopeId: string, reason = "Superseded by a new KidEase contract") {
  const cfg = docusignConfig();
  if (!cfg || envelopeId.startsWith("demo_")) return;
  const ok = await readDocusignOrNull(async () => {
    const token = await accessToken(cfg);
    await ds(cfg, token, `/envelopes/${envelopeId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "voided", voidedReason: reason }),
    });
    return true;
  });
  if (!ok) console.error("[docusign] void envelope failed", envelopeId);
}

export async function getEnvelopeStatus(envelopeId: string) {
  const cfg = docusignConfig();
  if (!cfg || envelopeId.startsWith("demo_")) return null;
  return readDocusignOrNull(async () => {
    const token = await accessToken(cfg);
    const json = await ds<{ status?: string; envelopeId?: string }>(cfg, token, `/envelopes/${envelopeId}`);
    return {
      envelopeId: json.envelopeId || envelopeId,
      status: mapEnvelopeStatus(json.status || ""),
      event: json.status || "poll",
    };
  });
}

export async function downloadCombinedPdf(envelopeId: string) {
  const cfg = docusignConfig();
  if (!cfg || envelopeId.startsWith("demo_")) return null;
  return readDocusignOrNull(async () => {
    const token = await accessToken(cfg);
    const body = await dsBytes(cfg, token, `/envelopes/${envelopeId}/documents/combined`);
    if (!body.byteLength) return null;
    return body;
  });
}

export async function persistSignedPdf(input: {
  contractId: string;
  daycareId: string;
  envelopeId: string;
}): Promise<{ key: string; bytes: number } | null> {
  if (!input.envelopeId || input.envelopeId.startsWith("demo_")) return null;
  const pdf = await downloadCombinedPdf(input.envelopeId);
  if (!pdf) return null;
  const key = contractPdfKey(input.daycareId, input.contractId);
  try {
    const { putContractPdf } = await import("@/lib/server/r2.server");
    const stored = await putContractPdf({ key, body: pdf });
    const sql = await getSql();
    await sql.query(
      `update daycare_contracts
          set signed_pdf_key = $2,
              signed_pdf_bytes = $3,
              updated_at = now()
        where id = $1`,
      [input.contractId, stored.key, stored.bytes],
    );
    return { key: stored.key, bytes: stored.bytes };
  } catch (err) {
    console.error("[docusign] store signed pdf failed", err);
    return null;
  }
}

export { authorizedWebhook, mapEnvelopeStatus, parseConnectPayload };

export async function applyEnvelopeEvent(input: { envelopeId: string; status: string; event: string }) {
  const sql = await getSql();
  const status = mapEnvelopeStatus(input.status || input.event);
  const viewed = status === "viewed" || status === "signed";
  const signed = status === "signed";
  const declined = status === "declined";
  await sql.query(
    `update daycare_contracts
       set status = $2,
           last_event = $3,
           viewed_at = case when $4 then coalesce(viewed_at, now()) else viewed_at end,
           signed_at = case when $5 then coalesce(signed_at, now()) else signed_at end,
           declined_at = case when $6 then coalesce(declined_at, now()) else declined_at end,
           updated_at = now()
     where envelope_id = $1`,
    [input.envelopeId, status, input.event.slice(0, 80), viewed, signed, declined],
  );
  if (signed) {
    const rows = await sql
      .query<{ id: string; daycare_id: string; signed_pdf_key: string | null }>(
        `select id, daycare_id, signed_pdf_key from daycare_contracts where envelope_id = $1 limit 1`,
        [input.envelopeId],
      )
      .catch(() => []);
    const row = rows[0];
    if (row && !row.signed_pdf_key) {
      await persistSignedPdf({
        contractId: row.id,
        daycareId: row.daycare_id,
        envelopeId: input.envelopeId,
      }).catch((err) => console.error("[docusign] persist after event failed", err));
    }
  }
  return { ok: true as const, envelopeId: input.envelopeId, status };
}

export async function pollOpenEnvelopes(limit = 25) {
  const cfg = docusignConfig();
  if (!cfg) return { ok: true as const, checked: 0, updated: 0, stored: 0 };
  const sql = await getSql();
  const rows = await sql
    .query<{ id: string; daycare_id: string; envelope_id: string; status: string; signed_pdf_key: string | null }>(
      `select id, daycare_id, envelope_id, status, signed_pdf_key
         from daycare_contracts
        where envelope_id is not null
          and envelope_id not like 'demo_%'
          and (
            status in ('sent', 'viewed')
            or (status = 'signed' and signed_pdf_key is null)
          )
        order by updated_at asc
        limit $1`,
      [limit],
    )
    .catch(() => []);

  let updated = 0;
  let stored = 0;
  for (const row of rows) {
    try {
      const remote = await getEnvelopeStatus(row.envelope_id);
      if (remote && remote.status !== row.status) {
        await applyEnvelopeEvent(remote);
        updated += 1;
      } else if (row.status === "signed" && !row.signed_pdf_key) {
        const saved = await persistSignedPdf({
          contractId: row.id,
          daycareId: row.daycare_id,
          envelopeId: row.envelope_id,
        });
        if (saved) stored += 1;
      } else if (remote?.status === "signed" && !row.signed_pdf_key) {
        const saved = await persistSignedPdf({
          contractId: row.id,
          daycareId: row.daycare_id,
          envelopeId: row.envelope_id,
        });
        if (saved) stored += 1;
      }
    } catch (err) {
      console.error("[docusign] poll envelope failed", row.envelope_id, err);
    }
  }
  return { ok: true as const, checked: rows.length, updated, stored };
}

export async function loadSignedPdfBytes(input: {
  contractId: string;
  daycareId: string;
  envelopeId: string | null;
  signedPdfKey: string | null;
}): Promise<{ body: Buffer; filename: string } | null> {
  if (input.signedPdfKey) {
    try {
      const { getR2Object } = await import("@/lib/server/r2.server");
      const object = await getR2Object(input.signedPdfKey);
      return { body: object.body, filename: `${input.contractId}.pdf` };
    } catch (err) {
      console.error("[docusign] r2 signed pdf miss", err);
    }
  }
  if (!input.envelopeId || input.envelopeId.startsWith("demo_")) return null;
  const pdf = await downloadCombinedPdf(input.envelopeId);
  if (!pdf) return null;
  await persistSignedPdf({
    contractId: input.contractId,
    daycareId: input.daycareId,
    envelopeId: input.envelopeId,
  }).catch((err) => console.error("[docusign] cache after download failed", err));
  return { body: pdf, filename: `${input.contractId}.pdf` };
}
