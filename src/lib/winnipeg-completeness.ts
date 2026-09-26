/**
 * Winnipeg live-looking measurement and sourced fills.
 * Ages, fees, and photos are never invented. A blank cell is not a write.
 * Harvested catalogue fee 218 and a province-wide $10-a-day amenity do not count.
 * A sourced fee_program (mb-10-day) counts without inventing a monthly amount.
 */

import { CATALOGUE_MONTHLY_FEE_GUESS, hasConfirmedFeeLine, normalizeFeeProgram } from "./fee-program.ts";
import { isUnflaggedSharedFallbackSrc } from "./photo-honesty.ts";
import { splitPhotoList } from "./listing-photo.ts";
import { isPlatformLive, type PlatformLiveExtra } from "./live.ts";
import { isPublicListing, type ListingVisibilityInput } from "./listing-visibility.ts";

export { hasConfirmedFeeLine };

export const WINNIPEG_LIVE_LOOKING_MIN = 0.8;

/** Same city test as now-loops isWinnipegPlace. */
export function isWinnipegPlace(city?: string | null, label?: string | null): boolean {
  const hay = `${city || ""} ${label || ""}`.toLowerCase();
  return hay.includes("winnipeg") || /\bwpg\b/.test(hay);
}

/** Catalogue typos such as "Winnpeg" stay on the outreach list. */
export function isWinnipegOutreachCity(city?: string | null, label?: string | null): boolean {
  const hay = `${city || ""} ${label || ""}`.toLowerCase();
  return isWinnipegPlace(city, label) || hay.includes("winnpeg");
}

