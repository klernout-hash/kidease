/** Clearly fake centre used only to walk Claim a listing. Not a real daycare. */
export const GHOST_LISTING = {
  id: "ke-test-ghost-001",
  slug: "test-ghost-claim-lab",
  name: "TEST Ghost Claim Lab",
  address: "100 KidEase Test Lane",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3C 0A1",
  lat: 49.8992,
  lng: -97.1391,
  phone: "204-555-0100",
  licenseNumber: "TEST-GHOST-0001",
  amenities: "licensed",
  spotsInfant: 2,
  spotsToddler: 4,
  spotsPreschool: 6,
  tagline: "QA ghost listing — not a real centre.",
  description:
    "KidEase internal test listing so the owner can walk Claim → licence → waiting → admin approve. Not a licensed daycare.",
  visibility: "admin_only",
  isTest: true,
} as const;
