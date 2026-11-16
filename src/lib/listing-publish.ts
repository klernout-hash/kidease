import { isCanadianProvinceCode, provinceFromPostalCode } from "./geo.ts";

/** Fields the publish form can read from the DOM when React state is still empty. */
export type ListingPublishDraft = {
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  licenseNumber: string;
  infantMonthly: number;
  toddlerMonthly: number;
  preschoolMonthly: number;
  storefront: string;
  staffLanguages: string[];
  culturalPrograms: string[];
  culturalTeamNote: string;
};

const REQUIRED = ["name", "address", "city", "province", "postalCode", "licenseNumber"] as const;

export type ListingPublishRequired = (typeof REQUIRED)[number];

function textField(dom: FormData, key: string, fallback: string): string {
  const raw = dom.get(key);
  if (typeof raw === "string" && raw.trim()) return raw;
  return fallback;
}

function feeField(dom: FormData, key: string, fallback: number): number {
  const raw = dom.get(key);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Prefer a typed or autofilled value in the form over empty React state.
 * Culture chips and the photo data URL stay on the React draft.
 */
export function mergeListingDraft(state: ListingPublishDraft, dom: FormData): ListingPublishDraft {
  const postalCode = textField(dom, "postalCode", state.postalCode);
  const chosen = textField(dom, "province", state.province).trim().toUpperCase();
  const province = isCanadianProvinceCode(chosen) ? chosen : provinceFromPostalCode(postalCode) || "";
  return {
    ...state,
    name: textField(dom, "name", state.name),
    address: textField(dom, "address", state.address),
    city: textField(dom, "city", state.city),
    province,
    postalCode,
    licenseNumber: textField(dom, "licenseNumber", state.licenseNumber),
    infantMonthly: feeField(dom, "infantMonthly", state.infantMonthly),
    toddlerMonthly: feeField(dom, "toddlerMonthly", state.toddlerMonthly),
    preschoolMonthly: feeField(dom, "preschoolMonthly", state.preschoolMonthly),
    culturalTeamNote: textField(dom, "culturalTeamNote", state.culturalTeamNote),
  };
}

export function listingPublishMissing(draft: ListingPublishDraft): ListingPublishRequired[] {
  return REQUIRED.filter((key) => {
    const value = String(draft[key] ?? "").trim();
    if (!value) return true;
    if (key === "province") return !isCanadianProvinceCode(value);
    return false;
  });
}
