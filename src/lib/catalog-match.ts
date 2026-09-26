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
 * Street number plus street name.
 * `240 Avenue Rd` and `240 Avenue Road` share a key. Extra spaces do not matter.
 * A unit prefix is skipped, so `10/11/12 20 Island Shore Blvd.` matches
 * `20 Island Shore Blvd.`. `230 Jane St` and `232 Jane St` do not match.
 * A bare civic number is not a street.
 */
export function catalogueStreetKey(value: string | null | undefined): string {
  let text = foldLetters(decodeImportText(value)).replace(/\./g, " ").replace(/#/g, " ").replace(/&/g, " and ");
  text = text.replace(/\b(?:saint|sainte|ste)\b/g, "st");
  text = text.replace(/^(?:mailing address|civic address|civic)\b/, " ");
  const tokens = text.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  let numIndex = tokens.findIndex((token, index) => /^\d+[a-z]?$/.test(token) && /^[a-z]/.test(tokens[index + 1] || ""));
  if (numIndex < 0) numIndex = tokens.findIndex((token, index) => /^\d+[a-z]?$/.test(token) && Boolean(tokens[index + 1]));
  if (numIndex < 0) return "";
  const number = tokens[numIndex].replace(/^0+/, "") || tokens[numIndex];
  const after = tokens.slice(numIndex + 1);
  let direction = "";
  const last = after[after.length - 1];
  if (last && DIRECTION[last]) direction = DIRECTION[after.pop() || ""] || "";
  let type = "";
  const typed = after[after.length - 1];
  if (typed && STREET_TYPE[typed]) type = STREET_TYPE[after.pop() || ""] || "";
  const name = `${after.join("")}${direction}`;
  if (!name) return "";
  // "Room 1 and gym" has a number, but it is a room, not a street.
  if (!type && ROOM_ADDRESS.test(addressFold(value))) return "";
  return type ? `${number}|${name}|${type}` : `${number}|${name}`;
}

/** `Civic #35117` is a civic number, not a street. */
export function catalogueCivicNumber(value: string | null | undefined): string {
  const text = foldLetters(decodeImportText(value)).replace(/[.#]/g, " ");
  const labeled = text.match(/\bcivic(?:\s+address)?\s+(\d+[a-z]?)\b/);
  if (!labeled) return "";
  return labeled[1].replace(/^0+/, "") || labeled[1];
}

export function catalogueStreetNumber(value: string | null | undefined): string {
  const key = catalogueStreetKey(value);
  return key ? key.split("|")[0] || "" : "";
}

const PLACEHOLDER_POSTAL = "R3K0Z8";
const ROOM_ADDRESS =
  /\b(?:rooms?|rm|gymnasium|gym|floors?|lower\s+level|kindergarten|nursery|preschool|infant\s+cent(?:re|er))\b/;
const VENUE_ADDRESS =
  /\b(?:school|elementary|elementry|church|community\s+cent(?:re|er)|rec(?:reation)?\s+cent(?:re|er))\b/;

function addressFold(value: string | null | undefined): string {
  return foldLetters(decodeImportText(value)).replace(/\s+/g, " ").trim();
}

/** Room, floor, gym, or program-space text. Not a located street. */
export function isRoomDescription(value: string | null | undefined): boolean {
  const text = addressFold(value);
  return Boolean(text) && ROOM_ADDRESS.test(text);
}

/** A school, church, community centre, or other named place. Not a street. */
export function isNamedVenue(value: string | null | undefined): boolean {
  const text = addressFold(value);
  if (!text || catalogueStreetKey(value)) return false;
  if (VENUE_ADDRESS.test(text)) return true;
  return /\bcent(?:re|er)\b/.test(text) && !ROOM_ADDRESS.test(text);
}

export function isPlaceholderPostal(value: string | null | undefined): boolean {
  return cataloguePostalKey(value) === PLACEHOLDER_POSTAL;
}

/** `Wpg` and `Wpg.` are Winnipeg written short. They are not a second city. */
export function isCityAbbreviation(value: string | null | undefined): boolean {
  return cataloguePlaceKey(value) === "wpg";
}

export function hasRealStreetAddress(value: string | null | undefined): boolean {
  return Boolean(catalogueStreetKey(value));
}

/**
 * Names match when the folded keys are equal, or when a long key contains the other.
 * `Kids & Company` does not contain-match a longer site name: the shorter key
 * has to be at least 15 characters, so a chain name stays distinct.
 */
export function similarCatalogueName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = catalogueNameKey(a);
  const right = catalogueNameKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= 15 && longer.includes(shorter);
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

function provinceCode(row: CatalogueIdentity): string {
  return (row.province || "").trim().toUpperCase();
}

function sameProvince(a: CatalogueIdentity, b: CatalogueIdentity): boolean {
  const left = provinceCode(a);
  const right = provinceCode(b);
  return Boolean(left && right && left === right);
}

function sameLicence(a: CatalogueIdentity, b: CatalogueIdentity): boolean {
  const left = catalogueLicenceKey(a.licenseNumber);
  const right = catalogueLicenceKey(b.licenseNumber);
  return Boolean(left && right && left === right);
}

function postalDiffers(a: CatalogueIdentity, b: CatalogueIdentity): boolean {
  const left = cataloguePostalKey(a.postalCode);
  const right = cataloguePostalKey(b.postalCode);
  return Boolean(left && right && left !== right);
}

/**
 * A same-licence row with no street can fold into the street row.
 * A room, a matching civic number, the placeholder postal R3K 0Z8, or a city
 * written as Wpg. A named venue with a different real postal code cannot.
 */
function absorbableNonStreet(other: CatalogueIdentity, streetRow: CatalogueIdentity): boolean {
  if (hasRealStreetAddress(other.address)) return false;
  if (!similarCatalogueName(other.name, streetRow.name)) return false;
  if (isNamedVenue(other.address) && postalDiffers(other, streetRow) && !isPlaceholderPostal(other.postalCode) && !isCityAbbreviation(other.city)) {
    return false;
  }
  if (!addressFold(other.address)) return true;
  if (isRoomDescription(other.address)) return true;
  const civic = catalogueCivicNumber(other.address);
  if (civic && civic === catalogueStreetNumber(streetRow.address)) return true;
  if (isPlaceholderPostal(other.postalCode) || isCityAbbreviation(other.city)) return true;
  if (isNamedVenue(other.address) && !postalDiffers(other, streetRow)) return true;
  return false;
}

/**
 * Keys that may merge two rows on their own.
 * Same province, similar name, and the same street number plus street name.
 * A licence number is not a key. A shared name is not a key.
 */
export function catalogueMatchKeys(row: CatalogueIdentity): string[] {
  const name = catalogueNameKey(row.name);
  const street = catalogueStreetKey(row.address);
  if (!name || !street) return [];
  return [`street|${provinceCode(row)}|${name}|${street}`];
}

/**
 * Lookup buckets. A licence bucket only proposes candidates.
 * `sameCatalogueCentre` still has to accept the pair, so two real streets
 * that share a licence do not match.
 */
export function catalogueCandidateKeys(row: CatalogueIdentity): string[] {
  const province = provinceCode(row);
  const keys = [];
  const street = catalogueStreetKey(row.address);
  if (street) keys.push(`street|${province}|${street}`);
  const licence = catalogueLicenceKey(row.licenseNumber);
  if (licence) keys.push(`pool|${province}|${licence}`);
  return keys;
}

export function matchingCatalogueRows<T extends CatalogueIdentity>(row: CatalogueIdentity, indexed: Map<string, T[]>): T[] {
  const seen = new Set<T>();
  const found: T[] = [];
  for (const key of catalogueCandidateKeys(row)) {
    for (const hit of indexed.get(key) || []) {
      if (seen.has(hit)) continue;
      seen.add(hit);
      if (sameCatalogueCentre(row, hit)) found.push(hit);
    }
  }
  return found;
}

/**
 * Same centre for import dedupe and for the merge script.
 * Same province, a similar name, and the same street number plus street name.
 * Or the same licence when one row has a real street and the other does not
 * (a room, a matching civic number, postal R3K 0Z8, or a city written as Wpg).
 * A shared licence with two real streets is not a match.
 */
export function sameCatalogueCentre(a: CatalogueIdentity, b: CatalogueIdentity): boolean {
  if (!sameProvince(a, b)) return false;
  const streetA = catalogueStreetKey(a.address);
  const streetB = catalogueStreetKey(b.address);
  if (streetA && streetB && streetA === streetB && (similarCatalogueName(a.name, b.name) || sameLicence(a, b))) return true;
  if (!sameLicence(a, b)) return false;
  if (!streetA && !streetB && similarCatalogueName(a.name, b.name)) return true;
  if (Boolean(streetA) === Boolean(streetB)) return false;
  const streetRow = streetA ? a : b;
  const other = streetA ? b : a;
  return absorbableNonStreet(other, streetRow);
}

/**
 * Held for a person. Same licence or same name, but two different real streets,
 * or a named venue whose postal code is not the street row's postal code.
 */
export function catalogueHoldReason(a: CatalogueIdentity, b: CatalogueIdentity): string | null {
  if (!sameProvince(a, b) || sameCatalogueCentre(a, b)) return null;
  const sameLic = sameLicence(a, b);
  const sameName = similarCatalogueName(a.name, b.name);
  if (!sameLic && !sameName) return null;
  const streetA = catalogueStreetKey(a.address);
  const streetB = catalogueStreetKey(b.address);
  if (streetA && streetB && streetA !== streetB) return "different street addresses";
  const venue = isNamedVenue(a.address) ? a : isNamedVenue(b.address) ? b : null;
  const street = streetA ? a : streetB ? b : null;
  if (venue && street && venue !== street && postalDiffers(venue, street) && !isPlaceholderPostal(venue.postalCode) && !isCityAbbreviation(venue.city)) {
    return "named venue with a different postal code";
  }
  return null;
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
