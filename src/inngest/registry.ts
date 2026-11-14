/**
 * Registration is an activation boundary, not a list of every job in the repo.
 * Keep this checked-in gate off until Kyle separately approves live tour work,
 * deployment and sync. Changing runtime feature flags or keys cannot enable it.
 */
export const TOUR_SCHEDULER_ACTIVATED = false;

export function selectRegisteredFunctions<Search, Tour>(
  search: Search,
  tour: Tour,
  options: { tourActivated?: boolean; inngestConfigured?: boolean } = {},
): Array<Search | Tour> {
  // Registration and the existing Vercel deferral must agree on key presence.
  // Neither keys alone nor this opt-in alone can register the tour function.
  const activated = options.tourActivated ?? TOUR_SCHEDULER_ACTIVATED;
  return activated && options.inngestConfigured ? [search, tour] : [search];
}
