/**
 * Approve → Live → trust.
 *
 * One decision: licence number on file (not a private PDF), screening or a
 * valid attestation, a single canonical claim, Approved + Live, duplicate
 * claims suppressed, and a map point inside the centre's city so Live search
 * can see it. Admin health is this result — never a green check that skips
 * a failed downstream step.
 */

import { geocode, haversineKm, type LatLng } from "./geo.ts";
import { isOperatorLicenseSource, normalizeLicenseStatus } from "./license-status.ts";
import { normalizeCentreName, normalizeLicenseNumber } from "./listing-identity.ts";
import { listingMatchesLocationLock, resolveLocationLock } from "./location-lock.ts";
import { isPlatformLive } from "./live.ts";

/** Same rule as officialLicenceNumber in licensing.ts. Inlined so Node tests avoid the @/ alias. */
function officialLicenceNumber(raw?: string | null, id?: string | null): string | null {
  const n = (raw || "").trim();
  if (!n || n === "—" || n.toLowerCase() === "unknown") return null;
  const tail = (id || "").split("-").pop() || "";
  if (/^\d{1,3}$/.test(n) && (!id || n === tail)) return null;
  return n;
}

/** Same metro window Explore uses when it locks a city. */
export const VERIFIED_CITY_KM = 40;

export const APPROVAL_CHECK_IDS = [
  "licence",
  "screening",
  "canonical_claim",
  "approved_live",
  "duplicates",
  "trust",
  "search_location",
  "search_memo",
] as const;

export type ApprovalCheckId = (typeof APPROVAL_CHECK_IDS)[number];

export type ApprovalCheck = {
  id: ApprovalCheckId;
  ok: boolean;
  detail: string;
};

export type ApprovalHealth = {
  ok: boolean;
  checks: ApprovalCheck[];
  failed: ApprovalCheckId[];
};

export type ApprovalCentre = {
  id?: string | null;
  daycareId?: string | null;
  slug?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  licenseNumber?: string | null;
  licensePhoto?: string | null;
  licenseStatus?: string | null;
  licenseVerificationSource?: string | null;
  screeningOnFile?: boolean | null;
  staffScreeningAttested?: boolean | null;
  claimStatus?: string | null;
  claimedAt?: string | null;
  listingActive?: boolean | null;
  live?: boolean | null;
  ratingX10?: number | null;
  reviewCount?: number | null;
  submittedAt?: string | null;
};

export type ApprovalClaim = {
  id: string;
  status?: string | null;
  createdAt?: string | null;
  licensePhoto?: string | null;
};

const APPROVED_CLAIM = new Set(["approved", "live", "active", "published"]);

export type VerifiedSearchPoint = LatLng & {
  source: "listing" | "city";
  eligible: boolean;
};

function centreId(centre: ApprovalCentre) {
  return (centre.daycareId || centre.id || "").trim();
}

function finitePin(lat?: number | null, lng?: number | null): LatLng | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

export function hasApprovalLicence(
  centre: Pick<ApprovalCentre, "id" | "daycareId" | "licenseNumber" | "licenseStatus">,
): boolean {
  const status = normalizeLicenseStatus(centre.licenseStatus);
  if (status === "expired" || status === "suspended") return false;
  return Boolean(officialLicenceNumber(centre.licenseNumber, centreId(centre)));
}

export function hasApprovalScreening(
  centre: Pick<ApprovalCentre, "screeningOnFile" | "staffScreeningAttested">,
): boolean {
  return Boolean(centre.screeningOnFile || centre.staffScreeningAttested);
}

export function approvalLicenseSource(current?: string | null): string {
  if (isOperatorLicenseSource(current)) return (current || "").trim().toLowerCase();
  return "admin";
}

/**
 * Map point Live search should use. A pin already inside the centre's city
 * stays. A missing or out-of-city pin (Winnipeg coords on an Edmonton listing)
 * uses the verified city so Edmonton Live search can include the centre.
 */
