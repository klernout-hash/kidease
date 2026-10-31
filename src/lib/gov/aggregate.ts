/**
 * Turn raw public-listing counts into a government dashboard.
 * No names, emails, phones, or child fields belong in this module.
 */

import { K_ANONYMITY, suppressCount, suppressRows } from "./k-anonymity.ts";
import {
  censusPopulationForPlace,
  CENSUS_SOURCE,
  isProvinceCode,
  provinceInfo,
  provinceName,
  regionForCity,
  regionLabel,
  PROVINCES,
  type ProvinceCode,
} from "./places.ts";

export type GovLocale = "en" | "fr";

export type CityFact = {
  province: string;
  city: string;
  centres: number;
  licensed: number;
  capacity: number;
  capacityKnown: number;
  vacancyReporters: number;
  vacancyFresh30: number;
  openSpots: number;
  cwelccKnown: number;
  feesConfirmed: number;
  feesUncited: number;
  french: number;
  english: number;
  inclusion: number;
  lat: number;
  lng: number;
};

export type FeeBucketFact = { bucket: string; kind: "confirmed" | "uncited"; n: number };
export type WaitlistFact = { age: string; start: string; n: number };
export type TrendFact = { month: string; listings: number; vacancyUpdates: number; jobs: number };
export type FillFact = { n: number; avgDays: number | null };

export type GovScope = {
  province: "ALL" | ProvinceCode;
  region: string;
  city: string;
};

export type GovNumber = number | null;

export type GovDashboard = {
  locale: GovLocale;
  placeLabel: string;
  province: string;
  region: string;
  city: string;
  generatedAt: string;
  k: number;
  orgName: string;
  demo: boolean;
  readOnly: boolean;
  coverage: string[];
  kpis: {
    licensedCentres: GovNumber;
    directoryCentres: GovNumber;
    capacity: GovNumber;
    capacityKnownCentres: GovNumber;
    vacancyReporters: GovNumber;
    vacancyFresh30: GovNumber;
    openSpots: GovNumber;
    avgFillDays: GovNumber;
    cwelccKnown: GovNumber;
    cwelccUnknown: GovNumber;
    frenchCentres: GovNumber;
    englishCentres: GovNumber;
    inclusionCentres: GovNumber;
    jobPosts: GovNumber;
    feesConfirmedCentres: GovNumber;
    feesUncitedCentres: GovNumber;
  };
  cities: Array<{ label: string; centres: GovNumber; capacity: GovNumber; openSpots: GovNumber; suppressed: boolean }>;
  regions: Array<{ label: string; centres: GovNumber; suppressed: boolean }>;
  fees: Array<{ bucket: string; kind: "confirmed" | "uncited"; centres: GovNumber; suppressed: boolean }>;
  waitlist: Array<{ age: string; start: string; n: GovNumber; suppressed: boolean }>;
  trends: Array<{ month: string; listings: GovNumber; vacancyUpdates: GovNumber; jobs: GovNumber }>;
  map: Array<{ lat: number; lng: number; centres: number; capacity: number; openSpots: number; desert: number | null }>;
  desert: { population: number | null; perSpace: number | null; source: string | null };
  selectors: {
    provinces: Array<{ code: string; name: string }>;
    regions: string[];
    cities: string[];
  };
  hiddenAreas: number;
};

export type GovRaw = {
  cities: CityFact[];
  fees: FeeBucketFact[];
  waitlist: WaitlistFact[];
  trends: TrendFact[];
  fill: FillFact;
  jobs: number;
  generatedAt?: string;
};

function sum(rows: CityFact[], pick: (row: CityFact) => number): number {
  return rows.reduce((total, row) => total + (Number.isFinite(pick(row)) ? pick(row) : 0), 0);
}

function scopeRows(raw: CityFact[], scope: GovScope): CityFact[] {
  return raw.filter((row) => {
    const province = row.province.trim().toUpperCase();
    if (scope.province !== "ALL" && province !== scope.province) return false;
    if (scope.region && scope.region !== "ALL" && regionForCity(row.city) !== scope.region) return false;
    if (scope.city && scope.city !== "ALL" && row.city.trim().toLowerCase() !== scope.city.trim().toLowerCase()) {
      return false;
    }
    return true;
  });
}

export function parseGovScope(input: { province?: string | null; region?: string | null; city?: string | null }): GovScope {
  const provinceRaw = String(input.province || "ALL")
    .trim()
    .toUpperCase();
  const province = provinceRaw === "ALL" || isProvinceCode(provinceRaw) ? (provinceRaw as GovScope["province"]) : "ALL";
  const region = String(input.region || "ALL").trim().slice(0, 80) || "ALL";
  const city = String(input.city || "ALL").trim().slice(0, 80) || "ALL";
  return { province, region, city };
}

function placeLabel(scope: GovScope, locale: GovLocale): string {
  const province = provinceName(scope.province, locale);
  if (scope.city && scope.city !== "ALL") return `${scope.city}, ${province}`;
  if (scope.region && scope.region !== "ALL") {
    const region = regionLabel(scope.region, locale);
    return `${region}, ${province}`;
  }
  return province;
}

