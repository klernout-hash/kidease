/**
 * Catalogue identity keys for import and master sync.
 * Licence keys drop a province prefix, separators, and leading zeros.
 * Names and addresses are HTML-decoded before they are compared.
 * A city/postal label is not a centre name.
 */

const PROVINCE_PREFIX =
  /^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PEI|PE|QC|SK|YT)[-\s]*/;

const POSTAL_BODY = String.raw`[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d`;

const CITY_POSTAL_NAME = new RegExp(
  String.raw`^(.+?),?\s+(PEI|PE|NL|NS|NB|QC|ON|MB|SK|AB|BC|YT|NT|NU)\s+(${POSTAL_BODY})$`,
  "i",
);

const STREET_WORDS: Array<[RegExp, string]> = [
  [/\b(?:street|str)\b/g, "st"],
  [/\b(?:avenue|ave)\b/g, "ave"],
  [/\b(?:road|rd)\b/g, "rd"],
  [/\b(?:boulevard|blvd)\b/g, "blvd"],
  [/\b(?:drive|dr)\b/g, "dr"],
  [/\b(?:crescent|cres)\b/g, "cres"],
  [/\b(?:court|crt)\b/g, "ct"],
  [/\b(?:place|pl)\b/g, "pl"],
  [/\b(?:lane|ln)\b/g, "ln"],
  [/\b(?:terrace|terr)\b/g, "ter"],
  [/\b(?:highway|hwy)\b/g, "hwy"],
];

