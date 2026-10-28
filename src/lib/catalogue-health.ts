/** Counts from rows the admin desk already loaded. No extra catalogue query. */

export const HEALTH_PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;

export type HealthRow = {
  province?: string | null;
  live?: boolean;
  claimedAt?: string | null;
  licenseNumber?: string | null;
  storefrontPhoto?: string | null;
  isTest?: boolean;
};

export type CatalogueHealth = {
  listingsTotal: number;
  claimedCount: number;
  licenceOnFile: number;
  photosConfirmed: number;
  byProvince: Record<string, number>;
};

export function summarizeCatalogueHealth(rows: HealthRow[]): CatalogueHealth {
  const byProvince = Object.fromEntries(HEALTH_PROVINCES.map((code) => [code, 0])) as Record<string, number>;
  let listingsTotal = 0;
  let claimedCount = 0;
  let licenceOnFile = 0;
  let photosConfirmed = 0;
  for (const row of rows) {
    if (row.isTest) continue;
    listingsTotal += 1;
    const code = (row.province || "").trim().toUpperCase();
    if (byProvince[code] != null) byProvince[code] += 1;
    if (row.live || row.claimedAt) claimedCount += 1;
    if ((row.licenseNumber || "").trim()) licenceOnFile += 1;
    const photo = row.storefrontPhoto || "";
    if (photo.includes("/photos/") && !/placeholder|-logo/i.test(photo)) photosConfirmed += 1;
  }
  return { listingsTotal, claimedCount, licenceOnFile, photosConfirmed, byProvince };
}
