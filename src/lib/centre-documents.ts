/**
 * Daycare document checklist. Files stay private.
 * The score counts a file that is on record and not expired.
 * Admin approval is separate. Email and SMS are not sent from here.
 */

export const CENTRE_DOC_FLAG = "FEATURE_CENTRE_DOCUMENTS";
export const DOC_EXPIRING_DAYS = 30;

export const POLICY_KEYS = ["health", "behaviour", "emergency", "fees"] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

export const FULL_POLICY_PROVINCES = ["MB", "ON", "BC", "AB", "QC"] as const;

export type CentreDocKind = "licence" | "insurance" | "policy" | "handbook" | "screening";
export type DocReviewStatus = "pending" | "approved" | "rejected";
export type DocFreshness = "missing" | "uploaded" | "expiring" | "expired";

export type StoredCentreDoc = {
  id: string;
  kind: "insurance" | "policy" | "handbook";
  policyKey: PolicyKey | null;
  filename: string | null;
  expiresOn: string | null;
  reviewStatus: DocReviewStatus;
  reviewReason: string | null;
};

export type ChecklistItem = {
  id: string;
  kind: CentreDocKind;
  policyKey: PolicyKey | null;
  labelKey: string;
  freshness: DocFreshness;
  reviewStatus: DocReviewStatus | null;
  reviewReason: string | null;
  expiresOn: string | null;
  filename: string | null;
  documentId: string | null;
  required: true;
};

export type ChecklistScore = {
  items: ChecklistItem[];
  total: number;
  complete: number;
  missing: number;
  expiring: number;
  expired: number;
  percent: number;
};

const FULL = new Set<string>(FULL_POLICY_PROVINCES);

export function requiredPolicyKeys(province: string | null | undefined): PolicyKey[] {
  const code = (province || "").trim().toUpperCase().slice(0, 2);
  if (FULL.has(code)) return ["health", "behaviour", "emergency", "fees"];
  return ["emergency", "fees"];
}

export function daysUntil(expiresOn: string | null | undefined, today = new Date()): number | null {
  const raw = (expiresOn || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const end = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}

export function freshnessFor(input: {
  hasFile: boolean;
  expiresOn?: string | null;
  today?: Date;
}): DocFreshness {
  if (!input.hasFile) return "missing";
  const days = daysUntil(input.expiresOn, input.today);
  if (days != null && days < 0) return "expired";
  if (days != null && days <= DOC_EXPIRING_DAYS) return "expiring";
  return "uploaded";
}

function countsComplete(freshness: DocFreshness): boolean {
  return freshness === "uploaded" || freshness === "expiring";
}

export function buildCentreChecklist(input: {
  province?: string | null;
  licenceOnFile: boolean;
  screeningOnFile: boolean;
  documents: readonly StoredCentreDoc[];
  today?: Date;
}): ChecklistScore {
  const policies = requiredPolicyKeys(input.province);
  const items: ChecklistItem[] = [];

  items.push({
    id: "licence",
    kind: "licence",
    policyKey: null,
    labelKey: "licence",
    freshness: freshnessFor({ hasFile: input.licenceOnFile, today: input.today }),
    reviewStatus: null,
    reviewReason: null,
    expiresOn: null,
    filename: null,
    documentId: null,
    required: true,
  });

  const insurance = input.documents.find((row) => row.kind === "insurance");
  items.push(storedItem("insurance", null, insurance, input.today));

  for (const key of policies) {
    const row = input.documents.find((doc) => doc.kind === "policy" && doc.policyKey === key);
    items.push(storedItem("policy", key, row, input.today));
  }

  const handbook = input.documents.find((row) => row.kind === "handbook");
  items.push(storedItem("handbook", null, handbook, input.today));

  items.push({
    id: "screening",
    kind: "screening",
    policyKey: null,
    labelKey: "screening",
    freshness: input.screeningOnFile ? "uploaded" : "missing",
    reviewStatus: null,
    reviewReason: null,
    expiresOn: null,
    filename: null,
    documentId: null,
    required: true,
  });

  const complete = items.filter((item) => countsComplete(item.freshness)).length;
  const missing = items.filter((item) => item.freshness === "missing").length;
  const expiring = items.filter((item) => item.freshness === "expiring").length;
  const expired = items.filter((item) => item.freshness === "expired").length;
  const total = items.length;
  return {
    items,
    total,
    complete,
    missing,
    expiring,
    expired,
    percent: total ? Math.round((complete / total) * 100) : 0,
  };
}

function storedItem(
  kind: "insurance" | "policy" | "handbook",
  policyKey: PolicyKey | null,
  row: StoredCentreDoc | undefined,
  today?: Date,
): ChecklistItem {
  const hasFile = Boolean(row?.id);
  return {
    id: policyKey ? `policy:${policyKey}` : kind,
    kind,
    policyKey,
    labelKey: policyKey || kind,
    freshness: freshnessFor({ hasFile, expiresOn: row?.expiresOn, today }),
    reviewStatus: row?.reviewStatus ?? null,
    reviewReason: row?.reviewReason ?? null,
    expiresOn: row?.expiresOn ?? null,
    filename: row?.filename ?? null,
    documentId: row?.id ?? null,
    required: true,
  };
}

/** Public badge. The files themselves stay private. */
export function documentsVerifiedBadge(input: {
  licenceApproved: boolean;
  insurance: StoredCentreDoc | null | undefined;
  today?: Date;
}): boolean {
  if (!input.licenceApproved || !input.insurance) return false;
  if (input.insurance.reviewStatus !== "approved") return false;
  return freshnessFor({ hasFile: true, expiresOn: input.insurance.expiresOn, today: input.today }) !== "expired";
}

export function isPolicyKey(value: string | null | undefined): value is PolicyKey {
  return (POLICY_KEYS as readonly string[]).includes((value || "").trim());
}
