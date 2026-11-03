/**
 * Alexa custom skill (FEATURE_ALEXA_SKILL, default off). Scaffold.
 * Verifies every request the way Amazon requires for a web-service endpoint:
 *   - SignatureCertChainUrl: https, host s3.amazonaws.com, path starts /echo.api/, port 443
 *   - cert chain is valid now and the leaf SAN has echo-api.amazon.com
 *   - Signature-256 header is RSA-SHA256 over the raw body with that cert
 *   - request timestamp within 150 seconds
 *   - applicationId matches ALEXA_SKILL_ID
 * Privacy: never speaks child names or home daycare addresses. Day log needs a linked parent.
 * No relative imports with @/ so node tests can import this file.
 */
import { X509Certificate, createVerify } from "node:crypto";

type Env = Record<string, string | undefined>;
export const ALEXA_MAX_SKEW_MS = 150_000;

export function validAlexaCertUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol.toLowerCase() !== "https:") return false;
  if (u.hostname.toLowerCase() !== "s3.amazonaws.com") return false;
  if (u.port && u.port !== "443") return false;
  const path = u.pathname.replace(/\/+/g, "/");
  if (!path.startsWith("/echo.api/")) return false;
  if (path.split("/").includes("..")) return false;
  return true;
}

export function splitPemChain(pem: string): string[] {
  return pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
}

export function certChainOk(pem: string, now = Date.now()): { ok: boolean; leaf?: X509Certificate; error?: string } {
  const parts = splitPemChain(pem);
  if (!parts.length) return { ok: false, error: "no cert" };
  const certs = parts.map((p) => new X509Certificate(p));
  const leaf = certs[0];
  for (const c of certs) {
    if (now < Date.parse(c.validFrom) || now > Date.parse(c.validTo)) return { ok: false, error: "cert expired" };
  }
  if (!/DNS:echo-api\.amazon\.com(,|$)/.test(String(leaf.subjectAltName || ""))) return { ok: false, error: "bad SAN" };
  for (let i = 0; i < certs.length - 1; i += 1) {
    if (!certs[i].verify(certs[i + 1].publicKey)) return { ok: false, error: "chain broken" };
  }
  return { ok: true, leaf };
}

export function signatureOk(leaf: X509Certificate, body: string, signatureB64: string): boolean {
  if (!signatureB64) return false;
  const v = createVerify("RSA-SHA256");
  v.update(body);
  return v.verify(leaf.publicKey, Buffer.from(signatureB64, "base64"));
}

export function timestampOk(ts: string, now = Date.now()): boolean {
  const t = Date.parse(ts);
  return Number.isFinite(t) && Math.abs(now - t) <= ALEXA_MAX_SKEW_MS;
}

export type AlexaVerifyDeps = {
  fetchCert: (url: string) => Promise<string>;
  now?: number;
};

const certCache = new Map<string, { pem: string; at: number }>();

export async function verifyAlexaRequest(
  env: Env,
  headers: { certUrl: string; signature: string },
  body: string,
  deps: AlexaVerifyDeps,
): Promise<{ ok: true; json: AlexaRequest } | { ok: false; status: number; error: string }> {
  if (!/^(1|true|on|yes)$/i.test(String(env.FEATURE_ALEXA_SKILL || ""))) return { ok: false, status: 404, error: "off" };
  const skillId = String(env.ALEXA_SKILL_ID || "").trim();
  if (!skillId) return { ok: false, status: 503, error: "not configured" };
  if (!validAlexaCertUrl(headers.certUrl)) return { ok: false, status: 400, error: "bad cert url" };
  const now = deps.now ?? Date.now();
  let pem = certCache.get(headers.certUrl)?.pem;
  if (!pem) {
    pem = await deps.fetchCert(headers.certUrl);
    certCache.set(headers.certUrl, { pem, at: now });
  }
  const chain = certChainOk(pem, now);
  if (!chain.ok || !chain.leaf) return { ok: false, status: 400, error: chain.error || "bad cert" };
  if (!signatureOk(chain.leaf, body, headers.signature)) return { ok: false, status: 400, error: "bad signature" };
  let json: AlexaRequest;
  try {
    json = JSON.parse(body) as AlexaRequest;
  } catch {
    return { ok: false, status: 400, error: "bad json" };
  }
  if (!timestampOk(json?.request?.timestamp || "", now)) return { ok: false, status: 400, error: "stale" };
  const appId = json?.session?.application?.applicationId || json?.context?.System?.application?.applicationId;
  if (appId !== skillId) return { ok: false, status: 400, error: "wrong skill" };
  return { ok: true, json };
}