function coverage(locale: GovLocale, scope: GovScope, rows: CityFact[]): string[] {
  const fr = locale === "fr";
  const notes = [
    fr
      ? "Ces chiffres viennent des fiches publiques KidEase. Les groupes de moins de 5 sont cachés. Aucun nom, courriel, téléphone ou renseignement sur un enfant n’est inclus."
      : "These numbers come from public KidEase listings. Groups under 5 are hidden. No names, emails, phones, or child details are included.",
    fr
      ? "Permis veut dire qu’un numéro de permis est enregistré et que le permis n’est pas marqué expiré ou suspendu. Une fiche sans numéro reste dans le répertoire, pas dans le total des permis."
      : "Licensed means a licence number is stored and the licence is not marked expired or suspended. A listing with no number stays in the directory count, not the licensed total.",
    fr
      ? "La capacité est la somme des places permises seulement quand la fiche a un nombre. Les fiches sans nombre ne sont pas dans le total."
      : "Capacity adds licensed spaces only when the listing has a number. Listings without a number are not in that total.",
    fr
      ? "Les places ouvertes comptent seulement quand le centre a mis à jour ses disponibilités. Un zéro par défaut n’est pas une mise à jour."
      : "Open spots count only when the centre has updated vacancies. A default zero is not an update.",
    fr
      ? "Les frais confirmés ont une source citée. Un montant sans source est non cité. KidEase n’invente pas un tarif provincial. Le programme de frais est un oui ou non, pas un montant."
      : "Confirmed fees have a cited source. A dollar amount with no source is uncited. KidEase does not invent a provincial fee. A fee program is a yes or no, not a dollar amount.",
    fr
      ? `Le signal de désert utilise la population du ${CENSUS_SOURCE}. C’est la population totale par place permise, pas le nombre d’enfants de 0 à 5 ans. Une ville sans chiffre de recensement n’a pas de score.`
      : `The desert signal uses ${CENSUS_SOURCE} population. It is total population per licensed space, not a count of children aged 0 to 5. A city with no census figure has no score.`,
    fr
      ? "La région suit une courte liste de grandes villes. Les autres villes sont groupées. Ce n’est pas une limite officielle de Statistique Canada."
      : "Region follows a short list of major cities. Other cities are grouped. This is not an official Statistics Canada boundary.",
    fr
      ? "Les emplois sont des annonces KidEase. Le texte de l’annonce n’est pas montré. Ce n’est pas une liste provinciale de postes d’EPE."
      : "Jobs are KidEase postings. The posting text is not shown. This is not a provincial ECE vacancy list.",
    fr
      ? "La liste d’attente de zone compte des recherches enregistrées, pas des enfants. Une épingle hors province n’est pas comptée."
      : "Area waitlist counts saved searches, not children. A pin outside the province box is left out.",
  ];
  if (rows.length === 0) {
    notes.push(
      fr
        ? "Aucune fiche publique ne correspond à ce choix. Le total est 0, pas une estimation."
        : "No public listing matches this choice. The total is 0, not an estimate.",
    );
  }
  if (scope.city !== "ALL") {
    notes.push(
      fr
        ? "Une ville trop petite n’affiche pas ses propres chiffres. Le total de la province les inclut encore."
        : "A city that is too small does not show its own numbers. The province total still includes it.",
    );
  }
  return notes;
}

function desertFor(scope: GovScope, capacity: number | null): GovDashboard["desert"] {
  const population = censusPopulationForPlace({
    province: scope.province,
    city: scope.city !== "ALL" ? scope.city : null,
  });
  if (population == null || capacity == null || capacity <= 0) {
    return { population, perSpace: null, source: population == null ? null : CENSUS_SOURCE };
  }
  return {
    population,
    perSpace: Math.round((population / capacity) * 10) / 10,
    source: CENSUS_SOURCE,
  };
}

