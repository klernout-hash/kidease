export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function toRad(n: number) {
  return (n * Math.PI) / 180;
}

export const WINNIPEG: LatLng & { label: string; city: string } = {
  lat: 49.8951,
  lng: -97.1384,
  label: "Winnipeg, MB",
  city: "Winnipeg",
};

export type CityHit = LatLng & { label: string; aliases: string[]; province: string };

export const PROVINCES: Array<{
  code: string;
  name: string;
  nameFr: string;
  lat: number;
  lng: number;
  label: string;
}> = [
  { code: "BC", name: "British Columbia", nameFr: "Colombie-Britannique", lat: 49.2827, lng: -123.1207, label: "Vancouver, BC" },
  { code: "AB", name: "Alberta", nameFr: "Alberta", lat: 51.0447, lng: -114.0719, label: "Calgary, AB" },
  { code: "SK", name: "Saskatchewan", nameFr: "Saskatchewan", lat: 52.1332, lng: -106.67, label: "Saskatoon, SK" },
  { code: "MB", name: "Manitoba", nameFr: "Manitoba", lat: 49.8951, lng: -97.1384, label: "Winnipeg, MB" },
  { code: "ON", name: "Ontario", nameFr: "Ontario", lat: 43.6532, lng: -79.3832, label: "Toronto, ON" },
  { code: "QC", name: "Quebec", nameFr: "Québec", lat: 45.5017, lng: -73.5673, label: "Montréal, QC" },
  { code: "NB", name: "New Brunswick", nameFr: "Nouveau-Brunswick", lat: 45.9636, lng: -66.6431, label: "Fredericton, NB" },
  { code: "NS", name: "Nova Scotia", nameFr: "Nouvelle-Écosse", lat: 44.6488, lng: -63.5752, label: "Halifax, NS" },
  { code: "PE", name: "Prince Edward Island", nameFr: "Île-du-Prince-Édouard", lat: 46.2382, lng: -63.1311, label: "Charlottetown, PE" },
  { code: "NL", name: "Newfoundland and Labrador", nameFr: "Terre-Neuve-et-Labrador", lat: 47.5615, lng: -52.7126, label: "St. John's, NL" },
  { code: "YT", name: "Yukon", nameFr: "Yukon", lat: 60.7212, lng: -135.0568, label: "Whitehorse, YT" },
  { code: "NT", name: "Northwest Territories", nameFr: "Territoires du Nord-Ouest", lat: 62.454, lng: -114.3718, label: "Yellowknife, NT" },
  { code: "NU", name: "Nunavut", nameFr: "Nunavut", lat: 63.7467, lng: -68.517, label: "Iqaluit, NU" },
];