export function resetAlexaCertCacheForTests() {
  certCache.clear();
}

export type AlexaRequest = {
  session?: { application?: { applicationId?: string }; user?: { accessToken?: string } };
  context?: { System?: { application?: { applicationId?: string }; user?: { accessToken?: string } } };
  request: {
    type: string;
    timestamp: string;
    locale?: string;
    intent?: { name: string; slots?: Record<string, { value?: string }> };
  };
};

export type AlexaData = {
  /** Resolve a linked KidEase user from the account-linking access token. null = not linked. */
  linkedUser(accessToken: string): Promise<{ userId: string; role: "parent" | "provider" | "other" } | null>;
  spotsNear(city: string): Promise<{ centres: number; spots: number }>;
  dayLogCount(userId: string): Promise<number>;
  newMessages(userId: string): Promise<number>;
};

function say(text: string, end = true, linkAccount = false) {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      ...(linkAccount ? { card: { type: "LinkAccount" } } : {}),
      shouldEndSession: end,
    },
  };
}

function fr(req: AlexaRequest) {
  return String(req.request.locale || "").toLowerCase().startsWith("fr");
}

export async function handleAlexa(req: AlexaRequest, data: AlexaData) {
  const f = fr(req);
  const t = req.request.type;
  if (t === "LaunchRequest") {
    return say(f ? "Bienvenue sur KidEase. Demandez les places près de vous, le journal du jour ou les nouveaux messages." : "Welcome to KidEase. Ask for spots near you, today's day log, or new messages.", false);
  }
  if (t === "SessionEndedRequest") return { version: "1.0", response: {} };
  if (t !== "IntentRequest") return say(f ? "Désolé, je n'ai pas compris." : "Sorry, I didn't get that.");
  const name = req.request.intent?.name || "";
  const token = req.session?.user?.accessToken || req.context?.System?.user?.accessToken || "";

  if (name === "FindSpotsIntent") {
    const city = String(req.request.intent?.slots?.city?.value || "").trim();
    if (!city) return say(f ? "Dans quelle ville?" : "Which city?", false);
    const { centres, spots } = await data.spotsNear(city);
    if (!centres) return say(f ? `Aucune place affichée à ${city} pour le moment.` : `No open spots listed in ${city} right now.`);
    return say(
      f
        ? `${centres} garderies à ${city} affichent ${spots} places. Ouvrez l'appli KidEase pour les détails.`
        : `${centres} daycares in ${city} list ${spots} open spots. Open the KidEase app for details.`,
    );
  }
  if (name === "DayLogIntent" || name === "NewMessagesIntent") {
    const user = token ? await data.linkedUser(token) : null;
    if (!user) return say(f ? "Liez votre compte KidEase dans l'appli Alexa d'abord." : "Please link your KidEase account in the Alexa app first.", true, true);
    if (name === "DayLogIntent") {
      if (user.role !== "parent") return say(f ? "Le journal du jour est réservé aux parents." : "Today's day log is for parents only.");
      const n = await data.dayLogCount(user.userId);
      // Count only. Never read child names or journal text aloud on a shared speaker.
      return say(
        n
          ? f ? `Vous avez ${n} entrées de journal aujourd'hui. Ouvrez l'appli pour les lire.` : `You have ${n} day log ${n === 1 ? "entry" : "entries"} today. Open the app to read them.`
          : f ? "Pas encore d'entrée aujourd'hui." : "No day log entries yet today.",
      );
    }
    if (user.role !== "provider") return say(f ? "Les messages de garderie sont pour le personnel." : "Daycare messages are for daycare staff.");
    const n = await data.newMessages(user.userId);
    return say(f ? `Vous avez ${n} nouveaux messages.` : `You have ${n} new ${n === 1 ? "message" : "messages"}.`);
  }
  if (name === "AMAZON.HelpIntent") {
    return say(f ? "Dites: places près de moi à Winnipeg, journal du jour, ou nouveaux messages." : "Say: spots near me in Winnipeg, today's day log, or new messages.", false);
  }
  if (name === "AMAZON.StopIntent" || name === "AMAZON.CancelIntent") return say(f ? "Au revoir." : "Goodbye.");
  return say(f ? "Désolé, je ne peux pas faire ça encore." : "Sorry, I can't do that yet.");
}
