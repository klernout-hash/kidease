export function normalizeListingField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function listingIdentityKey(input: { name: string; address: string; city: string }): string {
  return [
    normalizeListingField(input.name),
    normalizeListingField(input.address),
    normalizeListingField(input.city),
  ].join("|");
}

export const DUPLICATE_LISTING_MESSAGE =
  "This daycare is already listed at that address. Add a franchise location with a different address, or claim the existing listing.";
