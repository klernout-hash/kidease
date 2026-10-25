import index from "../data/master-care-types.json" with { type: "json" };
import type { FacilityType } from "@/lib/facility-type";

/**
 * Official care class from the private master CSV (`care_type` / `facility_type`).
 * Keys are province|postal|name. No phones or emails.
 * c centre · f family home · g group home · n nursery · s school-age · b before/after
 */
const CODES = {
  c: "child_care_centre",
  f: "family_home",
  g: "group_home",
  n: "nursery_preschool",
  s: "school_age",
  b: "before_after",
} as const;

export type MasterCareCode = keyof typeof CODES;

const lookup = index as Record<string, string>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function masterCareKey(province: unknown, postal: unknown, name: unknown): string {
  const prov = text(province).trim().toUpperCase();
  const pc = text(postal).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const nm = text(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${prov}|${pc}|${nm}`;
}

export function masterCareCode(province: string, postal: string, name: string): MasterCareCode | null {
  const code = lookup[masterCareKey(province, postal, name)];
  if (code === "c" || code === "f" || code === "g" || code === "n" || code === "s" || code === "b") {
    return code;
  }
  return null;
}

/** Fill an empty facility class from the master. A provider-set type wins. */
export function applyMasterCareType<
  T extends {
    name: string;
    province: string;
    postalCode: string;
    amenities: string;
    facilityType?: FacilityType | null;
  },
>(row: T): T {
  const amenities = text(row.amenities);
  const safe = amenities === row.amenities ? row : { ...row, amenities };
  if (safe.facilityType) return safe;
  const code = masterCareCode(safe.province, safe.postalCode || "", safe.name);
  if (!code) return safe;
  if (code === "b") {
    if (amenities.split(",").some((part) => part.trim() === "before-after")) return safe;
    const next = amenities ? `${amenities},before-after` : "before-after";
    return { ...safe, amenities: next };
  }
  return { ...safe, facilityType: CODES[code] };
}
