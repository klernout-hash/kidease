/** Client-safe DocuSign failure shapes. No secrets, no Node fetch. */

export const DOCUSIGN_CONSENT_MESSAGE = "DocuSign not connected — finish JWT consent";
export const DOCUSIGN_UNAVAILABLE_MESSAGE = "DocuSign is unavailable right now.";
export const DOCUSIGN_RATE_LIMIT_MESSAGE =
  "DocuSign hourly API limit reached. Wait about an hour, then try again.";

export type DocusignConnectIssue = {
  code: "consent" | "auth" | "rate_limit" | "unavailable";
  message: string;
};

export type DocusignTemplateList = {
  templates: Array<{ templateId: string; name: string }>;
  error: DocusignConnectIssue | null;
};

export function docusignRateLimitIssue(): DocusignConnectIssue {
  return { code: "rate_limit", message: DOCUSIGN_RATE_LIMIT_MESSAGE };
}

export function classifyDocusignFailure(err: unknown): DocusignConnectIssue {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const text = raw.toLowerCase();
  if (
    text.includes("user_not_found") ||
    text.includes("consent_required") ||
    text.includes("invalid_grant") ||
    text.includes("no_valid_keys_or_signatures")
  ) {
    return { code: "consent", message: DOCUSIGN_CONSENT_MESSAGE };
  }
  if (
    text.includes("hourly_apiinvocation_limit_exceeded") ||
    text.includes("hourly apiinvocation") ||
    text.includes("hourly api limit") ||
    /\b429\b/.test(text) ||
    text.includes("too many requests") ||
    text.includes("rate limit")
  ) {
    return docusignRateLimitIssue();
  }
  if (text.includes("docusign auth") || text.includes("401") || text.includes("unauthorized")) {
    return { code: "auth", message: DOCUSIGN_CONSENT_MESSAGE };
  }
  return { code: "unavailable", message: DOCUSIGN_UNAVAILABLE_MESSAGE };
}

/** Never throws — auth/consent failures become an error payload. */
export async function listDocusignTemplatesFromApi(
  load: () => Promise<Array<{ templateId: string; name: string }>>,
): Promise<DocusignTemplateList> {
  try {
    return { templates: await load(), error: null };
  } catch (err) {
    return { templates: [], error: classifyDocusignFailure(err) };
  }
}

/** Never throws — used for Admin status / PDF reads. */
export async function readDocusignOrNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}