export function verifiedSearchPoint(
  centre: Pick<ApprovalCentre, "city" | "province" | "lat" | "lng">,
): VerifiedSearchPoint {
  const pin = finitePin(centre.lat, centre.lng);
  const cityName = (centre.city || "").trim();
  const city = cityName ? geocode(cityName) || geocode([cityName, centre.province].filter(Boolean).join(", ")) : null;
  if (city && pin && haversineKm(pin, city) <= VERIFIED_CITY_KM) {
    return { ...pin, source: "listing", eligible: true };
  }
  if (city) return { lat: city.lat, lng: city.lng, source: "city", eligible: true };
  if (pin) return { ...pin, source: "listing", eligible: true };
  return { lat: 0, lng: 0, source: "listing", eligible: false };
}

export function liveSearchHit(input: {
  origin: LatLng;
  radiusKm: number;
  label?: string | null;
  centre: ApprovalCentre;
}): boolean {
  const point = verifiedSearchPoint(input.centre);
  if (!point.eligible) return false;
  if (haversineKm(input.origin, point) > input.radiusKm) return false;
  const id = centreId(input.centre) || "centre";
  const live = isPlatformLive(id, Boolean(input.centre.claimedAt), {
    listingActive: input.centre.listingActive !== false,
    ratingX10: input.centre.ratingX10 ?? 0,
    reviewCount: input.centre.reviewCount ?? 0,
    claimStatus: input.centre.claimStatus,
    claimedAt: input.centre.claimedAt,
  });
  if (!live) return false;
  const lock = resolveLocationLock({
    lat: input.origin.lat,
    lng: input.origin.lng,
    label: input.label || [input.centre.city, input.centre.province].filter(Boolean).join(", "),
  });
  return listingMatchesLocationLock(
    { city: input.centre.city, province: input.centre.province },
    lock,
  );
}

/** Strong public treatment. Statuses only — callers must not pass document refs. */
export function publicApprovalEligible(centre: ApprovalCentre): boolean {
  const status = (centre.claimStatus || "").trim().toLowerCase();
  if (!APPROVED_CLAIM.has(status)) return false;
  if (centre.live === false) return false;
  if (centre.listingActive === false) return false;
  if (!hasApprovalLicence(centre)) return false;
  if (!hasApprovalScreening(centre)) return false;
  if (!verifiedSearchPoint(centre).eligible) return false;
  const id = centreId(centre) || "centre";
  return isPlatformLive(id, Boolean(centre.claimedAt) || status === "approved", {
    listingActive: centre.listingActive !== false,
    ratingX10: centre.ratingX10 ?? 0,
    reviewCount: centre.reviewCount ?? 0,
    claimStatus: status,
    claimedAt: centre.claimedAt,
  });
}

export function adminLicenceFact(input: {
  licensePhoto?: string | null;
  licenseNumber?: string | null;
  licenseStatus?: string | null;
  id?: string | null;
  daycareId?: string | null;
}): { status: string; tone: "ready" | "missing" | "attention" } {
  const licenseStatus = normalizeLicenseStatus(input.licenseStatus);
  const number = officialLicenceNumber(input.licenseNumber, input.daycareId || input.id);
  const hasPhoto = Boolean((input.licensePhoto || "").trim());
  if (licenseStatus === "expired") {
    return { status: number ? `On file · ${number} · expired` : "Submitted · expired", tone: "attention" };
  }
  if (licenseStatus === "suspended") {
    return { status: number ? `On file · ${number} · suspended` : "Submitted · suspended", tone: "attention" };
  }
  if (!hasPhoto && !number) return { status: "Missing", tone: "missing" };
  if (number && !hasPhoto) return { status: `On file · ${number}`, tone: "ready" };
  if (licenseStatus === "matched") return { status: "Submitted · matched", tone: "ready" };
  return { status: "Submitted", tone: "ready" };
}

export function selectCanonicalClaim(claims: ApprovalClaim[]): {
  canonicalId: string | null;
  suppressIds: string[];
} {
  const open = claims.filter((claim) => (claim.status || "").trim().toLowerCase() !== "superseded");
  if (!open.length) return { canonicalId: null, suppressIds: [] };
  const ranked = [...open].sort((a, b) => claimRank(b) - claimRank(a) || timeDesc(a.createdAt, b.createdAt));
  const canonicalId = ranked[0]?.id ?? null;
  return {
    canonicalId,
    suppressIds: open.map((claim) => claim.id).filter((id) => id !== canonicalId),
  };
}

