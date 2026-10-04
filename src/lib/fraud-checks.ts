/**
 * Claim and review fraud checks.
 * A low claim score goes to admin review. Nothing here approves a claim or publishes a review.
 * Relative imports only so scripts/*.test.mjs can load this file.
 */

export const CLAIM_REVIEW_BELOW = 40;
export const REVIEW_BURST_WINDOW_MS = 10 * 60 * 1000;
export const REVIEW_BURST_COUNT = 3;

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.ca",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
]);

export type ClaimMatchScore = {
  score: number;
  reasons: string[];
  needsReview: boolean;
  autoApprove: false;
};

export type ReviewFraudReason = "not_enrolled" | "ip_burst" | "device_burst" | "duplicate_text";

export type ReviewSignal = {
  body: string;
  ipHash: string | null;
  deviceId: string | null;
  atMs: number;
};

function cleanEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  return email.slice(at + 1);
}

export function phoneLast10(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

export function normalizeReviewText(body: string) {
  return body
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Higher is a closer match to the licence record.
 * A free-mail domain only counts when the whole address matches.
 */
export function scoreClaimMatch(input: {
  claimantEmail?: string | null;
  claimantPhone?: string | null;
  licenceEmail?: string | null;
  licencePhone?: string | null;
}): ClaimMatchScore {
  const reasons: string[] = [];
  let score = 0;
  const claimantEmail = cleanEmail(input.claimantEmail);
  const licenceEmail = cleanEmail(input.licenceEmail);
  if (claimantEmail && licenceEmail && claimantEmail === licenceEmail) {
    score += 70;
    reasons.push("email");
  } else {
    const claimantDomain = emailDomain(claimantEmail);
    const licenceDomain = emailDomain(licenceEmail);
    if (claimantDomain && claimantDomain === licenceDomain && !FREE_MAIL.has(claimantDomain)) {
      score += 45;
      reasons.push("email_domain");
    }
  }
  const claimantPhone = phoneLast10(input.claimantPhone);
  const licencePhone = phoneLast10(input.licencePhone);
  if (claimantPhone && claimantPhone === licencePhone) {
    score += 40;
    reasons.push("phone");
  }
  if (score > 100) score = 100;
  return {
    score,
    reasons,
    needsReview: score < CLAIM_REVIEW_BELOW,
    autoApprove: false,
  };
}

export function reviewFraudReasons(input: {
  enrolled: boolean;
  body: string;
  ipHash: string | null;
  deviceId: string | null;
  nowMs: number;
  recent: ReviewSignal[];
}): ReviewFraudReason[] {
  const reasons: ReviewFraudReason[] = [];
  if (!input.enrolled) reasons.push("not_enrolled");
  const windowStart = input.nowMs - REVIEW_BURST_WINDOW_MS;
  const recent = input.recent.filter((row) => row.atMs >= windowStart && row.atMs <= input.nowMs);
  if (input.ipHash) {
    const sameIp = recent.filter((row) => row.ipHash === input.ipHash).length + 1;
    if (sameIp >= REVIEW_BURST_COUNT) reasons.push("ip_burst");
  }
  if (input.deviceId) {
    const sameDevice = recent.filter((row) => row.deviceId === input.deviceId).length + 1;
    if (sameDevice >= REVIEW_BURST_COUNT) reasons.push("device_burst");
  }
  const text = normalizeReviewText(input.body);
  if (text.length >= 12 && recent.some((row) => normalizeReviewText(row.body) === text)) {
    reasons.push("duplicate_text");
  }
  return reasons;
}
