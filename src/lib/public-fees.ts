/**
 * Parent-facing daycare dollar amounts on compare and Saved.
 * Off unless paid plans are on. Search cards keep a confirmed fee or a
 * real $10-a-day flag. This does not invent a household income.
 */
export function parentListingFeesVisible(subscriptionsOn: boolean | null | undefined): boolean {
  return subscriptionsOn === true;
}
