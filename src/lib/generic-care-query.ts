/**
 * Care words parents type into Where — not place names.
 * Geocoding these (Photon) returned false places such as Lower South River, NS for "daycare".
 */

/** Accent-folded, punctuation collapsed to spaces. */
export function foldCareQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whole-query care / category words (EN + FR). Exact match after fold —
 * "123 Daycare Lane" and "Winnipeg daycare" stay place-like and are not blocked.
 */
const GENERIC_CARE_QUERIES = new Set([
  "daycare",
  "daycares",
  "day care",
  "day cares",
  "day-care",
  "childcare",
  "childcares",
  "child care",
  "child cares",
  "child-care",
  "garderie",
  "garderies",
  "cpe",
  "c p e",
  "preschool",
  "preschools",
  "pre school",
  "pre schools",
  "pre-school",
  "nursery",
  "nurseries",
  "centre",
  "centres",
  "center",
  "centers",
  "home daycare",
  "home daycares",
  "home day care",
  "home childcare",
  "home child care",
  "family daycare",
  "family day care",
  "family childcare",
  "family child care",
  "family home",
  "dayhome",
  "dayhomes",
  "day home",
  "day homes",
  "child care centre",
  "child care centres",
  "childcare centre",
  "childcare centres",
  "daycare centre",
  "daycare centres",
  "daycare center",
  "daycare centers",
  "child care center",
  "childcare center",
  "centre de la petite enfance",
  "centres de la petite enfance",
  "milieu familial",
  "garderie en milieu familial",
  "halte garderie",
  "school age",
  "school age care",
  "before school",
  "after school",
  "before and after school",
  "before after school",
  "open spots",
  "open spot",
  "openings",
  "licensed daycare",
  "licensed day care",
  "licensed childcare",
  "licensed child care",
  "licensed garderie",
]);

/** Photon once mapped "daycare" here — never trust it as a saved origin. */
const TAINTED_ORIGIN_NEEDLES = ["lower south river"] as const;

export function isGenericCareQuery(query: string | null | undefined): boolean {
  const raw = typeof query === "string" ? query.trim() : "";
  if (!raw) return false;
  const folded = foldCareQuery(raw);
  if (!folded) return false;
  if (GENERIC_CARE_QUERIES.has(folded)) return true;
  // Hyphen variants fold to spaces already; keep a compact form for day-care → day care.
  const compact = folded.replace(/\s+/g, "");
  return (
    compact === "daycare" ||
    compact === "daycares" ||
    compact === "childcare" ||
    compact === "childcares" ||
    compact === "garderie" ||
    compact === "garderies" ||
    compact === "cpe" ||
    compact === "preschool" ||
    compact === "preschools" ||
    compact === "nursery" ||
    compact === "nurseries" ||
    compact === "dayhome" ||
    compact === "dayhomes" ||
    compact === "homedaycare" ||
    compact === "familydaycare"
  );
}

/** Discard a saved pin that came from geocoding a generic care word. */
export function isTaintedCareOriginLabel(label: string | null | undefined): boolean {
  const folded = foldCareQuery(label || "");
  if (!folded) return false;
  return TAINTED_ORIGIN_NEEDLES.some((needle) => folded.includes(needle));
}