function claimRank(claim: ApprovalClaim) {
  const status = (claim.status || "").trim().toLowerCase();
  if (status === "approved") return 4;
  if (status === "verified" || status === "waiting") return 3;
  if ((claim.licensePhoto || "").trim()) return 2;
  if (status === "pending") return 1;
  return 0;
}

function timeDesc(a?: string | null, b?: string | null) {
  const at = Date.parse(a || "") || 0;
  const bt = Date.parse(b || "") || 0;
  return bt - at;
}

function placeKey(centre: Pick<ApprovalCentre, "name" | "city" | "province">) {
  const name = normalizeCentreName(centre.name || "");
  const city = (centre.city || "").trim().toLowerCase();
  const province = (centre.province || "").trim().toLowerCase();
  if (!name || !city) return "";
  return `${name}|${city}|${province}`;
}

/** Same centre when the licence matches, or the name and city match and they do not carry two different licences. */
export function sameReviewCentre(
  a: Pick<ApprovalCentre, "id" | "daycareId" | "name" | "city" | "province" | "licenseNumber">,
  b: Pick<ApprovalCentre, "id" | "daycareId" | "name" | "city" | "province" | "licenseNumber">,
): boolean {
  const left = officialLicenceNumber(a.licenseNumber, centreId(a));
  const right = officialLicenceNumber(b.licenseNumber, centreId(b));
  if (left && right) return normalizeLicenseNumber(left) === normalizeLicenseNumber(right);
  const placeA = placeKey(a);
  const placeB = placeKey(b);
  return Boolean(placeA && placeA === placeB);
}

function cardScore(centre: ApprovalCentre) {
  const status = (centre.claimStatus || "").trim().toLowerCase();
  let score = 0;
  if (centre.live || APPROVED_CLAIM.has(status)) score += 100;
  if (officialLicenceNumber(centre.licenseNumber, centreId(centre))) score += 20;
  if (hasApprovalScreening(centre)) score += 5;
  return score;
}

function clusterReviewCards<T extends ApprovalCentre>(rows: T[]): T[][] {
  const licensed = new Map<string, T[]>();
  const open: T[][] = [];
  for (const row of rows) {
    const licence = officialLicenceNumber(row.licenseNumber, centreId(row));
    if (licence) {
      const key = normalizeLicenseNumber(licence);
      const list = licensed.get(key) ?? [];
      list.push(row);
      licensed.set(key, list);
      continue;
    }
    const place = placeKey(row);
    const existing = place ? open.find((group) => placeKey(group[0]!) === place) : undefined;
    if (existing) existing.push(row);
    else open.push([row]);
  }
  const groups = [...licensed.values()];
  for (const group of open) {
    const hits = groups.filter((licensedGroup) => sameReviewCentre(licensedGroup[0]!, group[0]!));
    if (hits.length === 1) hits[0]!.push(...group);
    else groups.push(group);
  }
  return groups;
}

/** One card per centre. Live / licensed row wins; the rest leave the review queue. */
export function collapseDuplicateReviewCards<T extends ApprovalCentre>(rows: T[]): T[] {
  const kept: T[] = [];
  for (const list of clusterReviewCards(rows)) {
    const winner = [...list].sort(
      (a, b) => cardScore(b) - cardScore(a) || timeDesc(a.submittedAt, b.submittedAt) || centreId(a).localeCompare(centreId(b)),
    )[0];
    if (winner && (winner.claimStatus || "").trim().toLowerCase() !== "superseded") kept.push(winner);
  }
  return kept;
}

export function duplicateDaycareIds(canonical: ApprovalCentre, others: ApprovalCentre[]): string[] {
  const clustered = clusterReviewCards([canonical, ...others.filter((row) => centreId(row) !== centreId(canonical))]);
  const group = clustered.find((list) => list.some((row) => centreId(row) === centreId(canonical))) ?? [];
  return group
    .map((row) => centreId(row))
    .filter((id) => id && id !== centreId(canonical) && id);
}

