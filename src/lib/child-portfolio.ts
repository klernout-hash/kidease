/**
 * Child file a daycare needs before it can approve a request.
 * Pure checks. No database. Flag stays off until FEATURE_CHILD_PORTFOLIO_GATE is set.
 *
 * Province extras follow common enrolment-record fields (home address, physician).
 * They are not a clinic feed and they do not invent a health-card number.
 * Ontario: O. Reg. 137/15 s. 72. Quebec inscription files ask for an address.
 * British Columbia, Alberta, Manitoba, and several other provinces ask for a physician.
 */

import { childBirthdateProblem } from "./child-birthdate.ts";

export const PORTFOLIO_FLAG = "FEATURE_CHILD_PORTFOLIO_GATE";

export const PORTFOLIO_SHARE_STATUSES = [
  "requested",
  "under_review",
  "waitlist",
  "accepted",
  "active",
] as const;

export const PORTFOLIO_GAPS = [
  "name",
  "birthdate",
  "health",
  "emergency",
  "pickup",
  "immunization",
  "doctor",
  "address",
] as const;

export type PortfolioGap = (typeof PORTFOLIO_GAPS)[number];

export type PortfolioInput = {
  name?: string | null;
  birthdate?: string | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  pickupPeople?: string | null;
  immunizationStatus?: string | null;
  immunizationNote?: string | null;
  doctorName?: string | null;
  doctorPhone?: string | null;
  homeAddress?: string | null;
  province?: string | null;
};

const PROVINCE_NAMES: Record<string, string> = {
  ONTARIO: "ON",
  QUEBEC: "QC",
  QUÉBEC: "QC",
  "BRITISH COLUMBIA": "BC",
  ALBERTA: "AB",
  MANITOBA: "MB",
  SASKATCHEWAN: "SK",
  "NOVA SCOTIA": "NS",
  "NEW BRUNSWICK": "NB",
  "PRINCE EDWARD ISLAND": "PE",
  "NEWFOUNDLAND AND LABRADOR": "NL",
  NEWFOUNDLAND: "NL",
  YUKON: "YT",
  "NORTHWEST TERRITORIES": "NT",
  NUNAVUT: "NU",
};

const PROVINCE_EXTRAS: Record<string, Array<"doctor" | "address">> = {
  ON: ["address", "doctor"],
  BC: ["doctor"],
  AB: ["doctor"],
  QC: ["address"],
  MB: ["doctor"],
  NS: ["doctor"],
  NB: ["doctor"],
  PE: ["doctor"],
  NL: ["doctor"],
  YT: ["doctor"],
  SK: [],
  NT: [],
  NU: [],
};

function text(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function portfolioProvince(raw: string | null | undefined): string {
  const cleaned = text(raw).toUpperCase();
  if (!cleaned) return "";
  if (PROVINCE_EXTRAS[cleaned]) return cleaned;
  return PROVINCE_NAMES[cleaned] || "";
}

export function provincePortfolioExtras(province: string | null | undefined): Array<"doctor" | "address"> {
  return PROVINCE_EXTRAS[portfolioProvince(province)] || [];
}

function phoneOk(value: string | null | undefined) {
  const digits = text(value).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function pickupNames(value: string | null | undefined): string[] {
  return text(value)
    .split(/[\n,;]+/)
    .map((part) => part.split("·")[0]?.trim() || "")
    .filter((part) => part.length >= 2 && !/^(none|aucun|aucune|n\/a|na)$/i.test(part));
}

function immunizationOk(status: string, note: string) {
  if (status === "record") return true;
  if (status === "exempt" || status === "note") return note.length >= 2;
  return false;
}

export function portfolioGaps(input: PortfolioInput | null | undefined, now = new Date()): PortfolioGap[] {
  const row = input ?? {};
  const gaps: PortfolioGap[] = [];
  if (text(row.name).length < 2) gaps.push("name");
  if (childBirthdateProblem(text(row.birthdate), now)) gaps.push("birthdate");
  if (!text(row.allergies) && !text(row.medicalNotes)) gaps.push("health");
  if (text(row.emergencyName).length < 2 || !phoneOk(row.emergencyPhone)) gaps.push("emergency");
  if (!pickupNames(row.pickupPeople).length) gaps.push("pickup");
  if (!immunizationOk(text(row.immunizationStatus), text(row.immunizationNote))) gaps.push("immunization");
  const extras = provincePortfolioExtras(row.province);
  if (extras.includes("doctor") && (text(row.doctorName).length < 2 || !phoneOk(row.doctorPhone))) gaps.push("doctor");
  if (extras.includes("address") && text(row.homeAddress).length < 8) gaps.push("address");
  return gaps;
}

export function portfolioComplete(input: PortfolioInput | null | undefined, now = new Date()) {
  return portfolioGaps(input, now).length === 0;
}

export function portfolioSharedWithDaycare(status: string | null | undefined) {
  return (PORTFOLIO_SHARE_STATUSES as readonly string[]).includes(String(status || ""));
}

export type DaycarePortfolio = {
  name: string;
  birthdate: string;
  allergies: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  pickupPeople: string;
  immunizationStatus: string;
  immunizationNote: string;
  doctorName: string;
  doctorPhone: string;
  homeAddress: string;
};

/** Fields a centre needs for this province. Comfort, fears, and likes stay off. */
export function daycarePortfolioView(input: PortfolioInput | null | undefined): DaycarePortfolio {
  const row = input ?? {};
  const extras = new Set(provincePortfolioExtras(row.province));
  return {
    name: text(row.name),
    birthdate: text(row.birthdate).slice(0, 10),
    allergies: text(row.allergies),
    medicalNotes: text(row.medicalNotes),
    emergencyName: text(row.emergencyName),
    emergencyPhone: text(row.emergencyPhone),
    pickupPeople: text(row.pickupPeople),
    immunizationStatus: text(row.immunizationStatus),
    immunizationNote: text(row.immunizationNote),
    doctorName: extras.has("doctor") ? text(row.doctorName) : "",
    doctorPhone: extras.has("doctor") ? text(row.doctorPhone) : "",
    homeAddress: extras.has("address") ? text(row.homeAddress) : "",
  };
}

export function scrubPickupList(value: string | null | undefined, blockedNames: readonly string[]) {
  const blocked = new Set(blockedNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  return text(value)
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter((part) => {
      const name = (part.split("·")[0] || "").trim().toLowerCase();
      return Boolean(part) && !blocked.has(name);
    })
    .join("\n");
}

export function approvalDecision(input: {
  enabled: boolean;
  nextStatus: string;
  child: PortfolioInput | null;
  now?: Date;
}): { ok: true } | { ok: false; reason: "incomplete"; gaps: PortfolioGap[] } {
  if (!input.enabled || input.nextStatus !== "accepted") return { ok: true };
  const gaps = portfolioGaps(input.child, input.now);
  if (gaps.length) return { ok: false, reason: "incomplete", gaps };
  return { ok: true };
}
