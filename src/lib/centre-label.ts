const INTERNAL_CENTRE_ID = /^d_[a-z0-9]+$/i;

/**
 * A centre picker shows a name a person can read.
 * An empty name or an internal d_ id becomes the city, or the word Centre.
 */
export function centrePickerLabel(
  name: string | null | undefined,
  city?: string | null,
  id?: string | null,
): string {
  const trimmed = (name || "").trim();
  const ident = (id || "").trim();
  const internal = !trimmed || trimmed === ident || INTERNAL_CENTRE_ID.test(trimmed);
  if (!internal) return trimmed;
  const place = (city || "").trim();
  if (place && !INTERNAL_CENTRE_ID.test(place)) return place;
  return "Centre";
}
