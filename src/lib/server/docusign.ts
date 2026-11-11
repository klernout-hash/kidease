import { createPrivateKey, createSign } from "node:crypto";
import { getSql } from "@/lib/db";
import { envFlagOn } from "@/lib/flags";
import { centreEnvelopeCreateBody, type EnvelopeSignerInput } from "@/lib/docusign-envelope";
import { PARENT_AGREEMENT_PACK, parentAgreementStatusFromConnect } from "@/lib/parent-agreement";
import {
  contractPdfKey,
  defaultTemplateId,
  type PackKind,
} from "@/lib/docusign-packs";
import {
  classifyDocusignFailure,
  docusignRateLimitIssue,
  listDocusignTemplatesFromApi,
  readDocusignOrNull,
  type DocusignTemplateList,
} from "@/lib/docusign-errors";
import {
  cachedDocusignTemplates,
  docusignIsRateLimited,
  listDocusignTemplatesCached,
  readFreshDocusignTemplateList,
  rememberDocusignRateLimit,
} from "@/lib/docusign-template-cache";
import {
  authorizedWebhook,
  mapEnvelopeStatus,
  firstViewedAt,
  parseConnectPayload,
  signersViewed,
} from "@/lib/server/docusign-connect";
import {
  docusignConfig,
  docusignMode,
  type DocusignJwtConfig as JwtConfig,
  type DocusignMode,
} from "@/lib/docusign-config";
import { runtimeEnv, runtimeProcessEnv } from "@/lib/runtime-env";

export type { DocusignMode };
export { docusignConfig, docusignMode };

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

export function appOrigin() {
  return (runtimeEnv("APP_ORIGIN") || runtimeEnv("VITE_APP_URL") || "https://www.kidease.ca").replace(/\/$/, "");
}