export function canOfferApprove(listingStatus: string) {
  return listingStatus !== "live";
}

function failedIds(checks: ApprovalCheck[]): ApprovalCheckId[] {
  return checks.filter((check) => !check.ok).map((check) => check.id);
}

export function planApproval(
  centre: ApprovalCentre,
  claims: ApprovalClaim[],
  duplicates: ApprovalCentre[] = [],
): {
  ok: boolean;
  health: ApprovalHealth;
  canonicalClaimId: string | null;
  suppressClaimIds: string[];
  suppressDaycareIds: string[];
  next: ApprovalCentre | null;
} {
  const number = officialLicenceNumber(centre.licenseNumber, centreId(centre));
  const licenceOk = hasApprovalLicence(centre);
  const screeningOk = hasApprovalScreening(centre);
  const chosen = selectCanonicalClaim(claims);
  const point = verifiedSearchPoint(centre);
  const next: ApprovalCentre = {
    ...centre,
    id: centreId(centre),
    claimStatus: "approved",
    claimedAt: centre.claimedAt || new Date(0).toISOString(),
    live: true,
    listingActive: centre.listingActive !== false,
    lat: point.lat,
    lng: point.lng,
    licenseNumber: number,
    licenseStatus: "matched",
    licenseVerificationSource: approvalLicenseSource(centre.licenseVerificationSource),
  };
  const city = geocode((centre.city || "").trim());
  const origin = city ?? (point.eligible ? point : null);
  const searchOk = Boolean(
    origin &&
      liveSearchHit({
        origin,
        radiusKm: 25,
        label: [centre.city, centre.province].filter(Boolean).join(", "),
        centre: next,
      }),
  );
  const trustOk = publicApprovalEligible(next);
  const blockers: ApprovalCheck[] = [
    {
      id: "licence",
      ok: licenceOk,
      detail: licenceOk ? `Licence ${number} is on file` : "Licence is missing",
    },
    {
      id: "screening",
      ok: screeningOk,
      detail: screeningOk ? "Screening requirement met" : "Screening is not attested",
    },
    {
      id: "canonical_claim",
      ok: true,
      detail: chosen.canonicalId ? "Canonical claim selected" : "No separate claim row — listing approval stands",
    },
    {
      id: "search_location",
      ok: searchOk,
      detail: searchOk ? "Live search includes the verified location" : "Verified location is outside Live search",
    },
    {
      id: "trust",
      ok: trustOk,
      detail: trustOk ? "Public trust fields match" : "Trust fields are not eligible",
    },
  ];
  const suppressDaycareIds = duplicateDaycareIds(centre, duplicates);
  if (blockers.some((check) => !check.ok)) {
    return {
      ok: false,
      health: { ok: false, checks: blockers, failed: failedIds(blockers) },
      canonicalClaimId: chosen.canonicalId,
      suppressClaimIds: [],
      suppressDaycareIds: [],
      next: null,
    };
  }
  const checks: ApprovalCheck[] = [
    ...blockers,
    { id: "approved_live", ok: true, detail: "Approved and Live" },
    {
      id: "duplicates",
      ok: true,
      detail:
        chosen.suppressIds.length || suppressDaycareIds.length
          ? "Duplicate claims suppressed"
          : "No duplicate claims",
    },
    { id: "search_memo", ok: true, detail: "Search memo cleared" },
  ];
  return {
    ok: true,
    health: { ok: true, checks, failed: [] },
    canonicalClaimId: chosen.canonicalId,
    suppressClaimIds: chosen.suppressIds,
    suppressDaycareIds,
    next,
  };
}

export function approvalHealthSummary(health: ApprovalHealth): { title: string; body: string } {
  if (health.ok) {
    return {
      title: "Approval checks passed",
      body: "Live, search, and trust succeeded. Parents can find this centre in Live search.",
    };
  }
  const failed = health.checks.filter((check) => !check.ok).map((check) => check.detail);
  return {
    title: "Approval did not complete",
    body: failed.length
      ? `${failed.join(". ")}. The centre was not marked Live.`
      : "A downstream check failed. The centre was not marked Live.",
  };
}
