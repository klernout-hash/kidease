import type { CapacitorConfig } from "@capacitor/cli";

const remote =
  process.env.CAP_SERVER_URL ||
  (process.env.VITE_PUBLIC_HOSTNAME ? `https://${process.env.VITE_PUBLIC_HOSTNAME}` : undefined);

const config: CapacitorConfig = {
  appId: "ca.daycarenearme.app",
  appName: "KidEase",
  webDir: "native-www",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    hostname: "kidease.app",
    ...(remote
      ? { url: remote, cleartext: remote.startsWith("http://") }
      : {}),
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
    PushNotifications: {
      // Native only. FEATURE_PUSH defaults off — this does not send or prompt on www.
      presentationOptions: ["badge", "sound", "alert"],
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
