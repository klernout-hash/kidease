/**
 * Badging API for the Microsoft PWA. A false flag, or no count, returns
 * before the browser badge methods are called.
 */

import { microsoftBadgeAction } from "@/lib/microsoft/platform";

type BadgeNavigator = {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function applyMicrosoftBadge(flagOn: boolean, count: number | null, nav: BadgeNavigator): Promise<boolean> {
  const action = microsoftBadgeAction(flagOn, count);
  if (action === "skip") return false;
  try {
    if (action === "clear") {
      if (!nav.clearAppBadge) return false;
      await nav.clearAppBadge();
      return true;
    }
    if (!nav.setAppBadge) return false;
    await nav.setAppBadge(count ?? 0);
    return true;
  } catch {
    return false;
  }
}
