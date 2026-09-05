/**
 * Shared trust vocabulary. Same words and colours on search, listing, provider, admin.
 *
 * KidEase verifies centres / licences / claim ownership.
 * It does NOT police-check every educator unless a screening partner is wired.
 * Never emit "Background checked by KidEase".
 */

import { listingStatusFromClaim } from "@/lib/listing-status";
import { officialLicenceNumber } from "@/lib/licensing";
import { stripeChargesLive } from "@/lib/stripe-live";

export const LICENSE_STATUSES = ["unverified", "matched", "expired", "suspended"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const REGISTRY_MATCH_STATES = ["unmatched", "pending", "matched", "mismatch"] as const;
export type RegistryMatchState = (typeof REGISTRY_MATCH_STATES)[number];

export const CLAIM_VERIFICATION_STATES = ["unclaimed", "pending", "waiting", "verified", "declined"] as const;
export type ClaimVerificationState = (typeof CLAIM_VERIFICATION_STATES)[number];

export const TRUST_TONES = ["ok", "neutral", "warn", "danger"] as const;
export type TrustTone = (typeof TRUST_TONES)[number];

export const TRUST_BADGE_IDS = [
  "license_matched",
  "license_unverified",
  "license_expired",
  "license_suspended",
  "claim_verified",
  "claim_review",
  "claim_unclaimed",
  "claim_declined",
  "staff_attested",
  "staff_none",
  "pay_stripe",
  "pay_ledger",
] as const;
export type TrustBadgeId = (typeof TRUST_BADGE_IDS)[number];

export type TrustBadge = {
  id: TrustBadgeId;
  tone: TrustTone;
  labelKey: TrustCopyKey;
  tipKey: TrustCopyKey;
};

/** Copy keys owned by this vocabulary. Keep in sync with copy.ts (EN + FR). */
export type TrustCopyKey =
  | "trustLicensedMatched"
  | "trustLicensedMatchedTip"
  | "trustLicenseUnverified"
  | "trustLicenseUnverifiedTip"
  | "trustLicenseExpired"
  | "trustLicenseExpiredTip"
  | "trustLicenseSuspended"
  | "trustLicenseSuspendedTip"
  | "trustClaimVerified"
  | "trustClaimVerifiedTip"
  | "trustClaimReview"
  | "trustClaimReviewTip"
  | "trustClaimUnclaimed"
  | "trustClaimUnclaimedTip"
  | "trustClaimDeclined"
  | "trustClaimDeclinedTip"
  | "trustStaffAttested"
  | "trustStaffAttestedTip"
  | "trustStaffNone"
  | "trustStaffNoneTip"
  | "trustPayStripe"
  | "trustPayStripeTip"
  | "trustPayLedger"
  | "trustPayLedgerTip";

export type TrustListing = {
  id?: string;
  licenseNumber?: string | null;
  licenseStatus?: LicenseStatus | "active" | "unknown" | null;
  licenseExpiry?: string | null;
  licensedCapacity?: number | null;
  registryMatchState?: RegistryMatchState | null;
  licenseVerifiedAt?: string | null;
  licenseVerificationSource?: string | null;
  claimStatus?: string | null;
  claimed?: boolean;
  claimedAt?: string | null;
  live?: boolean;
  staffScreeningAttested?: boolean;
  staffScreeningAttestedAt?: string | null;
  staffScreeningAttestedBy?: string | null;
  stripeIdentityVerified?: boolean;
};

export type TrustFields = {
  licenseStatus: LicenseStatus;
  licenseExpiry: string | null;
  licensedCapacity: number | null;
  registryMatchState: RegistryMatchState;
  licenseVerifiedAt: string | null;
  licenseVerificationSource: string | null;
  staffScreeningAttested: boolean;
  staffScreeningAttestedAt: string | null;
  staffScreeningAttestedBy: string | null;
  stripeIdentityVerified: boolean;
};

export function defaultTrustFields(): TrustFields {
  return {
    licenseStatus: "unverified",
    licenseExpiry: null,
    licensedCapacity: null,
    registryMatchState: "unmatched",
    licenseVerifiedAt: null,
    licenseVerificationSource: null,
    staffScreeningAttested: false,
    staffScreeningAttestedAt: null,
    staffScreeningAttestedBy: null,
    stripeIdentityVerified: false,
  };
}

export function normalizeLicenseStatus(raw?: string | null): LicenseStatus {
  const v = (raw || "").trim().toLowerCase();
  if (v === "matched" || v === "active") return "matched";
  if (v === "expired") return "expired";
  if (v === "suspended" || v === "revoked") return "suspended";
  return "unverified";
}

export function normalizeMatchState(raw?: string | null): RegistryMatchState {
  const v = (raw || "").trim().toLowerCase();
  if (v === "matched") return "matched";
  if (v === "pending") return "pending";
  if (v === "mismatch") return "mismatch";
  return "unmatched";
}

export function claimVerificationState(item: TrustListing): ClaimVerificationState {
  const raw = (item.claimStatus || "").trim().toLowerCase();
  if (raw === "unclaimed" || (!raw && !item.claimed && !item.claimedAt)) return "unclaimed";
  const listing = listingStatusFromClaim(item.claimStatus, {
    live: item.live,
    claimedAt: item.claimedAt ?? (item.claimed ? "1" : null),
  });
  if (listing === "declined") return "declined";
  if (listing === "live") return "verified";
  if (raw === "pending") return "pending";
  return "waiting";
}

export function licenseBadge(item: TrustListing): TrustBadge {
  const status = normalizeLicenseStatus(item.licenseStatus);
  if (status === "expired") {
    return {
      id: "license_expired",
      tone: "danger",
      labelKey: "trustLicenseExpired",
      tipKey: "trustLicenseExpiredTip",
    };
  }
  if (status === "suspended") {
    return {
      id: "license_suspended",
      tone: "danger",
      labelKey: "trustLicenseSuspended",
      tipKey: "trustLicenseSuspendedTip",
    };
  }
  if (status === "matched" || item.registryMatchState === "matched") {
    return {
      id: "license_matched",
      tone: "ok",
      labelKey: "trustLicensedMatched",
      tipKey: "trustLicensedMatchedTip",
    };
  }
  return {
    id: "license_unverified",
    tone: "neutral",
    labelKey: "trustLicenseUnverified",
    tipKey: "trustLicenseUnverifiedTip",
  };
}

export function claimBadge(item: TrustListing): TrustBadge {
  const state = claimVerificationState(item);
  if (state === "verified") {
    return {
      id: "claim_verified",
      tone: "ok",
      labelKey: "trustClaimVerified",
      tipKey: "trustClaimVerifiedTip",
    };
  }
  if (state === "declined") {
    return {
      id: "claim_declined",
      tone: "danger",
      labelKey: "trustClaimDeclined",
      tipKey: "trustClaimDeclinedTip",
    };
  }
  if (state === "unclaimed") {
    return {
      id: "claim_unclaimed",
      tone: "neutral",
      labelKey: "trustClaimUnclaimed",
      tipKey: "trustClaimUnclaimedTip",
    };
  }
  return {
    id: "claim_review",
    tone: "warn",
    labelKey: "trustClaimReview",
    tipKey: "trustClaimReviewTip",
  };
}

export function staffBadge(item: TrustListing): TrustBadge {
  if (item.staffScreeningAttested) {
    return {
      id: "staff_attested",
      tone: "neutral",
      labelKey: "trustStaffAttested",
      tipKey: "trustStaffAttestedTip",
    };
  }
  return {
    id: "staff_none",
    tone: "neutral",
    labelKey: "trustStaffNone",
    tipKey: "trustStaffNoneTip",
  };
}

export function paymentBadge(item: TrustListing, stripeLive = stripeChargesLive()): TrustBadge {
  if (item.stripeIdentityVerified && stripeLive) {
    return {
      id: "pay_stripe",
      tone: "ok",
      labelKey: "trustPayStripe",
      tipKey: "trustPayStripeTip",
    };
  }
  return {
    id: "pay_ledger",
    tone: "neutral",
    labelKey: "trustPayLedger",
    tipKey: "trustPayLedgerTip",
  };
}

export type TrustSurface = "card" | "parent" | "provider" | "admin";

/** Which badges each role sees. Cards stay to one licence signal. */
export function trustBadgesFor(item: TrustListing, surface: TrustSurface, stripeLive?: boolean): TrustBadge[] {
  const license = licenseBadge(item);
  if (surface === "card") return [license];

  const badges = [license, claimBadge(item)];
  if (surface === "parent") {
    badges.push(staffBadge(item));
    return badges;
  }
  badges.push(staffBadge(item), paymentBadge(item, stripeLive));
  return badges;
}

export function displayLicenceNumber(raw?: string | null, id?: string | null) {
  return officialLicenceNumber(raw, id);
}

export function formatAttestedOn(iso?: string | null, locale = "en-CA") {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export const FORBIDDEN_TRUST_PHRASES = [
  "background checked by kidease",
  "background-checked by kidease",
  "police-checked by kidease",
  "staff vetted by kidease",
  "safety grade",
  "inspection score",
];
