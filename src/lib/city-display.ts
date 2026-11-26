/**
 * Registry rows sometimes write a city short (`Wpg`, `Wpg.`). Parents read the
 * full name. Display only: the stored row is not changed.
 */
const CITY_DISPLAY: Record<string, string> = {
  wpg: "Winnipeg",
};

export function displayCityName(city: string | null | undefined): string {
  const raw = String(city || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[.\s]+$/g, "");
  return CITY_DISPLAY[key] ?? raw;
}
