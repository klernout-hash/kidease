/**
 * What a centre still has to add before the listing is ready.
 * Pure: no database and no mail. scripts/host-listing.test.mjs loads this in Node.
 */

import { listingVerifiedCoach, type ListingVerifiedInput } from "./listing-verified.ts";
import type { HostSection } from "./host-listing.ts";

export const HOST_ACTION_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const HOST_ACTION_CODES = [
  "license",
  "license_expired",
  "province",
  "hours",
  "ages",
  "capacity",
  "fees",
  "photo",
  "screening",
] as const;
export type HostActionCode = (typeof HOST_ACTION_CODES)[number];

export type HostActionTone = "danger" | "warning";

export type HostActionFix = {
  desk: "listings" | "licence" | "screening" | "today";
  section?: HostSection;
  focus?: "license" | "capacity" | "screening";
};

export type HostActionItem = {
  id: string;
  daycareId: string;
  daycareName: string;
  code: HostActionCode;
  tone: HostActionTone;
  fix: HostActionFix;
};

type ListingFacts = ListingVerifiedInput & {
  id: string;
  name?: string | null;
  licenseStatus?: string | null;
};

const SENTENCE: Record<HostActionCode, { en: string; fr: string }> = {
  license: {
    en: "{name} has no licence number on file.",
    fr: "{name} n'a pas de numéro de permis au dossier.",
  },
  license_expired: {
    en: "{name} has a licence that is expired or suspended.",
    fr: "{name} a un permis expiré ou suspendu.",
  },
  province: {
    en: "{name} needs a province or territory.",
    fr: "{name} a besoin d'une province ou d'un territoire.",
  },
  hours: {
    en: "{name} needs hours parents can read.",
    fr: "{name} a besoin d'heures que les parents peuvent lire.",
  },
  ages: {
    en: "{name} needs the ages you accept.",
    fr: "{name} a besoin des âges que vous acceptez.",
  },
  capacity: {
    en: "{name} needs the licensed capacity.",
    fr: "{name} a besoin de la capacité autorisée.",
  },
  fees: {
    en: "{name} needs monthly fees, or the fee program for this province.",
    fr: "{name} a besoin des frais mensuels, ou du programme de frais de cette province.",
  },
  photo: {
    en: "{name} needs a photo of the building.",
    fr: "{name} a besoin d'une photo du bâtiment.",
  },
  screening: {
    en: "{name} needs a Vulnerable Sector Check on file.",
    fr: "{name} a besoin d'une vérification du secteur vulnérable au dossier.",
  },
};

const FIX: Record<HostActionCode, HostActionFix> = {
  license: { desk: "licence", focus: "license" },
  license_expired: { desk: "licence", focus: "license" },
  province: { desk: "listings", section: "location" },
  hours: { desk: "listings", section: "location" },
  ages: { desk: "listings", section: "ages" },
  capacity: { desk: "licence", focus: "capacity" },
  fees: { desk: "listings", section: "fees" },
  photo: { desk: "listings", section: "photos" },
  screening: { desk: "screening", focus: "screening" },
};

export function hostActionSentence(code: HostActionCode, name: string, locale: string): string {
  const text = SENTENCE[code][locale === "fr" ? "fr" : "en"];
  return text.replaceAll("{name}", name.trim() || (locale === "fr" ? "Ce centre" : "This centre"));
}

export function hostActionLabel(code: HostActionCode, locale: string): string {
  if (locale === "fr") return code === "license_expired" ? "Expiré" : "Manquant";
  return code === "license_expired" ? "Expired" : "Missing";
}

export function hostActionFixHref(item: HostActionItem): string {
  const params = new URLSearchParams();
  params.set("desk", item.fix.desk);
  if (item.fix.section) params.set("section", item.fix.section);
  if (item.fix.focus) params.set("focus", item.fix.focus);
  if (item.daycareId) params.set("centre", item.daycareId);
  return `/provider?${params.toString()}`;
}

function licenceState(status?: string | null): "expired" | "missing" | "ok" {
  const value = (status || "").trim().toLowerCase();
  if (value === "expired" || value === "suspended") return "expired";
  return "ok";
}

export function hostActionItems(listings: ListingFacts[]): HostActionItem[] {
  const items: HostActionItem[] = [];
  for (const listing of listings) {
    const name = (listing.name || "").trim() || listing.id;
    const coach = listingVerifiedCoach(listing);
    for (const code of coach.missingBlockers) {
      const action = code === "license" && licenceState(listing.licenseStatus) === "expired" ? "license_expired" : code;
      items.push({
        id: `${listing.id}:${action}`,
        daycareId: listing.id,
        daycareName: name,
        code: action,
        tone: action === "license_expired" || action === "screening" ? "danger" : "warning",
        fix: FIX[action],
      });
    }
  }
  return items;
}

export function hostActionFingerprint(codes: readonly string[]): string {
  return [...codes].sort().join(",");
}

export type HostActionDecision = "first" | "remind" | "wait" | "clear";

export function decideHostActionNotice(input: {
  codes: readonly string[];
  previousFingerprint: string | null;
  lastAtMs: number | null;
  nowMs: number;
}): HostActionDecision {
  const fingerprint = hostActionFingerprint(input.codes);
  if (!fingerprint) return "clear";
  if (!input.previousFingerprint || input.lastAtMs == null) return "first";
  if (input.previousFingerprint !== fingerprint) return "first";
  if (input.nowMs - input.lastAtMs >= HOST_ACTION_WEEK_MS) return "remind";
  return "wait";
}

/** Real mail only on production. Tests, CI, and preview stay quiet. */
export function hostActionEmailLive(env: Record<string, string | undefined> = {}): boolean {
  if (env.NODE_ENV === "test" || env.VITEST === "true" || env.VITEST === "1") return false;
  if (env.E2E_ROLE_FIXTURE === "1") return false;
  if (env.CI === "true" || env.CI === "1") return false;
  const vercel = (env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercel === "preview" || vercel === "development") return false;
  return vercel === "production";
}

export function hostSectionFromFocus(focus: string | null | undefined): HostSection | null {
  if (focus === "photo") return "photos";
  if (focus === "province" || focus === "hours") return "location";
  if (focus === "ages") return "ages";
  if (focus === "fees" || focus === "subsidy") return "fees";
  if (focus === "policies") return "policies";
  return null;
}
