/**
 * Prince Edward Island master rows whose name is a city and postal code.
 * A real name is taken only from a master file. Nothing is guessed from the city.
 */

import {
  catalogueLicenceKey,
  decodeImportText,
  nameIsCityPostalLabel,
  splitCityPostalLabel,
} from "./catalog-match.ts";
import { masterListingId, parseMasterFacilities } from "./catalog-master-sync.ts";

export const PEI_NAME_UNRECOVERABLE = "pei_name_unrecoverable";

export type PeiFaultRow = {
  id: string;
  slug?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  licenseNumber?: string | null;
  mergedInto?: string | null;
};

export type PeiRecoveredName = {
  id: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  address: string | null;
};

export type PeiNameRepairPlan = {
  masterRows: number;
  recoverable: PeiRecoveredName[];
  hide: Array<{ id: string; slug: string; name: string; licenseNumber: string }>;
};

type MasterName = {
  id: string;
  licence: string;
  name: string;
  city: string;
  postal: string;
  address: string;
};

function blank(value: string | null | undefined) {
  return !(value || "").trim();
}

function stripMailingLabel(value: string) {
  return value.replace(/^mailing address:\s*/i, "").trim();
}

/**
 * Read name, city, and postal from a master CSV.
 * A name that is only `City, PE A1A 1A1` is not a centre name.
 * `facility_name` (and the same aliases the sync uses) wins when `name` is that label.
 */
export function masterNamesFromCsv(csvText: string): MasterName[] {
  return parseMasterFacilities(csvText).rows.map((row) => ({
    id: masterListingId(row.facilityId),
    licence: catalogueLicenceKey(row.licence),
    name: row.name,
    city: row.city,
    postal: row.postal,
    address: stripMailingLabel(row.address),
  }));
}

export function isPeiLocationNamedRow(row: PeiFaultRow): boolean {
  const province = (row.province || "").trim().toUpperCase();
  if (province !== "PE" && province !== "PEI") return false;
  if (!row.id.startsWith("mx-")) return false;
  if ((row.mergedInto || "").trim()) return false;
  return nameIsCityPostalLabel(row.name);
}

export function planPeiNameRepair(rows: PeiFaultRow[], masterCsv: string | null): PeiNameRepairPlan {
  const targets = rows.filter(isPeiLocationNamedRow);
  const master = masterCsv ? masterNamesFromCsv(masterCsv) : [];
  const byId = new Map(master.map((row) => [row.id, row]));
  const byLicence = new Map<string, MasterName>();
  for (const row of master) {
    if (row.licence && !byLicence.has(row.licence)) byLicence.set(row.licence, row);
  }
  const recoverable: PeiRecoveredName[] = [];
  const hide: PeiNameRepairPlan["hide"] = [];
  for (const row of targets) {
    const fromMaster = byId.get(row.id) || byLicence.get(catalogueLicenceKey(row.licenseNumber));
    const masterName = decodeImportText(fromMaster?.name || "");
    if (fromMaster && masterName && !nameIsCityPostalLabel(masterName)) {
      const split = splitCityPostalLabel(row.name);
      recoverable.push({
        id: row.id,
        name: masterName,
        city: blank(row.city) ? fromMaster.city || split?.city || null : null,
        postalCode: blank(row.postalCode) ? fromMaster.postal || split?.postal || null : null,
        address: fromMaster.address || null,
      });
      continue;
    }
    hide.push({
      id: row.id,
      slug: (row.slug || "").trim(),
      name: decodeImportText(row.name || ""),
      licenseNumber: (row.licenseNumber || "").trim(),
    });
  }
  return { masterRows: master.length, recoverable, hide };
}
