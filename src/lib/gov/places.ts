/**
 * 13 provinces and territories. Census figures are Statistics Canada,
 * 2021 Census of Population (total population, not children aged 0 to 5).
 * City figures are census metropolitan areas where KidEase has a matching
 * city name. A city that is not in this list has no census number.
 */

export type ProvinceCode =
  | "BC"
  | "AB"
  | "SK"
  | "MB"
  | "ON"
  | "QC"
  | "NB"
  | "NS"
  | "PE"
  | "NL"
  | "YT"
  | "NT"
  | "NU";

export type ProvinceInfo = {
  code: ProvinceCode;
  nameEn: string;
  nameFr: string;
  /** 2021 Census total population. */
  population2021: number;
  lat: number;
  lng: number;
  zoom: number;
};

export const CENSUS_SOURCE = "Statistics Canada, 2021 Census of Population";

export const PROVINCES: readonly ProvinceInfo[] = [
  { code: "BC", nameEn: "British Columbia", nameFr: "Colombie-Britannique", population2021: 5_000_879, lat: 53.7, lng: -127.6, zoom: 4 },
  { code: "AB", nameEn: "Alberta", nameFr: "Alberta", population2021: 4_262_635, lat: 54.5, lng: -115, zoom: 4 },
  { code: "SK", nameEn: "Saskatchewan", nameFr: "Saskatchewan", population2021: 1_132_505, lat: 54.5, lng: -106, zoom: 5 },
  { code: "MB", nameEn: "Manitoba", nameFr: "Manitoba", population2021: 1_342_153, lat: 54.5, lng: -97, zoom: 4 },
  { code: "ON", nameEn: "Ontario", nameFr: "Ontario", population2021: 14_223_942, lat: 49.5, lng: -85, zoom: 4 },
  { code: "QC", nameEn: "Quebec", nameFr: "Québec", population2021: 8_501_833, lat: 52, lng: -72, zoom: 4 },
  { code: "NB", nameEn: "New Brunswick", nameFr: "Nouveau-Brunswick", population2021: 775_610, lat: 46.5, lng: -66.2, zoom: 6 },
  { code: "NS", nameEn: "Nova Scotia", nameFr: "Nouvelle-Écosse", population2021: 969_383, lat: 45, lng: -63, zoom: 6 },
  { code: "PE", nameEn: "Prince Edward Island", nameFr: "Île-du-Prince-Édouard", population2021: 154_331, lat: 46.3, lng: -63.3, zoom: 7 },
  { code: "NL", nameEn: "Newfoundland and Labrador", nameFr: "Terre-Neuve-et-Labrador", population2021: 510_550, lat: 53, lng: -60, zoom: 4 },
  { code: "YT", nameEn: "Yukon", nameFr: "Yukon", population2021: 40_232, lat: 63.5, lng: -135, zoom: 4 },
  { code: "NT", nameEn: "Northwest Territories", nameFr: "Territoires du Nord-Ouest", population2021: 41_070, lat: 64.5, lng: -118, zoom: 4 },
  { code: "NU", nameEn: "Nunavut", nameFr: "Nunavut", population2021: 36_858, lat: 66, lng: -95, zoom: 3 },
] as const;

export const CANADA_POPULATION_2021 = 36_991_981;

const BY_CODE = new Map(PROVINCES.map((row) => [row.code, row]));

export function provinceInfo(code: string | null | undefined): ProvinceInfo | null {
  const value = String(code || "")
    .trim()
    .toUpperCase();
  return BY_CODE.get(value as ProvinceCode) ?? null;
}

export function isProvinceCode(code: string | null | undefined): code is ProvinceCode {
  return provinceInfo(code) != null;
}

export function provinceName(code: string | null | undefined, locale: "en" | "fr"): string {
  if (!code || code === "ALL") return locale === "fr" ? "Canada" : "Canada";
  const row = provinceInfo(code);
  if (!row) return locale === "fr" ? "Canada" : "Canada";
  return locale === "fr" ? row.nameFr : row.nameEn;
}