/** Same honesty as listing-readiness isRealListingPhoto. */
export function isRealListingPhoto(src?: string | null): boolean {
  const p = (src || "").trim();
  if (!p) return false;
  if (p.includes("placeholder")) return false;
  if (p.includes("-logo")) return false;
  if (isUnflaggedSharedFallbackSrc(p)) return false;
  if (p.includes("/photos/wpg/")) return false;
  if (/street-?view|maps\.google|googleusercontent|unsplash|picsum|loremflickr/i.test(p)) return false;
  if (p.startsWith("data:image")) return true;
  if (p.startsWith("/photos/buildings/")) return true;
  if (p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

export type CompletenessInput = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  website?: string | null;
  licenseNumber?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  agesKnown?: boolean | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  amenities?: string | null;
  photos?: string | string[] | null;
  feeConfirmed?: boolean | null;
  feeProgram?: string | null;
  claimed?: boolean | null;
  claimedAt?: string | null;
  claimStatus?: string | null;
  listingActive?: boolean | null;
  ratingX10?: number | null;
  reviewCount?: number | null;
  visibility?: string | null;
  isTest?: boolean | number | null;
};

/** Same rule as listing-readiness hasConfirmedAges. Explicit false blocks a range. */
export function hasConfirmedAges(
  d: Pick<CompletenessInput, "agesKnown" | "ageMinMonths" | "ageMaxMonths">,
): boolean {
  if (d.agesKnown === false) return false;
  if (d.agesKnown) return true;
  const min = d.ageMinMonths ?? 0;
  const max = d.ageMaxMonths ?? 0;
  return max > min && max > 0;
}

export function hasRealPhoto(d: Pick<CompletenessInput, "photos">): boolean {
  return splitPhotoList(d.photos).some((src) => isRealListingPhoto(src));
}

export type LiveLookingGap = "ages" | "fees" | "photo";

export function liveLookingGaps(d: CompletenessInput): LiveLookingGap[] {
  const gaps: LiveLookingGap[] = [];
  if (!hasConfirmedAges(d)) gaps.push("ages");
  if (!hasConfirmedFeeLine(d)) gaps.push("fees");
  if (!hasRealPhoto(d)) gaps.push("photo");
  return gaps;
}

export function isLiveLookingCard(d: CompletenessInput): boolean {
  return liveLookingGaps(d).length === 0;
}

export function isSearchVisibleListing(d: CompletenessInput): boolean {
  if (d.listingActive === false) return false;
  const visibility: ListingVisibilityInput = {
    id: d.id,
    slug: d.slug,
    name: d.name,
    licenseNumber: d.licenseNumber,
    address: d.address,
    visibility: d.visibility,
    isTest: d.isTest,
  };
  return isPublicListing(visibility);
}

export function isPlatformLiveListing(d: CompletenessInput): boolean {
  const extra: PlatformLiveExtra = {
    listingActive: d.listingActive,
    ratingX10: d.ratingX10 ?? 0,
    reviewCount: d.reviewCount ?? 0,
    claimStatus: d.claimStatus,
    claimedAt: d.claimedAt,
  };
  return isPlatformLive(d.id || "", Boolean(d.claimed || d.claimedAt), extra) && isSearchVisibleListing(d);
}

export type LiveLookingSummary = {
  searchVisible: number;
  platformLive: number;
  withAges: number;
  withFees: number;
  withRealPhoto: number;
  liveLooking: number;
  liveLookingShare: number;
  photoFirstGaps: number;
};

export function summarizeLiveLooking(rows: readonly CompletenessInput[]): LiveLookingSummary {
  const visible = rows.filter(isSearchVisibleListing);
  let platformLive = 0;
  let withAges = 0;
  let withFees = 0;
  let withRealPhoto = 0;
  let liveLooking = 0;
  let photoFirstGaps = 0;
  for (const row of visible) {
    const ages = hasConfirmedAges(row);
    const fees = hasConfirmedFeeLine(row);
    const photo = hasRealPhoto(row);
    if (isPlatformLiveListing(row)) platformLive += 1;
    if (ages) withAges += 1;
    if (fees) withFees += 1;
    if (photo) withRealPhoto += 1;
    if (ages && fees && photo) liveLooking += 1;
    else if (photo) photoFirstGaps += 1;
  }
  return {
    searchVisible: visible.length,
    platformLive,
    withAges,
    withFees,
    withRealPhoto,
    liveLooking,
    liveLookingShare: visible.length ? liveLooking / visible.length : 0,
    photoFirstGaps,
  };
}

export const GAP_CSV_HEADERS = [
  "id",
  "slug",
  "name",
  "city",
  "phone",
  "license_number",
  "website",
  "address",
  "platform_live",
  "has_real_photo",
  "missing_ages",
  "missing_fees",
  "missing_photo",
  "age_min_months",
  "age_max_months",
  "infant_monthly",
  "toddler_monthly",
  "preschool_monthly",
  "part_time_monthly",
  "fee_program",
  "photo_url",
  "source",
] as const;

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Outreach CSV. Fill columns stay blank — the catalogue fee guess is not copied. */
export function winnipegGapsCsv(rows: readonly CompletenessInput[]): string {
  const visible = rows.filter((row) => isSearchVisibleListing(row) && isWinnipegOutreachCity(row.city));
  const ranked = [...visible].sort((a, b) => {
    const aPhoto = hasRealPhoto(a) && !isLiveLookingCard(a) ? 0 : 1;
    const bPhoto = hasRealPhoto(b) && !isLiveLookingCard(b) ? 0 : 1;
    if (aPhoto !== bPhoto) return aPhoto - bPhoto;
    return (a.name || "").localeCompare(b.name || "");
  });
  const lines = [GAP_CSV_HEADERS.join(",")];
  for (const row of ranked) {
    const gaps = liveLookingGaps(row);
    lines.push(
      [
        row.id,
        row.slug,
        row.name,
        row.city,
        row.phone || "",
        row.licenseNumber || "",
        row.website || "",
        row.address || "",
        isPlatformLiveListing(row) ? 1 : 0,
        hasRealPhoto(row) ? 1 : 0,
        gaps.includes("ages") ? 1 : 0,
        gaps.includes("fees") ? 1 : 0,
        gaps.includes("photo") ? 1 : 0,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export type FillPatch = {
  id: string;
  ageMinMonths?: number;
  ageMaxMonths?: number;
  infantMonthly?: number;
  toddlerMonthly?: number;
  preschoolMonthly?: number;
  partTimeMonthly?: number;
  photoUrl?: string;
  feeProgram?: string;
  source?: string;
};

export type FillPlan = {
  id: string;
  action: "apply" | "skip" | "reject";
  reason: string;
  setAges?: { min: number; max: number };
  setFees?: Partial<Record<"infantMonthly" | "toddlerMonthly" | "preschoolMonthly" | "partTimeMonthly", number>>;
  setPhoto?: string;
  setFeeProgram?: string;
};

const BLOCKED_SOURCE = /^(catalogue|catalog|guess|estimated|estimate|invented|default|placeholder|ten-a-day|funded|harvest|fee\s*218|218)$/i;

function cleanSource(raw?: string | null): string {
  return (raw || "").trim();
}

function sourceOk(source: string): boolean {
  if (source.length < 12) return false;
  if (BLOCKED_SOURCE.test(source)) return false;
  return true;
}

function optionalFee(raw: string | undefined): number | undefined | "bad" {
  const text = (raw || "").trim();
  if (!text) return undefined;
  if (!/^\d+$/.test(text)) return "bad";
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 8000) return "bad";
  return n;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
      continue;
    }
    if (ch !== "\r") cell += ch;
  }
  row.push(cell);
  if (row.some((part) => part.trim())) rows.push(row);
  return rows;
}

export function parseGapCsv(text: string): { patches: FillPatch[]; errors: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { patches: [], errors: ["CSV is empty"] };
  const header = table[0].map((cell) => cell.trim());
  const index = new Map(header.map((name, i) => [name, i]));
  if (!index.has("id") || !index.has("source")) {
    return { patches: [], errors: ["CSV needs id and source columns"] };
  }
  const errors: string[] = [];
  const patches: FillPatch[] = [];
  const take = (cells: string[], key: string) => {
    const at = index.get(key);
    return at == null ? "" : (cells[at] || "").trim();
  };
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    const id = take(cells, "id");
    if (!id) {
      errors.push(`Row ${i + 1} is missing id`);
      continue;
    }
    const ages = [take(cells, "age_min_months"), take(cells, "age_max_months")];
    const fees = {
      infantMonthly: optionalFee(take(cells, "infant_monthly")),
      toddlerMonthly: optionalFee(take(cells, "toddler_monthly")),
      preschoolMonthly: optionalFee(take(cells, "preschool_monthly")),
      partTimeMonthly: optionalFee(take(cells, "part_time_monthly")),
    };
    if (Object.values(fees).some((value) => value === "bad") || ages.some((value) => value && !/^\d+$/.test(value))) {
      errors.push(`Row ${i + 1} (${id}) has a non-numeric age or fee`);
      continue;
    }
    if (Object.values(fees).some((value) => value === CATALOGUE_MONTHLY_FEE_GUESS)) {
      errors.push(`Row ${i + 1} (${id}) uses the harvested catalogue fee 218`);
      continue;
    }
    const feeProgramRaw = take(cells, "fee_program");
    const feeProgram = feeProgramRaw ? normalizeFeeProgram(feeProgramRaw) : null;
    if (feeProgramRaw && !feeProgram) {
      errors.push(
        `Row ${i + 1} (${id}) fee_program must be mb-10-day (Manitoba funded, maximum regulated daily fee $10), not a monthly amount or a catalogue guess`,
      );
      continue;
    }
    const patch: FillPatch = { id, source: take(cells, "source") };
    if (ages[0] || ages[1]) {
      patch.ageMinMonths = ages[0] ? Number(ages[0]) : undefined;
      patch.ageMaxMonths = ages[1] ? Number(ages[1]) : undefined;
    }
    for (const key of ["infantMonthly", "toddlerMonthly", "preschoolMonthly", "partTimeMonthly"] as const) {
      const value = fees[key];
      if (typeof value === "number") patch[key] = value;
    }
    const photo = take(cells, "photo_url");
    if (photo) patch.photoUrl = photo;
    if (feeProgram) patch.feeProgram = feeProgram;
    patches.push(patch);
  }
  return { patches, errors };
}

function feeKeyFilled(
  current: CompletenessInput,
  key: "infantMonthly" | "toddlerMonthly" | "preschoolMonthly" | "partTimeMonthly",
) {
  const value = current[key];
  return value != null && value > 0;
}

/**
 * Plan one sourced fill. Existing confirmed ages, positive fees, and real photos stay.
 * Empty cells and unsourced rows do not write.
 */
function feeProgramPlan(current: CompletenessInput, raw?: string | null): { ok: true; code?: string } | { ok: false; reason: string } {
  const text = (raw || "").trim();
  if (!text) return { ok: true };
  const code = normalizeFeeProgram(text);
  if (!code) {
    return {
      ok: false,
      reason:
        "Fee program must be mb-10-day (Manitoba funded, maximum regulated daily fee $10). A daily cap is not written as a monthly fee.",
    };
  }
  const province = (current.province || "").trim().toUpperCase();
  if (province !== "MB") {
    return { ok: false, reason: "mb-10-day applies only to Manitoba listings" };
  }
  if (normalizeFeeProgram(current.feeProgram) === code) return { ok: true };
  return { ok: true, code };
}

export function planCompletenessFill(current: CompletenessInput, patch: FillPatch): FillPlan {
  const id = (patch.id || current.id || "").trim();
  const wantsAges = patch.ageMinMonths != null || patch.ageMaxMonths != null;
  const feeEntries = (
    ["infantMonthly", "toddlerMonthly", "preschoolMonthly", "partTimeMonthly"] as const
  ).filter((key) => patch[key] != null);
  const wantsPhoto = Boolean((patch.photoUrl || "").trim());
  const program = feeProgramPlan(current, patch.feeProgram);
  if (!program.ok) return { id, action: "reject", reason: program.reason };
  if (!wantsAges && !feeEntries.length && !wantsPhoto && !program.code) {
    return { id, action: "skip", reason: "No ages, fees, fee program, or photo to write" };
  }
  const source = cleanSource(patch.source);
  if (!sourceOk(source)) {
    return { id, action: "reject", reason: "Source must name where the fact came from (URL or operator note, 12+ characters)" };
  }
  const plan: FillPlan = { id, action: "apply", reason: "Sourced fill" };
  if (wantsAges) {
    const min = patch.ageMinMonths;
    const max = patch.ageMaxMonths;
    if (min == null || max == null || !Number.isInteger(min) || !Number.isInteger(max)) {
      return { id, action: "reject", reason: "Ages need both minimum and maximum months" };
    }
    if (min < 0 || max > 216 || max <= min) {
      return { id, action: "reject", reason: "Age range must be 0–216 months with max greater than min" };
    }
    if (hasConfirmedAges(current)) {
      plan.reason = "Ages already confirmed — left unchanged";
    } else {
      plan.setAges = { min, max };
    }
  }
  if (feeEntries.length) {
    const setFees: NonNullable<FillPlan["setFees"]> = {};
    for (const key of feeEntries) {
      const next = patch[key];
      if (next == null || !Number.isInteger(next) || next < 1 || next > 8000) {
        return { id, action: "reject", reason: "Fees must be whole dollars from 1 to 8000" };
      }
      if (next === CATALOGUE_MONTHLY_FEE_GUESS) {
        return { id, action: "reject", reason: "218 is the harvested catalogue fee, not a sourced parent fee" };
      }
      if (!feeKeyFilled(current, key)) setFees[key] = next;
    }
    if (Object.keys(setFees).length) plan.setFees = setFees;
  }
  if (wantsPhoto) {
    const photo = (patch.photoUrl || "").trim();
    if (!isRealListingPhoto(photo)) {
      return { id, action: "reject", reason: "Photo must be a real centre image, not a placeholder or aerial fallback" };
    }
    if (hasRealPhoto(current)) {
      if (!plan.setAges && !plan.setFees && !program.code) {
        return { id, action: "skip", reason: "Real photo already on file" };
      }
    } else {
      plan.setPhoto = photo;
    }
  }
  if (program.code) plan.setFeeProgram = program.code;
  if (!plan.setAges && !plan.setFees && !plan.setPhoto && !plan.setFeeProgram) {
    return { id, action: "skip", reason: plan.reason || "Nothing empty to fill" };
  }
  return plan;
}

export function mergePhotoList(current: string | string[] | null | undefined, photo: string): string {
  const rest = splitPhotoList(current).filter((src) => src && src !== photo && !src.includes("placeholder"));
  return [photo, ...rest].join(",");
}
