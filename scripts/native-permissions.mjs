/**
 * Shared when-in-use location purpose strings for Capacitor iOS / Android.
 * Parent daycare finder only — never background location.
 */
export const CAP_APP_ID = "ca.daycarenearme.app";
export const CAP_APP_NAME = "KidEase";
export const CAP_PROD_SERVER_URL = "https://www.kidease.ca";
export const CAP_PROD_HOSTNAME = "www.kidease.ca";

/** Universal / App Links hosts. Apex is listed so kidease.ca URLs open the app. */
export const CAP_ASSOCIATED_HOSTS = ["www.kidease.ca", "kidease.ca"];

/** Custom URL schemes. iOS CFBundle uses KidEase; Android strings default to the appId. */
export const CAP_CUSTOM_URL_SCHEMES = ["KidEase", CAP_APP_ID];

/**
 * Parent deep-link paths on kidease.ca. AASA still includes `/*` so the
 * Capacitor WebView can open the rest of the site.
 */
export const CAP_APP_LINK_PATHS = [
  { path: "/daycare/*", comment: "Centre listing" },
  { path: "/search", comment: "Search" },
  { path: "/get-app", comment: "Get the app" },
  { path: "/login", comment: "Sign in" },
  { path: "/help", comment: "Support" },
  { path: "/privacy", comment: "Privacy policy" },
  { path: "/terms", comment: "Terms of use" },
  { path: "/delete-account", comment: "Account deletion (PIPEDA / Apple)" },
  { path: "/fr/*", comment: "French locale" },
  { path: "/*", comment: "Remaining KidEase https URLs in the Capacitor app" },
];

export const LOCATION_WHEN_IN_USE_EN =
  "KidEase uses your location only while you search so we can show licensed daycares near you. Location is not used in the background.";

export const LOCATION_WHEN_IN_USE_FR =
  "KidEase utilise votre position uniquement pendant la recherche afin d’afficher les garderies autorisées près de vous. La position n’est pas utilisée en arrière-plan.";
