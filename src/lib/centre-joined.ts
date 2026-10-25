/**
 * A public catalogue row whose centre has not claimed a KidEase account.
 * Pending, waiting, and approved claims are already in the join process.
 */
export function centreHasNotJoined(input: {
  claimStatus?: string | null;
  claimed?: boolean | null;
  claimedAt?: string | Date | null;
  live?: boolean | null;
}): boolean {
  if (input.live || input.claimed || input.claimedAt) return false;
  const status = (input.claimStatus || "").trim().toLowerCase();
  return status === "" || status === "unclaimed";
}
