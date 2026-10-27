import type { StoreChannel } from "./native-entitlements.ts";

/**
 * Store apps should not show a "coming soon" store badge. The person is
 * already in the app. The public website still says the store listings are
 * not live yet.
 */
export function showStoreComingSoon(channel: StoreChannel): boolean {
  return channel === "web";
}

/**
 * Dormant surfaces reviewed for the v1 store apps.
 * Hidden in the app means the control is not rendered, or it already carries
 * data-ke="store-coming-soon" which the store runtime hides.
 * Disclosed means the page says the feature is not available and offers a way on.
 */
export const STORE_PLACEHOLDER_REVIEW = [
  { surface: "Footer no longer names the App Store or Google Play", inApp: "hidden", file: "src/components/site-footer.tsx" },
  { surface: "Menu Get the app row", inApp: "hidden", file: "src/components/app-menu-screen.tsx" },
  { surface: "Get the app store badges", inApp: "hidden", file: "src/routes/get-app.tsx" },
  { surface: "Claim page phone-apps perk", inApp: "hidden", file: "src/routes/claim.tsx" },
  { surface: "Saved-search line that says the phone apps are coming soon", inApp: "hidden", file: "src/components/saved-searches-panel.tsx" },
  { surface: "Alert settings line that says the phone apps are coming soon", inApp: "hidden", file: "src/components/alert-push-settings.tsx" },
  { surface: "Video tour when video is off", inApp: "disclosed", file: "src/routes/video.$roomId.tsx" },
  { surface: "Voice call when calling is not set up", inApp: "disclosed", file: "src/routes/call.$conversationId.tsx" },
  { surface: "Shared shortlist note that texts and chat are not live", inApp: "disclosed", file: "src/components/parent-shortlist.tsx" },
  { surface: "Admin chat lab", inApp: "hidden", file: "src/lib/desk-nav.ts" },
] as const;
