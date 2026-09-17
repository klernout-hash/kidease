import { runtimeEnv, runtimeProcessEnv, type EnvMap } from "./runtime-env.ts";

export type DocusignMode = "live" | "demo";

export type DocusignJwtConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  authBase: string;
  baseUri: string;
};

export type DocusignConfigIssueReason = "missing" | "not_pem";

export type DocusignConfigIssue = {
  name: string;
  reason: DocusignConfigIssueReason;
};

function envOf(name: string, source?: EnvMap) {
  return runtimeEnv(name, source);
}

function pemHasBegin(value: string) {
  return /BEGIN[ A-Z]*PRIVATE KEY/.test(value) || value.includes("BEGIN");
}

function tryDecodePemBase64(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  if (compact.length < 16) return "";
  const padded = compact.replace(/-/g, "+").replace(/_/g, "/");
  if (/[^A-Za-z0-9+/=]/.test(padded)) return "";
  try {
    return Buffer.from(padded, "base64").toString("utf8").replace(/\r/g, "").trim();
  } catch {
    return "";
  }
}

function unwrapPemQuotes(raw: string): string {
  let v = raw;
  for (let i = 0; i < 3; i += 1) {
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")) ||
      (v.startsWith("`") && v.endsWith("`"))
    ) {
      v = v.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return v;
}

/** Vercel pastes: quoted PEM, literal `\n`, double-escaped `\\n`, optional whole-PEM base64. */
export function normalizeDocusignPem(raw: string): string {
  let v = unwrapPemQuotes(
    String(raw || "")
      .replace(/^\uFEFF/, "")
      .split(String.fromCharCode(0))
      .join("")
      .trim(),
  );
  v = v.replace(/\\r\\n/g, "\n").replace(/\\\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  if (pemHasBegin(v)) return v;
  const decoded = tryDecodePemBase64(v);
  if (pemHasBegin(decoded)) return decoded;
  const decodedAgain = tryDecodePemBase64(decoded);
  return pemHasBegin(decodedAgain) ? decodedAgain : v;
}

function integrationKey(source?: EnvMap) {
  return envOf("DOCUSIGN_INTEGRATION_KEY", source) || envOf("DOCUSIGN_CLIENT_ID", source);
}

export function docusignConfigIssues(source?: EnvMap): DocusignConfigIssue[] {
  const issues: DocusignConfigIssue[] = [];
  if (!integrationKey(source)) {
    issues.push({ name: "DOCUSIGN_INTEGRATION_KEY", reason: "missing" });
  }
  if (!envOf("DOCUSIGN_USER_ID", source)) {
    issues.push({ name: "DOCUSIGN_USER_ID", reason: "missing" });
  }
  if (!envOf("DOCUSIGN_ACCOUNT_ID", source)) {
    issues.push({ name: "DOCUSIGN_ACCOUNT_ID", reason: "missing" });
  }
  const rawPem = envOf("DOCUSIGN_PRIVATE_KEY", source);
  if (!rawPem) {
    issues.push({ name: "DOCUSIGN_PRIVATE_KEY", reason: "missing" });
  } else if (!pemHasBegin(normalizeDocusignPem(rawPem))) {
    issues.push({ name: "DOCUSIGN_PRIVATE_KEY", reason: "not_pem" });
  }
  return issues;
}

export function docusignConfig(source?: EnvMap): DocusignJwtConfig | null {
  const env = source ?? runtimeProcessEnv();
  const key = integrationKey(env);
  const userId = envOf("DOCUSIGN_USER_ID", env);
  const accountId = envOf("DOCUSIGN_ACCOUNT_ID", env);
  const privateKey = normalizeDocusignPem(envOf("DOCUSIGN_PRIVATE_KEY", env));
  if (!key || !userId || !accountId || !pemHasBegin(privateKey)) return null;
  const demo = envOf("DOCUSIGN_ENV", env).toLowerCase() !== "production";
  return {
    integrationKey: key,
    userId,
    accountId,
    privateKey,
    authBase:
      envOf("DOCUSIGN_AUTH_BASE", env) ||
      (demo ? "https://account-d.docusign.com" : "https://account.docusign.com"),
    baseUri: (
      envOf("DOCUSIGN_BASE_URI", env) || (demo ? "https://demo.docusign.net" : "https://na4.docusign.net")
    ).replace(/\/$/, ""),
  };
}

export function docusignMode(source?: EnvMap): DocusignMode {
  return docusignConfig(source) ? "live" : "demo";
}