export const CITIES: CityHit[] = [
  { lat: 49.8951, lng: -97.1384, label: "Winnipeg, MB", province: "MB", aliases: ["winnipeg", "wpg", "r3", "r2"] },
  { lat: 49.887, lng: -97.113, label: "St. Boniface, Winnipeg", province: "MB", aliases: ["st boniface", "saint-boniface", "st. boniface"] },
  { lat: 49.8114, lng: -97.162, label: "Fort Garry, Winnipeg", province: "MB", aliases: ["fort garry"] },
  { lat: 49.9021, lng: -97.0119, label: "Transcona, Winnipeg", province: "MB", aliases: ["transcona"] },
  { lat: 49.948, lng: -97.1348, label: "Seven Oaks, Winnipeg", province: "MB", aliases: ["seven oaks"] },
  { lat: 49.834, lng: -97.1064, label: "St. Vital, Winnipeg", province: "MB", aliases: ["st vital", "st. vital"] },
  { lat: 49.1817, lng: -97.9411, label: "Winkler, MB", province: "MB", aliases: ["winkler", "r6w"] },
  { lat: 49.5258, lng: -96.6845, label: "Steinbach, MB", province: "MB", aliases: ["steinbach", "r5g"] },
  { lat: 49.1919, lng: -98.1014, label: "Morden, MB", province: "MB", aliases: ["morden"] },
  { lat: 49.8485, lng: -99.9501, label: "Brandon, MB", province: "MB", aliases: ["brandon", "r7a"] },
  { lat: 50.411, lng: -96.684, label: "Selkirk, MB", province: "MB", aliases: ["selkirk"] },
  { lat: 49.9728, lng: -98.2926, label: "Portage la Prairie, MB", province: "MB", aliases: ["portage"] },
  { lat: 55.7435, lng: -97.8558, label: "Thompson, MB", province: "MB", aliases: ["thompson"] },
  { lat: 43.6532, lng: -79.3832, label: "Toronto, ON", province: "ON", aliases: ["toronto", "the annex", "m5s", "m6g", "m4", "m5", "m6"] },
  { lat: 43.589, lng: -79.6441, label: "Mississauga, ON", province: "ON", aliases: ["mississauga", "l5"] },
  { lat: 43.7315, lng: -79.7624, label: "Brampton, ON", province: "ON", aliases: ["brampton", "l6"] },
  { lat: 43.8561, lng: -79.337, label: "Markham, ON", province: "ON", aliases: ["markham"] },
  { lat: 43.6833, lng: -79.7667, label: "Vaughan, ON", province: "ON", aliases: ["vaughan"] },
  { lat: 43.2557, lng: -79.8711, label: "Hamilton, ON", province: "ON", aliases: ["hamilton", "l8"] },
  { lat: 43.4516, lng: -80.4925, label: "Kitchener, ON", province: "ON", aliases: ["kitchener", "waterloo", "n2"] },
  { lat: 42.9849, lng: -81.2453, label: "London, ON", province: "ON", aliases: ["london", "n6"] },
  { lat: 45.4215, lng: -75.6972, label: "Ottawa, ON", province: "ON", aliases: ["ottawa", "k1", "k2"] },
  { lat: 44.2312, lng: -76.486, label: "Kingston, ON", province: "ON", aliases: ["kingston"] },
  { lat: 43.589, lng: -79.644, label: "Oakville, ON", province: "ON", aliases: ["oakville"] },
  { lat: 43.0896, lng: -79.0849, label: "Niagara Falls, ON", province: "ON", aliases: ["niagara"] },
  { lat: 46.4917, lng: -80.993, label: "Sudbury, ON", province: "ON", aliases: ["sudbury"] },
  { lat: 48.3809, lng: -89.2477, label: "Thunder Bay, ON", province: "ON", aliases: ["thunder bay"] },
  { lat: 43.8971, lng: -78.8658, label: "Oshawa, ON", province: "ON", aliases: ["oshawa"] },
  { lat: 45.5017, lng: -73.5673, label: "Montréal, QC", province: "QC", aliases: ["montreal", "montréal", "h2", "h3", "h4"] },
  { lat: 46.8139, lng: -71.208, label: "Québec City, QC", province: "QC", aliases: ["quebec", "québec", "ville de quebec", "g1"] },
  { lat: 45.4, lng: -71.8991, label: "Sherbrooke, QC", province: "QC", aliases: ["sherbrooke"] },
  { lat: 46.343, lng: -72.5477, label: "Trois-Rivières, QC", province: "QC", aliases: ["trois-rivieres", "trois-rivières"] },
  { lat: 48.427, lng: -71.0689, label: "Saguenay, QC", province: "QC", aliases: ["saguenay", "chicoutimi"] },
  { lat: 45.4772, lng: -75.7016, label: "Gatineau, QC", province: "QC", aliases: ["gatineau"] },
  { lat: 46.8131, lng: -71.207, label: "Lévis, QC", province: "QC", aliases: ["levis", "lévis"] },
  { lat: 49.2827, lng: -123.1207, label: "Vancouver, BC", province: "BC", aliases: ["vancouver", "v6", "v5"] },
  { lat: 49.2488, lng: -122.9805, label: "Burnaby, BC", province: "BC", aliases: ["burnaby"] },
  { lat: 49.1913, lng: -122.849, label: "Surrey, BC", province: "BC", aliases: ["surrey", "v3"] },
  { lat: 49.1666, lng: -123.1336, label: "Richmond, BC", province: "BC", aliases: ["richmond"] },
  { lat: 48.4284, lng: -123.3656, label: "Victoria, BC", province: "BC", aliases: ["victoria", "v8"] },
  { lat: 49.888, lng: -119.496, label: "Kelowna, BC", province: "BC", aliases: ["kelowna"] },
  { lat: 50.9981, lng: -118.1957, label: "Revelstoke, BC", province: "BC", aliases: ["revelstoke"] },
  { lat: 53.9171, lng: -122.7497, label: "Prince George, BC", province: "BC", aliases: ["prince george"] },
  { lat: 49.1659, lng: -123.9401, label: "Nanaimo, BC", province: "BC", aliases: ["nanaimo"] },
  { lat: 51.0447, lng: -114.0719, label: "Calgary, AB", province: "AB", aliases: ["calgary", "t2", "t3"] },
  { lat: 53.5461, lng: -113.4938, label: "Edmonton, AB", province: "AB", aliases: ["edmonton", "t5", "t6"] },
  { lat: 50.0405, lng: -110.6766, label: "Medicine Hat, AB", province: "AB", aliases: ["medicine hat"] },
  { lat: 49.6935, lng: -112.8418, label: "Lethbridge, AB", province: "AB", aliases: ["lethbridge"] },
  { lat: 52.269, lng: -113.8116, label: "Red Deer, AB", province: "AB", aliases: ["red deer"] },
  { lat: 56.7267, lng: -111.379, label: "Fort McMurray, AB", province: "AB", aliases: ["fort mcmurray", "wood buffalo"] },
  { lat: 55.17, lng: -118.7947, label: "Grande Prairie, AB", province: "AB", aliases: ["grande prairie"] },
  { lat: 52.1332, lng: -106.67, label: "Saskatoon, SK", province: "SK", aliases: ["saskatoon", "s7"] },
  { lat: 50.4452, lng: -104.6189, label: "Regina, SK", province: "SK", aliases: ["regina", "s4"] },
  { lat: 53.2033, lng: -105.7531, label: "Prince Albert, SK", province: "SK", aliases: ["prince albert"] },
  { lat: 50.3933, lng: -105.5519, label: "Moose Jaw, SK", province: "SK", aliases: ["moose jaw"] },
  { lat: 44.6488, lng: -63.5752, label: "Halifax, NS", province: "NS", aliases: ["halifax", "dartmouth", "b3"] },
  { lat: 46.1368, lng: -60.1942, label: "Sydney, NS", province: "NS", aliases: ["sydney"] },
  { lat: 45.3669, lng: -63.2797, label: "Truro, NS", province: "NS", aliases: ["truro"] },
  { lat: 45.2733, lng: -66.0633, label: "Saint John, NB", province: "NB", aliases: ["saint john"] },
  { lat: 46.0878, lng: -64.7782, label: "Moncton, NB", province: "NB", aliases: ["moncton"] },
  { lat: 45.9636, lng: -66.6431, label: "Fredericton, NB", province: "NB", aliases: ["fredericton"] },
  { lat: 46.2382, lng: -63.1311, label: "Charlottetown, PE", province: "PE", aliases: ["charlottetown", "c1"] },
  { lat: 46.3934, lng: -63.7902, label: "Summerside, PE", province: "PE", aliases: ["summerside"] },
  { lat: 47.5615, lng: -52.7126, label: "St. John's, NL", province: "NL", aliases: ["st john's", "st. john's", "st johns", "a1"] },
  { lat: 48.95, lng: -57.95, label: "Corner Brook, NL", province: "NL", aliases: ["corner brook"] },
  { lat: 60.7212, lng: -135.0568, label: "Whitehorse, YT", province: "YT", aliases: ["whitehorse", "y1"] },
  { lat: 62.454, lng: -114.3718, label: "Yellowknife, NT", province: "NT", aliases: ["yellowknife", "x1a"] },
  { lat: 63.7467, lng: -68.517, label: "Iqaluit, NU", province: "NU", aliases: ["iqaluit", "x0a"] },
];