/** Rough boxes so an area-waitlist pin can be counted in one province. Overlaps go to the smaller box. */
export type LatLngBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export const PROVINCE_BOXES: Record<ProvinceCode, LatLngBox> = {
  PE: { minLat: 45.9, maxLat: 47.1, minLng: -64.5, maxLng: -61.9 },
  NS: { minLat: 43.3, maxLat: 47.1, minLng: -66.5, maxLng: -59.6 },
  NB: { minLat: 44.5, maxLat: 48.1, minLng: -69.1, maxLng: -63.7 },
  NL: { minLat: 46.5, maxLat: 60.5, minLng: -67.9, maxLng: -52.5 },
  YT: { minLat: 60, maxLat: 69.7, minLng: -141.1, maxLng: -123.8 },
  BC: { minLat: 48.2, maxLat: 60.1, minLng: -139.1, maxLng: -114 },
  AB: { minLat: 49, maxLat: 60.1, minLng: -120.1, maxLng: -110 },
  SK: { minLat: 49, maxLat: 60.1, minLng: -110.1, maxLng: -101.3 },
  MB: { minLat: 49, maxLat: 60.1, minLng: -102.1, maxLng: -88.9 },
  ON: { minLat: 41.6, maxLat: 56.9, minLng: -95.2, maxLng: -74.3 },
  QC: { minLat: 45, maxLat: 62.6, minLng: -79.8, maxLng: -57 },
  NT: { minLat: 60, maxLat: 78.5, minLng: -136.5, maxLng: -102 },
  NU: { minLat: 51, maxLat: 83.2, minLng: -120, maxLng: -61 },
};

const BOX_ORDER: ProvinceCode[] = ["PE", "NS", "NB", "YT", "NL", "MB", "SK", "AB", "BC", "ON", "QC", "NT", "NU"];

export function provinceForPoint(lat: number, lng: number): ProvinceCode | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const code of BOX_ORDER) {
    const box = PROVINCE_BOXES[code];
    if (lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng) return code;
  }
  return null;
}

/**
 * 2021 CMA population for a city name KidEase already stores.
 * Not every city. Missing means we do not invent a population.
 */
export const CITY_CENSUS_2021: Readonly<Record<string, number>> = {
  toronto: 6_202_225,
  montreal: 4_291_732,
  montréal: 4_291_732,
  vancouver: 2_642_825,
  calgary: 1_481_806,
  ottawa: 1_488_307,
  gatineau: 1_488_307,
  edmonton: 1_418_118,
  winnipeg: 834_678,
  quebec: 839_311,
  "quebec city": 839_311,
  "québec": 839_311,
  hamilton: 785_184,
  kitchener: 575_847,
  london: 543_551,
  halifax: 465_703,
  windsor: 422_630,
  oshawa: 415_311,
  victoria: 397_237,
  saskatoon: 317_480,
  regina: 249_217,
  "st. john's": 212_579,
  "st john's": 212_579,
  kelowna: 222_162,
};

export function censusPopulationForPlace(input: { province: string; city?: string | null }): number | null {
  const city = String(input.city || "")
    .trim()
    .toLowerCase();
  if (city && city !== "all" && CITY_CENSUS_2021[city] != null) return CITY_CENSUS_2021[city];
  if (!city || city === "all") {
    if (!input.province || input.province === "ALL") return CANADA_POPULATION_2021;
    return provinceInfo(input.province)?.population2021 ?? null;
  }
  return null;
}

/** Major cities only. Every other city is "Other" so a tiny place is not its own region. */
const CITY_REGION: Readonly<Record<string, string>> = {
  vancouver: "Metro Vancouver",
  victoria: "Victoria",
  kelowna: "Kelowna",
  calgary: "Calgary",
  edmonton: "Edmonton",
  saskatoon: "Saskatoon",
  regina: "Regina",
  winnipeg: "Winnipeg",
  toronto: "Toronto",
  mississauga: "Toronto",
  brampton: "Toronto",
  hamilton: "Hamilton",
  london: "London",
  kitchener: "Kitchener",
  waterloo: "Kitchener",
  ottawa: "Ottawa",
  windsor: "Windsor",
  montreal: "Montreal",
  montréal: "Montreal",
  laval: "Montreal",
  quebec: "Quebec City",
  "québec": "Quebec City",
  halifax: "Halifax",
  "st. john's": "St. John's",
  "st john's": "St. John's",
  fredericton: "Fredericton",
  moncton: "Moncton",
  charlottetown: "Charlottetown",
  whitehorse: "Whitehorse",
  yellowknife: "Yellowknife",
  iqaluit: "Iqaluit",
};

export function regionForCity(city: string | null | undefined): string {
  const key = String(city || "")
    .trim()
    .toLowerCase();
  if (!key) return "Other";
  return CITY_REGION[key] ?? "Other";
}

export function regionLabel(region: string, locale: "en" | "fr"): string {
  if (region === "Other") return locale === "fr" ? "Autres villes" : "Other cities";
  if (region === "ALL") return locale === "fr" ? "Toutes les régions" : "All regions";
  return region;
}
