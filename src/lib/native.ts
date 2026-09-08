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

export type ShareAttempt = "shared" | "cancelled" | "unavailable";

export function isShareCancellation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  const message = "message" in err ? String((err as { message?: unknown }).message) : "";
  if (name === "AbortError") return true;
  return /cancel|abort|dismiss/i.test(message);
}

/** True when an OS share sheet is likely to appear. Desktop Chrome often
 *  implements `navigator.share` with no picker (or an instant abort). */
export function preferOsShare(): boolean {
  if (isNative()) return true;
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  const ua = navigator.userAgent || "";
  const ipadOs = /Macintosh|Mac OS X/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod/i.test(ua) || ipadOs;
}

export type WebShareData = { title?: string; text?: string; url?: string };

/** True when the browser exposes a usable Web Share target for this payload. */
export function canUseWebShare(data?: WebShareData): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (data && typeof navigator.canShare === "function") {
    try {
      if (!navigator.canShare(data)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Desktop Chrome/Edge often expose `navigator.share` with no visible sheet.
 * Prefer Capacitor, `preferOsShare` (mobile UA / iPadOS), or coarse/touch Web Share.
 */
export function shouldOfferWebShare(data?: WebShareData): boolean {
  if (isNative()) return true;
  if (!canUseWebShare(data)) return false;
  if (preferOsShare()) return true;
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function shareText(title: string, text: string, url?: string): Promise<ShareAttempt> {
  try {
    if (isNative()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url });
      return "shared";
    }
    if (shouldOfferWebShare({ title, text, url })) {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (err) {
    if (isShareCancellation(err)) return "cancelled";
    return "unavailable";
  }
  return "unavailable";
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

function hashedStylesheetsApplied(): boolean {
  const sheets = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="/assets/"]');
  if (!sheets.length) return true;
  return [...sheets].every((link) => Boolean(link.sheet));
}

/** Register the chrome-only service worker (web PWA, not Capacitor). */
export function registerOfflineShell(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (isNative()) return;
  if (!window.isSecureContext) return;
  window.addEventListener("load", () => {
    // A 404 stylesheet means this document is stale. Do not re-register a
    // worker that can keep serving it — asset-recover.js will reload once.
    if (!hashedStylesheetsApplied()) return;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        void reg.update();
      })
      .catch(() => {
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
