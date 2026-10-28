/** Tour and waitlist lead CSV. Headers match the usual centre software columns. */

export const CRM_HEADERS = [
  "centre",
  "parent_name",
  "child_name",
  "email",
  "phone",
  "request_type",
  "start_date",
  "age_band",
  "created_at",
] as const;

export type CrmLead = Partial<Record<(typeof CRM_HEADERS)[number], string>>;

function cell(value: string | undefined): string {
  const text = (value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function leadsToCrmCsv(rows: CrmLead[]): string {
  const head = CRM_HEADERS.join(",");
  const body = rows.map((row) => CRM_HEADERS.map((key) => cell(row[key])).join(","));
  return [head, ...body].join("\n");
}

export async function signCrmBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
