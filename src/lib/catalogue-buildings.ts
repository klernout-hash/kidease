import officialBuildings from "./data/real-storefronts.json" with { type: "json" };
import presentFiles from "./data/catalogue-building-files.json" with { type: "json" };

/**
 * Official `/photos/buildings/{id}.jpg` paths that exist in the catalogue.
 * A mapped id with no file is not a photo: `/img` answers that miss with a
 * light-only raster (`#E8E4DC`), which stays beige in dark mode. Cards use
 * the theme wash instead of painting that image.
 */
const MAPPED_BUILDINGS = new Set(Object.values(officialBuildings));
const PRESENT_BUILDINGS = new Set(presentFiles);

export function isMissingCatalogueBuilding(src?: string | null): boolean {
  const path = String(src ?? "").trim().split("?")[0] ?? "";
  if (!MAPPED_BUILDINGS.has(path)) return false;
  return !PRESENT_BUILDINGS.has(path);
}