export function defaultTemplateIds() {
  const env = runtimeProcessEnv();
  return {
    provider_agreement: defaultTemplateId("provider_agreement", env),
    enrolment_pack: defaultTemplateId("enrolment_pack", env),
    parent_enrolment_agreement: defaultTemplateId("parent_enrolment_agreement", env),
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
  if (!res.ok) {
    const err = new Error(`DocuSign auth ${res.status}: ${await res.text()}`);
    if (classifyDocusignFailure(err).code === "rate_limit") rememberDocusignRateLimit();
    throw err;
  }
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
  if (!res.ok) {
    const err = new Error(`DocuSign ${res.status}: ${text.slice(0, 500)}`);
    if (res.status === 429 || classifyDocusignFailure(err).code === "rate_limit") {
      rememberDocusignRateLimit();
    }
    throw err;
  }
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
    const err = new Error(`DocuSign ${res.status}: ${text.slice(0, 500)}`);
    if (res.status === 429 || classifyDocusignFailure(err).code === "rate_limit") {
      rememberDocusignRateLimit();
    }
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function listDocusignTemplatesSafe(): Promise<DocusignTemplateList> {
  const cached = readFreshDocusignTemplateList();
  if (cached) return cached;
  if (docusignIsRateLimited()) {
    return {
      templates: cachedDocusignTemplates(),
      error: docusignRateLimitIssue(),
    };
  }
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
  const next = listDocusignTemplatesCached(listed);
  if (next.error) {
    console.error("[docusign] list templates failed", next.error.code, next.error.message);
  }
  return next;
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
  signers?: EnvelopeSignerInput[];
  fileExtension?: string;
  emailSubject?: string;
  emailBlurb?: string;
}): Promise<EnvelopeResult> {
  const cfg = docusignConfig();
  if (!cfg) {
    if (input.packKind === PARENT_AGREEMENT_PACK) {
      throw new Error("agreement:docusign_off");
    }
    return {
      mode: "demo",
      envelopeId: `demo_${input.contractId}`,
      signingUrl: `${appOrigin()}/sign/${input.contractId}`,
      status: "sent",
    };
  }
  // Feature on is not a live send. No DocuSign envelope until Kyle sets the live flag.
  if (!envFlagOn(process.env.FEATURE_ENROLMENT_ESIGN_LIVE)) {
    return {
      mode: "demo",
      envelopeId: `demo_${input.contractId}`,
      signingUrl: `${appOrigin()}/sign/${input.contractId}`,
      status: "sent",
    };
  }
  if (docusignIsRateLimited()) {
    throw new Error(docusignRateLimitIssue().message);
  }

  let token: string;
  try {
    token = await accessToken(cfg);
  } catch (err) {
    console.error("[docusign] create envelope auth failed", err);
    throw classifiedDocusignError(err);
  }
  let created: { envelopeId: string; status?: string };
  try {
    created = await ds<{ envelopeId: string; status?: string }>(cfg, token, "/envelopes", {
      method: "POST",
      body: JSON.stringify(centreEnvelopeCreateBody(input)),
    });
  } catch (err) {
    console.error("[docusign] create envelope failed", err);
    throw classifiedDocusignError(err);
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

export async function getEnvelopeProgress(envelopeId: string): Promise<{
  envelopeId: string;
  status: string;
  event: string;
  signers: { recipientId: string; routingOrder: string; status: string; deliveredDateTime?: string }[];
} | null> {
  const cfg = docusignConfig();
  if (!cfg || envelopeId.startsWith("demo_")) return null;
  return readDocusignOrNull(async () => {
    const token = await accessToken(cfg);
    const json = await ds<{
      status?: string;
      envelopeId?: string;
      recipients?: {
        signers?: { recipientId?: string; routingOrder?: string; status?: string; deliveredDateTime?: string }[];
      };
    }>(cfg, token, `/envelopes/${encodeURIComponent(envelopeId)}?include=recipients`);
    return {
      envelopeId: json.envelopeId || envelopeId,
      status: json.status || "",
      event: json.status || "poll",
      signers: (json.recipients?.signers || []).map((signer) => ({
        recipientId: String(signer.recipientId || ""),
        routingOrder: String(signer.routingOrder || ""),
        status: String(signer.status || ""),
        ...(signer.deliveredDateTime ? { deliveredDateTime: String(signer.deliveredDateTime) } : {}),
      })),
    };
  });
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

export async function applyEnvelopeEvent(input: {
  envelopeId: string;
  status: string;
  event: string;
  signers?: { recipientId?: string; routingOrder?: string; status?: string; deliveredDateTime?: string }[];
}) {
  const sql = await getSql();
  const status = mapEnvelopeStatus(input.status || input.event);
  // A multi-signer envelope stays "sent" until everyone has opened it, so
  // also count a signer-level delivered/completed as viewed.
  // Connect payloads are sent without recipient data, so read signers from
  // the API when the event did not carry them.
  let signers = input.signers;
  if (!signers?.length && !input.envelopeId.startsWith("demo_")) {
    const progress = await getEnvelopeProgress(input.envelopeId).catch(() => null);
    if (progress?.signers?.length) signers = progress.signers;
  }
  const viewed = status === "viewed" || status === "signed" || signersViewed(signers);
  const viewedAt = firstViewedAt(signers);
  const signed = status === "signed";
  const declined = status === "declined";
  await sql.query(
    `update daycare_contracts
       set status = $2,
           last_event = $3,
           viewed_at = case when $4 then coalesce(viewed_at, $7::timestamptz, now()) else viewed_at end,
           signed_at = case when $5 then coalesce(signed_at, now()) else signed_at end,
           declined_at = case when $6 then coalesce(declined_at, now()) else declined_at end,
           updated_at = now()
     where envelope_id = $1`,
    [input.envelopeId, status, input.event.slice(0, 80), viewed, signed, declined, viewedAt],
  );
  const rows = await sql
    .query<{ id: string; daycare_id: string; pack_kind: string | null; signed_pdf_key: string | null }>(
      `select id, daycare_id, pack_kind, signed_pdf_key from daycare_contracts where envelope_id = $1 limit 1`,
      [input.envelopeId],
    )
    .catch(() => []);
  const row = rows[0];
  if (signed && row && !row.signed_pdf_key) {
    await persistSignedPdf({
      contractId: row.id,
      daycareId: row.daycare_id,
      envelopeId: input.envelopeId,
    }).catch((err) => console.error("[docusign] persist after event failed", err));
  }
  let agreementStatus: string | null = null;
  if (row?.pack_kind === PARENT_AGREEMENT_PACK) {
    agreementStatus = parentAgreementStatusFromConnect({
      envelopeStatus: input.status || input.event,
      signers,
    });
    await sql
      .query(
        `update daycare_contracts set status = $2, updated_at = now() where id = $1`,
        [row.id, agreementStatus],
      )
      .catch((err) => console.error("[docusign] parent agreement status failed", err));
    await sql
      .query(
        `update parent_enrolment_agreements set status = $2, updated_at = now() where contract_id = $1`,
        [row.id, agreementStatus],
      )
      .catch((err) => console.error("[docusign] parent agreement row failed", err));
  }
  return { ok: true as const, envelopeId: input.envelopeId, status: agreementStatus || status };
}

function classifiedDocusignError(err: unknown) {
  const issue = classifyDocusignFailure(err);
  if (issue.code === "rate_limit") rememberDocusignRateLimit();
  return new Error(issue.message);
}

export async function pollOpenEnvelopes(limit = 25) {
  const cfg = docusignConfig();
  if (!cfg || docusignIsRateLimited()) return { ok: true as const, checked: 0, updated: 0, stored: 0 };
  const sql = await getSql();
  const rows = await sql
    .query<{
      id: string;
      daycare_id: string;
      envelope_id: string;
      status: string;
      signed_pdf_key: string | null;
      pack_kind: string | null;
      viewed_at: string | null;
    }>(
      `select id, daycare_id, envelope_id, status, signed_pdf_key, pack_kind, viewed_at
         from daycare_contracts
        where envelope_id is not null
          and envelope_id not like 'demo_%'
          and (
            status in ('sent', 'viewed', 'parent_signed')
            or (status in ('signed', 'completed') and signed_pdf_key is null)
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
      // Progress includes signers, so the poll can record viewed_at even when
      // the envelope status itself has not moved.
      const progress = await getEnvelopeProgress(row.envelope_id);
      const remote = progress
        ? { envelopeId: progress.envelopeId, status: mapEnvelopeStatus(progress.status), event: progress.event }
        : await getEnvelopeStatus(row.envelope_id);
      const nextStatus =
        progress && row.pack_kind === PARENT_AGREEMENT_PACK
          ? parentAgreementStatusFromConnect({
              envelopeStatus: progress.status,
              signers: progress.signers,
            })
          : remote?.status;
      const newlyViewed = !row.viewed_at && Boolean(progress && signersViewed(progress.signers));
      if (remote && nextStatus && (nextStatus !== row.status || newlyViewed)) {
        await applyEnvelopeEvent(progress ?? remote);
        updated += 1;
      } else if ((row.status === "signed" || row.status === "completed" || nextStatus === "completed") && !row.signed_pdf_key) {
        const saved = await persistSignedPdf({
          contractId: row.id,
          daycareId: row.daycare_id,
          envelopeId: row.envelope_id,
        });
        if (saved) stored += 1;
      } else if ((remote?.status === "signed" || remote?.status === "completed") && !row.signed_pdf_key) {
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

/**
 * Re-read one envelope from the DocuSign API and apply what DocuSign says.
 * Used when a Connect delivery fails HMAC: the payload is never trusted, only
 * the envelope id, and only for envelopes we already track.
 */
export async function syncEnvelopeFromApi(envelopeId: string) {
  if (!envelopeId || envelopeId.startsWith("demo_")) return { ok: false as const, reason: "untracked" };
  const sql = await getSql();
  const rows = await sql
    .query<{ id: string }>(`select id from daycare_contracts where envelope_id = $1 limit 1`, [envelopeId])
    .catch(() => []);
  if (!rows.length) return { ok: false as const, reason: "untracked" };
  const progress = await getEnvelopeProgress(envelopeId);
  if (!progress || progress.envelopeId !== envelopeId) return { ok: false as const, reason: "remote_unavailable" };
  await applyEnvelopeEvent(progress);
  return { ok: true as const };
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
