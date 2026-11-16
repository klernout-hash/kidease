/**
 * A pin is far when it sits more than PIN_DRIFT_KM from the city centre
 * for that city and province. The province matters: Oakville, MB is not
 * Oakville, ON. An unknown city is not flagged.
 */

import { CITIES, haversineKm, type LatLng } from "./geo.ts";

export const PIN_DRIFT_KM = 80;

const PROVINCE_CODE: Record<string, string> = {
  BC: "BC",
  BRITISHCOLUMBIA: "BC",
  AB: "AB",
  ALBERTA: "AB",
  SK: "SK",
  SASKATCHEWAN: "SK",
  MB: "MB",
  MANITOBA: "MB",
  ON: "ON",
  ONTARIO: "ON",
  QC: "QC",
  QUEBEC: "QC",
  NB: "NB",
  NEWBRUNSWICK: "NB",
  NS: "NS",
  NOVASCOTIA: "NS",
  PE: "PE",
  PEI: "PE",
  PRINCEEDWARDISLAND: "PE",
  NL: "NL",
  NEWFOUNDLAND: "NL",
  NEWFOUNDLANDANDLABRADOR: "NL",
  YT: "YT",
  YUKON: "YT",
  NT: "NT",
  NORTHWESTTERRITORIES: "NT",
  NU: "NU",
  NUNAVUT: "NU",
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function provinceCode(raw: string | null | undefined): string {
  const folded = fold(String(raw || "")).replace(/[^a-z]/g, "").toUpperCase();
  if (!folded) return "";
  return PROVINCE_CODE[folded] ?? (folded.length === 2 ? folded : "");
}

function cityName(label: string): string {
  return fold(label.split(",")[0] || "");
}

/** City centre for this city in this province. Null when the city is not in the list. */
export function cityCentre(city: string, province: string): (LatLng & { label: string }) | null {
  const code = provinceCode(province);
  const name = fold(city);
  if (!code || !name) return null;
  const hit = CITIES.find((row) => {
    if (row.province !== code) return false;
    if (cityName(row.label) === name) return true;
    return row.aliases.some((alias) => fold(alias) === name);
  });
  return hit ? { lat: hit.lat, lng: hit.lng, label: hit.label } : null;
}

export function pinDriftKm(
  lat: number | null | undefined,
  lng: number | null | undefined,
  city: string,
  province: string,
): number | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const centre = cityCentre(city, province);
  if (!centre) return null;
  return haversineKm({ lat, lng }, centre);
}

export function pinIsFar(
  lat: number | null | undefined,
  lng: number | null | undefined,
  city: string,
  province: string,
  limitKm = PIN_DRIFT_KM,
): boolean {
  const km = pinDriftKm(lat, lng, city, province);
  return km != null && km > limitKm;
}