const FSA_CITY: Array<{ re: RegExp; label: string }> = [
  { re: /^[r][23]/i, label: "Winnipeg, MB" },
  { re: /^r6w/i, label: "Winkler, MB" },
  { re: /^r5g/i, label: "Steinbach, MB" },
  { re: /^r7/i, label: "Brandon, MB" },
  { re: /^[m]/i, label: "Toronto, ON" },
  { re: /^[k][12]/i, label: "Ottawa, ON" },
  { re: /^l[456]/i, label: "Mississauga, ON" },
  { re: /^[h]/i, label: "Montréal, QC" },
  { re: /^g1/i, label: "Québec City, QC" },
  { re: /^v[56]/i, label: "Vancouver, BC" },
  { re: /^v8/i, label: "Victoria, BC" },
  { re: /^t[23]/i, label: "Calgary, AB" },
  { re: /^t[56]/i, label: "Edmonton, AB" },
  { re: /^s7/i, label: "Saskatoon, SK" },
  { re: /^s4/i, label: "Regina, SK" },
  { re: /^b3/i, label: "Halifax, NS" },
  { re: /^c1/i, label: "Charlottetown, PE" },
  { re: /^e3/i, label: "Fredericton, NB" },
  { re: /^e1/i, label: "Moncton, NB" },
  { re: /^a1/i, label: "St. John's, NL" },
  { re: /^y1/i, label: "Whitehorse, YT" },
  { re: /^x1a/i, label: "Yellowknife, NT" },
  { re: /^x0a/i, label: "Iqaluit, NU" },
];

