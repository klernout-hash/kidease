/**
 * Admin tools. These functions only describe a change.
 * They never edit a listing, approve a licence, or send a reply.
 */

export const PROTECTED_LISTING_ID = "kids-world-daycare-kh2t";
export const SPAM_HIGH_SCORE = 70;
export const TRUTH_CHECK_BATCH = 25;

export type TruthField = "phone" | "hours" | "ages" | "address";

export type ListingFacts = {
  id?: string | null;
  phone?: string | null;
  hours?: string | null;
  ageLabel?: string | null;
  address?: string | null;
  agesConfirmed?: boolean | number | null;
};

export type TruthChange = {
  field: TruthField;
  current: string;
  proposed: string;
};

export type LicenceSuggestion = {
  licenceNumber: string | null;
  holderName: string | null;
  expiry: string | null;
  confirmed: false;
};

export type SpamKind = "signup" | "message" | "review";

export type SpamScore = {
  kind: SpamKind;
  score: number;
  reasons: string[];
  high: boolean;
};

export type SupportTag = "billing" | "tour" | "listing" | "account" | "other";

export type DemandInput = {
  city: string;
  ageGroup: string;
  searches: number;
  saves: number;
  spotRequests: number;
  listings: number;
  confirmedOpenings: number;
};

export type DemandCell = {
  city: string;
  ageGroup: string;
  demand: number;
  supply: number;
  gap: number;
};

const SPAM_PHRASES = [
  "crypto",
  "bitcoin",
  "viagra",
  "click here",
  "work from home",
  "guaranteed income",
  "wire transfer",
];

function clean(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function labeled(text: string, labels: string): string | null {
  const match = text.match(new RegExp(`(?:${labels})\\s*[:\\-]\\s*([^\\n.]{2,120})`, "i"));
  return match ? clean(match[1]) : null;
}

/** Compare a listing to text from the website already on file. Does not change the listing. */
export function diffListingAgainstWebsite(listing: ListingFacts, websiteText: string): TruthChange[] {
  const text = websiteText || "";
  const changes: TruthChange[] = [];
  const phone = labeled(text, "phone|tel|telephone|téléphone");
  const currentPhone = clean(listing.phone);
  if (phone && digits(phone).length >= 10 && digits(phone) !== digits(currentPhone)) {
    changes.push({ field: "phone", current: currentPhone, proposed: phone });
  }
  const hours = labeled(text, "hours|heures|open");
  const currentHours = clean(listing.hours);
  if (hours && hours.toLowerCase() !== currentHours.toLowerCase()) {
    changes.push({ field: "hours", current: currentHours, proposed: hours });
  }
  const ages = labeled(text, "ages?|âges?");
  const currentAges = clean(listing.ageLabel);
  if (ages && !listing.agesConfirmed && ages.toLowerCase() !== currentAges.toLowerCase()) {
    changes.push({ field: "ages", current: currentAges, proposed: ages });
  }
  const address = labeled(text, "address|adresse");
  const currentAddress = clean(listing.address);
  if (address && address.toLowerCase() !== currentAddress.toLowerCase()) {
    changes.push({ field: "address", current: currentAddress, proposed: address });
  }
  return changes;
}

/** Apply one change only after a person approves it. A refused change leaves the listing as it was. */
export function applyApprovedTruthChange<T extends ListingFacts>(listing: T, change: TruthChange, approved: boolean): T {
  if (!approved) return listing;
  if (listing.id === PROTECTED_LISTING_ID) return listing;
  if (change.field === "ages" && listing.agesConfirmed) return listing;
  if (change.field === "phone") return { ...listing, phone: change.proposed };
  if (change.field === "hours") return { ...listing, hours: change.proposed };
  if (change.field === "ages") return { ...listing, ageLabel: change.proposed };
  if (change.field === "address") return { ...listing, address: change.proposed };
  return listing;
}

/** Months from a plain age line such as "18 months to 5 years". Null when the line is not clear. */
export function parseAgeRangeMonths(text: string): { min: number; max: number } | null {
  const range = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*months?/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min >= 0 && max >= min && max <= 216) return { min, max };
  }
  const values: number[] = [];
  for (const match of text.matchAll(/(\d+)\s*months?/gi)) values.push(Number(match[1]));
  for (const match of text.matchAll(/(\d+)\s*years?/gi)) values.push(Number(match[1]) * 12);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min < 0 || max > 216 || max < min) return null;
  return { min, max };
}

