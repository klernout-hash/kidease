/**
 * Per-jurisdiction registry adapters.
 *
 * Manitoba has a **local catalogue** path: licence numbers that already exist
 * in the bundled KidEase MB index can be matched. That is not a live scrape of
 * childcaresearch.gov.mb.ca — do not add a "Sync now" button that pretends one
 * ran.
 *
 * Ontario, Alberta, British Columbia, Saskatchewan, and Québec have documented
 * stub adapters. They always fail closed to operator manual review. They never
 * return a live match. There is no official open-data feed or documented public
 * API for those registries, and we will not scrape their HTML search UIs.
 *
 * Remaining stubs stay stubs because:
 * - No committed licence snapshot (unlike MB centres.json)
 * - Official pages are HTML search UIs, not a stable public API
 * - Scraping would invent matches and hide behind a green "adapter" badge
 */

import {
  isManualStubAdapter,
  JURISDICTIONS,
  type AdapterStatus,
  type Jurisdiction,
} from "../province-registry.ts";
import mbIndexJson from "../data/mb-registry-index.json" with { type: "json" };

export { adapterStatusLabel, isManualStubAdapter, MANUAL_STUB_ADAPTER_CODES } from "../province-registry.ts";

export type ManitobaRegistryRow = {
  id: string;
  licenseNumber: string;
  name: string;
  city: string;
};

export type RegistryMatch = {
  id: string;
  name: string;
  city: string;
  licenseNumber: string;
  province: string;
  source: "local_catalog";
};

export type RegistryLookup = {
  ok: boolean;
  status: AdapterStatus;
  reason: "stub" | "manual" | "missing_number" | "not_in_snapshot" | "local_catalog";
  notes: string;
  registryUrl: string | null;
  match?: RegistryMatch;
};

const MB_STUB_NOTES =
  "Local KidEase catalogue match only. Not a live scrape of childcaresearch.gov.mb.ca.";

function normalizeLicence(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function licenceKeys(value: string) {
  const n = normalizeLicence(value);
  if (!n) return [];
  const keys = new Set<string>([n]);
  const tail = n.includes("-") ? n.split("-").pop() || n : n;
  keys.add(tail);
  const stripped = tail.replace(/^0+/, "") || tail;
  keys.add(stripped);
  if (/^\d+$/.test(tail) && tail.length < 7) keys.add(tail.padStart(7, "0"));
  if (/^\d+$/.test(stripped) && stripped.length < 7) keys.add(stripped.padStart(7, "0"));
  keys.add(`MB-${tail}`);
  keys.add(`MB-${stripped}`);
  return [...keys];
}

export function loadManitobaRegistryIndex(
  rows: ManitobaRegistryRow[] = mbIndexJson as ManitobaRegistryRow[],
): Map<string, ManitobaRegistryRow> {
  const map = new Map<string, ManitobaRegistryRow>();
  for (const row of rows) {
    for (const key of licenceKeys(row.licenseNumber)) {
      if (!map.has(key)) map.set(key, row);
    }
    for (const key of licenceKeys(row.id)) {
      if (!map.has(key)) map.set(key, row);
    }
  }
  return map;
}

const MB_INDEX = loadManitobaRegistryIndex();

export function lookupManitobaLicense(
  licenseNumber: string | null | undefined,
  index: Map<string, ManitobaRegistryRow> = MB_INDEX,
): ManitobaRegistryRow | null {
  for (const key of licenceKeys(licenseNumber || "")) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}

function stubLookup(status: AdapterStatus, reason: RegistryLookup["reason"], notes: string, registryUrl: string | null): RegistryLookup {
  return { ok: false, status, reason, notes, registryUrl };
}

const FAIL_CLOSED_NO_NUMBER =
  "No licence number on file. This adapter is a stub and fails closed to operator manual review. Not a live registry match.";

/**
 * Documented stub adapter for ON / AB / BC / SK / QC.
 * Always `ok: false`. A licence number on file still fails closed — operators
 * review the official registry. Never invents a match.
 */
export function lookupManualStubAdapter(
  code: string,
  licenseNumber?: string | null,
  jurisdiction?: Jurisdiction,
): RegistryLookup {
  const j = jurisdiction ?? JURISDICTIONS.find((row) => row.code === code.toUpperCase());
  if (!j || !isManualStubAdapter(j.code)) {
    return stubLookup("stub", "stub", "Unknown stub adapter. KidEase does not invent a registry match.", null);
  }
  const number = (licenseNumber || "").trim();
  if (!number) {
    return stubLookup("manual", "missing_number", FAIL_CLOSED_NO_NUMBER, j.registryUrl);
  }
  return stubLookup("manual", "manual", j.adapterNotes, j.registryUrl);
}

export function lookupRegistry(
  code: string,
  licenseNumber?: string | null,
  index: Map<string, ManitobaRegistryRow> = MB_INDEX,
): RegistryLookup {
  const j = JURISDICTIONS.find((row) => row.code === code.toUpperCase());
  const number = (licenseNumber || "").trim();
  if (!j) {
    return stubLookup("stub", "stub", "Unknown jurisdiction. KidEase does not invent a registry match.", null);
  }
  if (!number) {
    return stubLookup(
      j.adapterStatus,
      "missing_number",
      j.code === "MB"
        ? "No licence number on file. Mark unverified until the operator or an adapter supplies one."
        : FAIL_CLOSED_NO_NUMBER,
      j.registryUrl,
    );
  }

  if (j.code === "MB") {
    const hit = lookupManitobaLicense(number, index);
    if (hit) {
      return {
        ok: true,
        status: "adapter_ready",
        reason: "local_catalog",
        notes: MB_STUB_NOTES,
        registryUrl: j.registryUrl,
        match: {
          id: hit.id,
          name: hit.name,
          city: hit.city,
          licenseNumber: hit.licenseNumber,
          province: "MB",
          source: "local_catalog",
        },
      };
    }
    return stubLookup(
      "adapter_ready",
      "not_in_snapshot",
      `${MB_STUB_NOTES} Licence ${number} is not in the bundled Manitoba snapshot.`,
      j.registryUrl,
    );
  }

  if (isManualStubAdapter(j.code)) {
    return lookupManualStubAdapter(j.code, number, j);
  }

  return stubLookup(
    j.adapterStatus,
    j.adapterStatus === "manual" ? "manual" : "stub",
    j.adapterNotes,
    j.registryUrl,
  );
}

/** True when this lookup is a real local match — never true for a stub province. */
export function registryLookupIsLive(result: RegistryLookup) {
  return result.ok === true && result.reason === "local_catalog" && Boolean(result.match);
}
