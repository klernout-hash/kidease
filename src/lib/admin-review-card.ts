/**
 * Decision-facing facts for the Admin waiting / claim review card.
 * Presentation only — claim tokens and permissions stay on the server.
 */

import { adminLicenceFact, approvalScreeningFact } from "./approve-live.ts";

export type ReviewFactId = "licence" | "screening" | "photos";
export type ReviewFactTone = "ready" | "missing" | "attention";

export type ReviewFact = {
  id: ReviewFactId;
  label: "Licence" | "Screening" | "Photos";
  status: string;
  tone: ReviewFactTone;
};

export type ReviewClaimKindId = "owner" | "new" | "listing";

export type ReviewClaimKind = {
  id: ReviewClaimKindId;
  label: "Owner claim" | "New listing" | "Listing";
};

export type ReviewCardMode = "decision" | "verify";

/** Blocks that belong on the card face vs behind More. */
export function reviewCardLayout(mode: ReviewCardMode): { face: readonly string[]; more: readonly string[] } {
  if (mode === "verify") {
    return {
      face: ["identity", "facts", "documents", "licence-tools", "decision"],
      more: ["trust", "contracts", "meta"],
    };
  }
  return {
    face: ["identity", "facts", "decision"],
    more: ["documents", "trust", "contracts", "licence-tools", "meta"],
  };
}

export function reviewClaimKind(input: {
  hasListingClaim?: boolean;
  hasProviderLink?: boolean;
}): ReviewClaimKind {
  if (input.hasListingClaim) return { id: "owner", label: "Owner claim" };
  if (input.hasProviderLink) return { id: "new", label: "New listing" };
  return { id: "listing", label: "Listing" };
}

function withoutLead(value: string, pattern: RegExp) {
  const next = value.replace(pattern, "").trim();
  if (!next || next === value) return value;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

/** Short row labels for the details panel. Official badge text stays the value. */
export function trustDetailRow(id: string, value: string): { label: string; value: string } {
  if (id.startsWith("license")) return { label: "Licence", value };
  if (id.startsWith("claim")) return { label: "Ownership", value };
  if (id.startsWith("pay")) return { label: "Payments", value: withoutLead(value, /^Payments:\s*/i) };
  return { label: "Screening", value: withoutLead(value, /^Staff screening:\s*/i) };
}

export function reviewDecisionFacts(input: {
  licensePhoto?: string | null;
  licenseNumber?: string | null;
  licenseStatus?: string | null;
  id?: string | null;
  daycareId?: string | null;
  storefrontPhoto?: string | null;
  screeningOnFile?: boolean;
  staffScreeningAttested?: boolean;
}): ReviewFact[] {
  const licenceFact = adminLicenceFact(input);
  const licence: ReviewFact = {
    id: "licence",
    label: "Licence",
    status: licenceFact.status,
    tone: licenceFact.tone,
  };

  const screeningFact = approvalScreeningFact(input);
  const screening: ReviewFact = {
    id: "screening",
    label: "Screening",
    status: screeningFact.status,
    tone: screeningFact.tone,
  };

  const photos: ReviewFact = (input.storefrontPhoto || "").trim()
    ? { id: "photos", label: "Photos", status: "Storefront on file", tone: "ready" }
    : { id: "photos", label: "Photos", status: "Missing", tone: "missing" };

  return [licence, screening, photos];
}
