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

export function masterCareKey(province: string, postal: string, name: string): string {
  const prov = province.trim().toUpperCase();
  const pc = postal.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const nm = name
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
  if (row.facilityType) return row;
  const code = masterCareCode(row.province, row.postalCode || "", row.name);
  if (!code) return row;
  if (code === "b") {
    if (row.amenities.split(",").some((part) => part.trim() === "before-after")) return row;
    const amenities = row.amenities ? `${row.amenities},before-after` : "before-after";
    return { ...row, amenities };
  }
  return { ...row, facilityType: CODES[code] };
}
