/** Client-safe DocuSign failure shapes. No secrets, no Node fetch. */

export const DOCUSIGN_CONSENT_MESSAGE = "DocuSign not connected — finish JWT consent";

export type DocusignConnectIssue = {
  code: "consent" | "auth" | "unavailable";
  message: string;
};

export type DocusignTemplateList = {
  templates: Array<{ templateId: string; name: string }>;
  error: DocusignConnectIssue | null;
};

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
  if (text.includes("docusign auth") || text.includes("401") || text.includes("unauthorized")) {
    return { code: "auth", message: DOCUSIGN_CONSENT_MESSAGE };
  }
  return { code: "unavailable", message: "DocuSign is unavailable right now." };
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