export function buildGovDashboard(
  raw: GovRaw,
  scopeInput: GovScope,
  locale: GovLocale,
  actor: { orgName: string; demo: boolean; readOnly: boolean },
): GovDashboard {
  const scope = parseGovScope(scopeInput);
  const inProvince = raw.cities.filter((row) => scope.province === "ALL" || row.province.trim().toUpperCase() === scope.province);
  const rows = scopeRows(raw.cities, scope);
  const directory = sum(rows, (row) => row.centres);
  const licensed = sum(rows, (row) => row.licensed);
  const capacity = sum(rows, (row) => row.capacity);
  const capacityKnown = sum(rows, (row) => row.capacityKnown);
  const reporters = sum(rows, (row) => row.vacancyReporters);
  const fresh = sum(rows, (row) => row.vacancyFresh30);
  const openSpots = sum(rows, (row) => row.openSpots);
  const cwelcc = sum(rows, (row) => row.cwelccKnown);
  const feesConfirmed = sum(rows, (row) => row.feesConfirmed);
  const feesUncited = sum(rows, (row) => row.feesUncited);
  const french = sum(rows, (row) => row.french);
  const english = sum(rows, (row) => row.english);
  const inclusion = sum(rows, (row) => row.inclusion);

  const cityRows = suppressRows(
    rows.map((row) => ({ label: row.city, n: row.centres, capacity: row.capacity, openSpots: row.openSpots, lat: row.lat, lng: row.lng })),
  );
  const visibleCities = cityRows.filter((row) => !row.suppressed && row.n != null && row.n >= K_ANONYMITY);
  const hiddenAreas = cityRows.filter((row) => row.suppressed).length;

  const regionMap = new Map<string, number>();
  for (const row of inProvince) {
    const region = regionForCity(row.city);
    regionMap.set(region, (regionMap.get(region) ?? 0) + row.centres);
  }
  const regionRows = suppressRows([...regionMap.entries()].map(([label, n]) => ({ label, n })));

  const feeRows = suppressRows(
    raw.fees
      .filter((row) => row.n >= 0)
      .map((row) => ({ bucket: row.bucket, kind: row.kind, n: row.n })),
  );

  const waitRows = suppressRows(raw.waitlist.map((row) => ({ age: row.age, start: row.start || "", n: row.n })));
  const trendRows = raw.trends.map((row) => ({
    month: row.month,
    listings: suppressCount(row.listings),
    vacancyUpdates: suppressCount(row.vacancyUpdates),
    jobs: suppressCount(row.jobs),
  }));

  const fillDays = raw.fill.n >= K_ANONYMITY && raw.fill.avgDays != null ? Math.round(raw.fill.avgDays * 10) / 10 : null;
  const desert = desertFor(scope, suppressCount(capacity));

  const map = visibleCities
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.n != null)
    .map((row) => {
      const cityDesert = censusPopulationForPlace({ province: scope.province, city: row.label });
      const cap = suppressCount(row.capacity);
      return {
        lat: row.lat,
        lng: row.lng,
        centres: row.n as number,
        capacity: cap ?? 0,
        openSpots: suppressCount(row.openSpots) ?? 0,
        desert: cityDesert != null && cap != null && cap > 0 ? Math.round((cityDesert / cap) * 10) / 10 : null,
      };
    });

  const regionChoices = [...regionMap.keys()].filter((label) => (regionMap.get(label) ?? 0) >= K_ANONYMITY);
  const cityChoices = visibleCities.map((row) => row.label).sort((a, b) => a.localeCompare(b, locale === "fr" ? "fr-CA" : "en"));

  return {
    locale,
    placeLabel: placeLabel(scope, locale),
    province: scope.province,
    region: scope.region,
    city: scope.city,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    k: K_ANONYMITY,
    orgName: actor.orgName,
    demo: actor.demo,
    readOnly: actor.readOnly,
    coverage: coverage(locale, scope, rows),
    kpis: {
      licensedCentres: suppressCount(licensed),
      directoryCentres: suppressCount(directory),
      capacity: suppressCount(capacity),
      capacityKnownCentres: suppressCount(capacityKnown),
      vacancyReporters: suppressCount(reporters),
      vacancyFresh30: suppressCount(fresh),
      openSpots: suppressCount(openSpots),
      avgFillDays: fillDays,
      cwelccKnown: suppressCount(cwelcc),
      cwelccUnknown: suppressCount(Math.max(0, licensed - cwelcc)),
      frenchCentres: suppressCount(french),
      englishCentres: suppressCount(english),
      inclusionCentres: suppressCount(inclusion),
      jobPosts: suppressCount(raw.jobs),
      feesConfirmedCentres: suppressCount(feesConfirmed),
      feesUncitedCentres: suppressCount(feesUncited),
    },
    cities: cityRows.map((row) => ({
      label: row.suppressed ? "" : row.label,
      centres: row.suppressed ? null : row.n,
      capacity: row.suppressed ? null : suppressCount(row.capacity),
      openSpots: row.suppressed ? null : suppressCount(row.openSpots),
      suppressed: row.suppressed,
    })),
    regions: regionRows.map((row) => ({
      label: row.suppressed ? "" : regionLabel(row.label, locale),
      centres: row.n,
      suppressed: row.suppressed,
    })),
    fees: feeRows.map((row) => ({
      bucket: row.bucket,
      kind: row.kind,
      centres: row.n,
      suppressed: row.suppressed,
    })),
    waitlist: waitRows.map((row) => ({
      age: row.age,
      start: row.start,
      n: row.n,
      suppressed: row.suppressed,
    })),
    trends: trendRows,
    map,
    desert,
    selectors: {
      provinces: [
        { code: "ALL", name: locale === "fr" ? "Tout le Canada" : "All of Canada" },
        ...PROVINCES.map((row) => ({ code: row.code, name: locale === "fr" ? row.nameFr : row.nameEn })),
      ],
      regions: ["ALL", ...regionChoices.sort((a, b) => a.localeCompare(b, locale === "fr" ? "fr-CA" : "en"))],
      cities: ["ALL", ...cityChoices],
    },
    hiddenAreas,
  };
}

export function dashboardView(province: string): { lat: number; lng: number; zoom: number } {
  const info = provinceInfo(province);
  if (!info) return { lat: 56, lng: -96, zoom: 3 };
  return { lat: info.lat, lng: info.lng, zoom: info.zoom };
}
