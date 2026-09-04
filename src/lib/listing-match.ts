/** Normalize centre name/address so "123 Main St." matches "123 Main Street". */
export function normalizePlace(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|unit|suite|ste|number|no)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameCentreLocation(a: { name: string; address: string; city: string }, b: { name: string; address: string; city: string }) {
  return (
    normalizePlace(a.name) === normalizePlace(b.name) &&
    normalizePlace(a.address) === normalizePlace(b.address) &&
    normalizePlace(a.city) === normalizePlace(b.city)
  );
}