/** Decode import text. `&amp;` is last so one pass undoes a single encode, and a second pass undoes a double encode. */
export function decodeImportText(value: string | null | undefined): string {
  let text = String(value ?? "");
  if (!text.includes("&")) return text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i += 1) {
    const next = text
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&#0*39;|&#x0*27;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
      .replace(/&lt;|&#0*60;/gi, "<")
      .replace(/&gt;|&#0*62;/gi, ">")
      .replace(/&amp;|&#0*38;|&#x0*26;/gi, "&");
    if (next === text) break;
    text = next;
  }
  return text.replace(/\s+/g, " ").trim();
}

export function cataloguePostalKey(value: string | null | undefined): string {
  return decodeImportText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatCataloguePostal(compact: string): string {
  if (compact.length === 6) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  return compact;
}

/**
 * Comparable licence token.
 * `MB-1276`, `mb 1276`, and `01276` all become `1276`.
 */
export function catalogueLicenceKey(value: string | null | undefined): string {
  let raw = decodeImportText(value).toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  raw = raw.replace(PROVINCE_PREFIX, "");
  raw = raw.replace(/[^A-Z0-9]/g, "");
  raw = raw.replace(/^0+/, "") || raw;
  return raw;
}

function foldLetters(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** City / place token. Saint and Ste. fold to st. */
export function cataloguePlaceKey(value: string | null | undefined): string {
  return foldLetters(decodeImportText(value))
    .replace(/\b(?:saint|sainte|ste|st)\b/g, "st")
    .replace(/[^a-z0-9]+/g, "");
}

/** Centre name token. HTML entities, `&`, and legal suffixes do not keep two rows apart. */
export function catalogueNameKey(value: string | null | undefined): string {
  let text = foldLetters(decodeImportText(value));
  text = text.replace(/\b(?:saint|sainte|ste|st)\b/g, "st");
  text = text.replace(/&/g, " and ");
  text = text.replace(/\b(?:inc|ltd|limited|corp|corporation|incorporated|the)\b/g, " ");
  text = text.replace(/\bday\s*care\b/g, "daycare");
  text = text.replace(/\bchild\s*care\b/g, "childcare");
  return text.replace(/[^a-z0-9]+/g, "");
}

/** Street token. `Rd` and `Road`, `St.` and `St`, match. */
export function catalogueAddressKey(value: string | null | undefined): string {
  let text = foldLetters(decodeImportText(value)).replace(/\./g, " ").replace(/&/g, " and ");
  text = text.replace(/\b(?:saint|sainte|ste)\b/g, "st");
  for (const [pattern, token] of STREET_WORDS) text = text.replace(pattern, token);
  return text.replace(/[^a-z0-9]+/g, "");
}

const STREET_TYPE: Record<string, string> = {
  street: "st",
  str: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  road: "rd",
  rd: "rd",
  boulevard: "blvd",
  blvd: "blvd",
  drive: "dr",
  dr: "dr",
  crescent: "cres",
  cres: "cres",
  court: "crt",
  crt: "crt",
  place: "pl",
  pl: "pl",
  lane: "ln",
  ln: "ln",
  terrace: "ter",
  terr: "ter",
  highway: "hwy",
  hwy: "hwy",
  pth: "hwy",
  rue: "rue",
};

const DIRECTION: Record<string, string> = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
  ne: "ne",
  nw: "nw",
  se: "se",
  sw: "sw",
  n: "n",
  s: "s",
  e: "e",
  w: "w",
};

/**
 * Street number plus street name. `240 Avenue Rd` and `240 Avenue Road` share
 * a key. `230 Jane St` and `232 Jane St` do not. A bare civic number stays on
 * its own key so it cannot swallow a different highway address.
 */
export function catalogueStreetKey(value: string | null | undefined): string {
  let text = foldLetters(decodeImportText(value)).replace(/\./g, " ").replace(/#/g, " ").replace(/&/g, " and ");
  text = text.replace(/\b(?:saint|sainte|ste)\b/g, "st");
  text = text.replace(/^(?:mailing address|civic address|civic)\b/, " ");
  const tokens = text.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  let numIndex = tokens.findIndex((token, index) => /^\d+[a-z]?$/.test(token) && /^[a-z]/.test(tokens[index + 1] || ""));
  if (numIndex < 0) numIndex = tokens.findIndex((token, index) => /^\d+[a-z]?$/.test(token) && Boolean(tokens[index + 1]));
  if (numIndex < 0) {
    if (tokens.length === 1 && /^\d+[a-z]?$/.test(tokens[0])) {
      const only = tokens[0].replace(/^0+/, "") || tokens[0];
      return `civic|${only}`;
    }
    return "";
  }
  const number = tokens[numIndex].replace(/^0+/, "") || tokens[numIndex];
  const after = tokens.slice(numIndex + 1);
  let direction = "";
  const last = after[after.length - 1];
  if (last && DIRECTION[last]) direction = DIRECTION[after.pop() || ""] || "";
  let type = "";
  const typed = after[after.length - 1];
  if (typed && STREET_TYPE[typed]) type = STREET_TYPE[after.pop() || ""] || "";
  const name = `${after.join("")}${direction}`;
  if (!name) return `civic|${number}`;
  return type ? `${number}|${name}|${type}` : `${number}|${name}`;
}

/** First three characters of a postal code. That is the postal area, not the full code. */
export function cataloguePostalArea(value: string | null | undefined): string {
  const postal = cataloguePostalKey(value);
  return postal.length >= 3 ? postal.slice(0, 3) : "";
}

export type CatalogueIdentity = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  licenseNumber?: string | null;
};

/**
 * Keys that may merge two rows.
 * A licence key is the normalized number in one province.
 * A street key is the normalized name, street number, and street name,
 * plus the city or the postal area. Name alone is not a key.
 */
export function catalogueMatchKeys(row: CatalogueIdentity): string[] {
  const province = (row.province || "").trim().toUpperCase();
  const licence = catalogueLicenceKey(row.licenseNumber);
  const name = catalogueNameKey(row.name);
  const street = catalogueStreetKey(row.address);
  const city = cataloguePlaceKey(row.city);
  const area = cataloguePostalArea(row.postalCode);
  const keys: string[] = [];
  if (licence) keys.push(`lic|${province}|${licence}`);
  if (name && street && city) keys.push(`street|${province}|${name}|${street}|${city}`);
  if (name && street && area) keys.push(`area|${province}|${name}|${street}|${area}`);
  return keys;
}

/**
 * Same centre for import dedupe and for the merge script.
 * Same normalized licence in the same province, or the same normalized name
 * with the same street number and street name and the same city or postal area.
 * A shared name is not enough. 230 Jane St and 232 Jane St stay apart.
 */
export function sameCatalogueCentre(a: CatalogueIdentity, b: CatalogueIdentity): boolean {
  const keys = new Set(catalogueMatchKeys(a));
  if (keys.size === 0) return false;
  return catalogueMatchKeys(b).some((key) => keys.has(key));
}

export type CityPostalLabel = {
  city: string;
  province: string;
  postal: string;
};

/**
 * True when the whole name is a city plus province plus postal code,
 * for example `Stratford, PE C1B 2W8`. That is not a centre name.
 */
export function splitCityPostalLabel(value: string | null | undefined): CityPostalLabel | null {
  const text = decodeImportText(value).replace(/\s+/g, " ").trim();
  const match = text.match(CITY_POSTAL_NAME);
  if (!match) return null;
  const city = match[1].replace(/,/g, "").trim();
  if (city.length < 2) return null;
  const province = match[2].toUpperCase() === "PEI" ? "PE" : match[2].toUpperCase();
  const postal = formatCataloguePostal(cataloguePostalKey(match[3]));
  if (!postal) return null;
  return { city, province, postal };
}

export function nameIsCityPostalLabel(value: string | null | undefined): boolean {
  return splitCityPostalLabel(value) !== null;
}
