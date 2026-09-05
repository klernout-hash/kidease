import type { CapacitorConfig } from "@capacitor/cli";

/** Production WebView origin. Override with CAP_SERVER_URL for on-device live reload only. */
export const CAP_PROD_SERVER_URL = "https://www.kidease.ca";
export const CAP_PROD_HOSTNAME = "www.kidease.ca";
export const CAP_APP_ID = "ca.daycarenearme.app";
export const CAP_APP_NAME = "KidEase";

/**
 * When-in-use only. Shown on the iOS / Android location prompt.
 * Parent daycare finder — never background / always-on location.
 */
export const LOCATION_WHEN_IN_USE_EN =
  "KidEase uses your location only while you search so we can show licensed daycares near you. Location is not used in the background.";
export const LOCATION_WHEN_IN_USE_FR =
  "KidEase utilise votre position uniquement pendant la recherche afin d’afficher les garderies autorisées près de vous. La position n’est pas utilisée en arrière-plan.";

function resolveRemoteUrl(): string {
  const override = process.env.CAP_SERVER_URL?.trim();
  return override || CAP_PROD_SERVER_URL;
}

function hostnameOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname || fallback;
  } catch {
    return fallback;
  }
}

const remote = resolveRemoteUrl();

const config: CapacitorConfig = {
  appId: CAP_APP_ID,
  appName: CAP_APP_NAME,
  webDir: "native-www",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    hostname: hostnameOf(remote, CAP_PROD_HOSTNAME),
    url: remote,
    cleartext: remote.startsWith("http://"),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1400,
      launchAutoHide: true,
      backgroundColor: "#FFFFFF",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#FFFFFF",
    },
    Keyboard: {
      resize: "body",
    },
    Geolocation: {
      // When-in-use / precise only. Do not add background location permissions.
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#FFFFFF",
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#FFFFFF",
    preferredContentMode: "mobile",
    scheme: "KidEase",
  },
};

export default config;
