/**
 * The header drawer unmounts role links when role chrome flips back to
 * pending. Playwright then sees the Upgrade anchor detach for the whole
 * click timeout. Once a ready role has been shown, keep it until the
 * drawer closes.
 */

export type DrawerLatch = { role: string; paid: boolean };

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
