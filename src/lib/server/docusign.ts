import { createHmac, createPrivateKey, createSign } from "node:crypto";
import { getSql } from "@/lib/db";

export type DocusignMode = "live" | "demo";

export type EnvelopeResult = {
  mode: DocusignMode;
  envelopeId: string;
  signingUrl: string | null;
  status: string;
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
    baseUri: (env("DOCUSIGN_BASE_URI") || (demo ? "https://demo.docusign.net" : "https://na4.docusign.net")).replace(/\/$/, ""),
  };
}

export function docusignMode(): DocusignMode {
  return docusignConfig() ? "live" : "demo";
}

export function appOrigin() {
  return (env("APP_ORIGIN") || env("VITE_APP_URL") || "https://kidease.ca").replace(/\/$/, "");
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
      exp: now + 3600,
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
  const res = await fetch(`${cfg.baseUri}/restapi/v2.1/accounts/${cfg.accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DocuSign ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createCentreEnvelope(input: {
  contractId: string;
  documentName: string;
  body: string;
  signerName: string;
  signerEmail: string;
}): Promise<EnvelopeResult> {
  const cfg = docusignConfig();
  if (!cfg) {
    return {
      mode: "demo",
      envelopeId: `demo_${input.contractId}`,
      signingUrl: `${appOrigin()}/sign/${input.contractId}`,
      status: "sent",
    };
  }

  const token = await accessToken(cfg);
  const documentBase64 = Buffer.from(input.body, "utf8").toString("base64");
  const created = await ds<{ envelopeId: string; status?: string }>(cfg, token, "/envelopes", {
    method: "POST",
    body: JSON.stringify({
      emailSubject: `Please sign: ${input.documentName}`,
      emailBlurb: "KidEase needs the licensed centre agreement signed before the listing stays live for parent requests.",
      documents: [
        {
          documentBase64,
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
            clientUserId: input.contractId,
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
      eventNotification: {
        url: `${appOrigin()}/api/docusign/webhook`,
        loggingEnabled: "true",
        requireAcknowledgment: "true",
        envelopeEvents: [
          { envelopeEventStatusCode: "sent" },
          { envelopeEventStatusCode: "delivered" },
          { envelopeEventStatusCode: "completed" },
          { envelopeEventStatusCode: "declined" },
          { envelopeEventStatusCode: "voided" },
        ],
      },
      status: "sent",
    }),
  });

  let signingUrl: string | null = null;
  try {
    const view = await ds<{ url?: string }>(cfg, token, `/envelopes/${created.envelopeId}/views/recipient`, {
      method: "POST",
      body: JSON.stringify({
        returnUrl: `${appOrigin()}/sign/${input.contractId}`,
        authenticationMethod: "none",
        email: input.signerEmail,
        userName: input.signerName,
        clientUserId: input.contractId,
      }),
    });
    signingUrl = view.url ?? null;
  } catch (err) {
    console.error("[docusign] recipient view failed", err);
    signingUrl = `${appOrigin()}/sign/${input.contractId}`;
  }

  return {
    mode: "live",
    envelopeId: created.envelopeId,
    signingUrl,
    status: created.status || "sent",
  };
}

export async function voidCentreEnvelope(envelopeId: string, reason = "Superseded by a new KidEase contract") {
  const cfg = docusignConfig();
  if (!cfg || envelopeId.startsWith("demo_")) return;
  const token = await accessToken(cfg);
  await ds(cfg, token, `/envelopes/${envelopeId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "voided", voidedReason: reason }),
  });
}

export function mapEnvelopeStatus(raw: string) {
  const s = raw.trim().toLowerCase();
  if (s === "completed" || s === "signed") return "signed";
  if (s === "delivered" || s === "viewed") return "viewed";
  if (s === "declined") return "declined";
  if (s === "voided") return "voided";
  if (s === "sent" || s === "created") return "sent";
  return s || "sent";
}

export function authorizedWebhook(request: Request, rawBody: string) {
  const secret = env("DOCUSIGN_WEBHOOK_SECRET");
  if (!secret) return true;
  const header =
    request.headers.get("x-docusign-signature-1") ||
    request.headers.get("x-authorization-digest") ||
    "";
  if (!header) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  return header.replace(/^sha256=/i, "").trim() === digest;
}

export function parseConnectPayload(raw: string): { envelopeId: string; status: string; event: string } | null {
  try {
    const json = JSON.parse(raw) as {
      event?: string;
      envelopeId?: string;
      status?: string;
      data?: { envelopeId?: string; envelopeSummary?: { status?: string; envelopeId?: string } };
    };
    const envelopeId = json.data?.envelopeId || json.data?.envelopeSummary?.envelopeId || json.envelopeId;
    const status = json.data?.envelopeSummary?.status || json.status || "";
    if (envelopeId) return { envelopeId, status: mapEnvelopeStatus(status || json.event || ""), event: json.event || status || "" };
  } catch {
    /* XML Connect payload */
  }
  const id = raw.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i)?.[1];
  const status = raw.match(/<Status>([^<]+)<\/Status>/i)?.[1];
  if (!id) return null;
  return { envelopeId: id, status: mapEnvelopeStatus(status || ""), event: status || "connect" };
}

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
  return { ok: true as const, envelopeId: input.envelopeId, status };
}
