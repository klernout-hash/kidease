export type NativePlatform = "ios" | "android" | "web";

type CapWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as CapWindow).Capacitor?.isNativePlatform?.());
}

export function nativePlatform(): NativePlatform {
  if (typeof window === "undefined") return "web";
  const p = (window as CapWindow).Capacitor?.getPlatform?.();
  if (p === "ios" || p === "android") return p;
  return "web";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosHome = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return standalone || iosHome || isNative();
}

export function isIosBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

/** True Apple silicon / Intel Mac — not an iPad spoofing Macintosh. */
export function isMac(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const mac = /Macintosh|Mac OS X/.test(ua);
  const iPad = /iPad/.test(ua) || (mac && (window.navigator.maxTouchPoints ?? 0) > 1);
  return mac && !iPad && !/iPhone|iPod/.test(ua);
}

/** Precise location while the app is in use. Never request background location. */
export async function getDeviceLocation(opts?: { precise?: boolean }): Promise<{ lat: number; lng: number } | null> {
  const enableHighAccuracy = opts?.precise !== false;
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy,
        timeout: 12000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy, timeout: 12000, maximumAge: enableHighAccuracy ? 8_000 : 60_000 },
    );
  });
}

export function watchDeviceLocation(onFix: (pos: { lat: number; lng: number }) => void): () => void {
  let stopped = false;
  if (isNative()) {
    let watchId: string | undefined;
    void import("@capacitor/geolocation").then(({ Geolocation }) => {
      if (stopped) return;
      void Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 12000 }, (pos) => {
        if (stopped || !pos) return;
        onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }).then((id) => {
        watchId = id;
      });
    });
    return () => {
      stopped = true;
      if (!watchId) return;
      void import("@capacitor/geolocation").then(({ Geolocation }) => {
        void Geolocation.clearWatch({ id: watchId! });
      });
    };
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (pos) => onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {},
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 8_000 },
  );
  return () => {
    stopped = true;
    navigator.geolocation.clearWatch(id);
  };
}

export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* web or denied */
  }
}

export async function shareText(title: string, text: string, url?: string): Promise<boolean> {
  try {
    if (isNative()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function hideNativeSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* web */
  }
}

export async function paintStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#FFFFFF" });
  } catch {
    /* ios/android variant */
  }
}

type BeforeInstall = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredInstall: BeforeInstall | null = null;
const installListeners = new Set<() => void>();

/** Register the chrome-only service worker (web PWA, not Capacitor). */
export function registerOfflineShell(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (isNative()) return;
  if (!window.isSecureContext) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* registration is best-effort */
    });
  });
}

export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as BeforeInstall;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installListeners.forEach((fn) => fn());
  });
}

export function hasInstallPrompt(): boolean {
  return Boolean(deferredInstall);
}

export function onInstallChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  installListeners.forEach((fn) => fn());
  return outcome === "accepted";
}
