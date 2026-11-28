/**
 * The header drawer unmounts role links when role chrome flips back to
 * pending. Playwright then sees the Upgrade anchor detach for the whole
 * click timeout. Once a ready role has been shown, keep it until the
 * drawer closes.
 */

export type DrawerLatch = { role: string; paid: boolean };

/**
 * N-30: rows ignore taps for this long after the menu opens. A fast second
 * tap (or a ghost click from the opening tap) landed on whatever row slid
 * under the finger and opened the wrong page.
 */
export const DRAWER_TAP_GUARD_MS = 300;

export function nextDrawerLatch(
  open: boolean,
  menusReady: boolean,
  role: string,
  paid: boolean,
  prev: DrawerLatch | null,
): DrawerLatch | null {
  if (!open) return null;
  if (menusReady) return { role, paid };
  return prev;
}
