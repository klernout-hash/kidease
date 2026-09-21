/**
 * Decision-facing facts for the Admin waiting / claim review card.
 * Presentation only — claim tokens and permissions stay on the server.
 */

import { normalizeLicenseStatus } from "./license-status.ts";

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

export function reviewDecisionFacts(input: {
  licensePhoto?: string | null;
  licenseStatus?: string | null;
  storefrontPhoto?: string | null;
  screeningOnFile?: boolean;
  staffScreeningAttested?: boolean;
}): ReviewFact[] {
  const licenseStatus = normalizeLicenseStatus(input.licenseStatus);
  const hasLicence = Boolean((input.licensePhoto || "").trim());

  let licence: ReviewFact;
  if (!hasLicence) {
    licence = { id: "licence", label: "Licence", status: "Missing", tone: "missing" };
  } else if (licenseStatus === "expired") {
    licence = { id: "licence", label: "Licence", status: "Submitted · expired", tone: "attention" };
  } else if (licenseStatus === "suspended") {
    licence = { id: "licence", label: "Licence", status: "Submitted · suspended", tone: "attention" };
  } else if (licenseStatus === "matched") {
    licence = { id: "licence", label: "Licence", status: "Submitted · matched", tone: "ready" };
  } else {
    licence = { id: "licence", label: "Licence", status: "Submitted", tone: "ready" };
  }

  const screening: ReviewFact = input.screeningOnFile
    ? { id: "screening", label: "Screening", status: "On file", tone: "ready" }
    : input.staffScreeningAttested
      ? { id: "screening", label: "Screening", status: "Attested", tone: "ready" }
      : { id: "screening", label: "Screening", status: "Not attested", tone: "missing" };

  const photos: ReviewFact = (input.storefrontPhoto || "").trim()
    ? { id: "photos", label: "Photos", status: "Storefront on file", tone: "ready" }
    : { id: "photos", label: "Photos", status: "Missing", tone: "missing" };

  return [licence, screening, photos];
}