function named(part: string) {
  const q = part.toLowerCase();
  return CITIES.find((c) => c.label.toLowerCase() === q || c.label.toLowerCase().includes(q));
}

export function geocode(query: string): (LatLng & { label: string }) | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const postal = q.replace(/\s+/g, "");
  for (const f of FSA_CITY) {
    if (f.re.test(postal)) {
      const hit = named(f.label.toLowerCase());
      if (hit) return { lat: hit.lat, lng: hit.lng, label: hit.label };
    }
  }
  const prov = PROVINCES.find(
    (p) =>
      p.code.toLowerCase() === q ||
      p.name.toLowerCase() === q ||
      p.nameFr.toLowerCase() === q ||
      p.label.toLowerCase().includes(q),
  );
  if (prov && q.length <= 22) return { lat: prov.lat, lng: prov.lng, label: prov.label };
  const hit = CITIES.find(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.aliases.some((a) => q.includes(a) || a.includes(q)),
  );
  return hit ? { lat: hit.lat, lng: hit.lng, label: hit.label } : null;
}

export function reverseGeocode(lat: number, lng: number): string {
  let best = CITIES[0]!;
  let bestD = Infinity;
  const here = { lat, lng };
  for (const c of CITIES) {
    const d = haversineKm(here, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (bestD <= 35) return best.label;
  if (bestD <= 120) return `Near ${best.label}`;
  const prov = PROVINCES.find((p) => haversineKm(here, p) === Math.min(...PROVINCES.map((x) => haversineKm(here, x))));
  return prov?.label ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

export const ORIGIN_STORAGE_KEY = "kidease-origin";

export function readSavedOrigin(): (LatLng & { label: string }) | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ORIGIN_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { lat?: number; lng?: number; label?: string };
    if (typeof v.lat === "number" && typeof v.lng === "number" && v.label) {
      return { lat: v.lat, lng: v.lng, label: v.label };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeSavedOrigin(origin: LatLng & { label: string }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(origin));
  } catch {
    /* ignore */
  }
}