/** Pull number, holder, and expiry from text. Never marks the licence approved. */
export function readLicenceText(text: string): LicenceSuggestion {
  const source = text || "";
  const number = source.match(/\b(?:licence|license)\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,24})/i);
  const holder = source.match(/\b(?:holder|licensee|titulaire)\s*[:-]\s*([^\n.]{2,80})/i);
  const expiry = source.match(/\b(?:expir(?:y|es|ation)|expire le)\s*[:-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  return {
    licenceNumber: number ? number[1].toUpperCase() : null,
    holderName: holder ? clean(holder[1]) : null,
    expiry: expiry ? normalizeExpiry(expiry[1]) : null,
    confirmed: false,
  };
}

function normalizeExpiry(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.split(/[/-]/).map((part) => part.trim());
  if (parts.length !== 3) return null;
  const [a, b, c] = parts;
  const year = c.length === 2 ? `20${c}` : c;
  const month = a.padStart(2, "0");
  const day = b.padStart(2, "0");
  if (!/^\d{4}$/.test(year) || Number(month) < 1 || Number(month) > 12) return null;
  return `${year}-${month}-${day}`;
}

export function scoreSpam(input: { kind: SpamKind; text: string; email?: string | null }): SpamScore {
  const text = (input.text || "").toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  for (const phrase of SPAM_PHRASES) {
    if (text.includes(phrase)) {
      score += 40;
      reasons.push(phrase);
    }
  }
  const links = text.match(/https?:\/\//g);
  if (links && links.length >= 3) {
    score += 30;
    reasons.push("many links");
  }
  if (/(.)\1{8,}/.test(text)) {
    score += 25;
    reasons.push("repeated characters");
  }
  const email = (input.email || "").toLowerCase();
  if (email.endsWith("@mailinator.com") || email.endsWith("@guerrillamail.com")) {
    score += 70;
    reasons.push("disposable email");
  }
  if (score > 100) score = 100;
  return { kind: input.kind, score, reasons, high: score >= SPAM_HIGH_SCORE };
}

export function triageSupport(message: string): { tag: SupportTag; draft: string; send: false } {
  const text = (message || "").toLowerCase();
  let tag: SupportTag = "other";
  if (/\b(bill|invoice|payment|refund|stripe|charge|facture)\b/.test(text)) tag = "billing";
  else if (/\b(tour|visit|visite)\b/.test(text)) tag = "tour";
  else if (/\b(listing|claim|licence|license|photo|fiche)\b/.test(text)) tag = "listing";
  else if (/\b(password|sign in|login|account|compte)\b/.test(text)) tag = "account";
  return { tag, draft: draftFor(tag), send: false };
}

function draftFor(tag: SupportTag): string {
  if (tag === "billing") return "Thanks for writing about a bill. An admin will read this before anyone replies.";
  if (tag === "tour") return "Thanks for writing about a tour. An admin will read this before anyone replies.";
  if (tag === "listing") return "Thanks for writing about a listing. An admin will read this before anyone replies.";
  if (tag === "account") return "Thanks for writing about an account. An admin will read this before anyone replies.";
  return "Thanks for writing. An admin will read this before anyone replies.";
}

export function demandMapCells(rows: DemandInput[]): DemandCell[] {
  return rows
    .map((row) => {
      const demand = row.searches + row.saves + row.spotRequests;
      const supply = row.listings + row.confirmedOpenings;
      return {
        city: row.city,
        ageGroup: row.ageGroup,
        demand,
        supply,
        gap: demand - supply,
      };
    })
    .sort((a, b) => b.gap - a.gap || a.city.localeCompare(b.city) || a.ageGroup.localeCompare(b.ageGroup));
}

export function safeWebsiteUrl(raw: string | null | undefined): string | null {
  const value = clean(raw);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function websitePlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

export function truthTargets<T extends { id: string; website?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.id !== PROTECTED_LISTING_ID && Boolean(safeWebsiteUrl(row.website))).slice(0, TRUTH_CHECK_BATCH);
}
