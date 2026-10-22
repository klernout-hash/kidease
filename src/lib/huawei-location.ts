/**
 * Location on the Huawei flavour.
 * The AppGallery binary does not ship Play Services location, Play in-app
 * review, or Firebase messaging. This module never imports those plugins.
 * HMS Location Kit is not compiled in (no agconnect-services.json). If a later
 * shell sets window.HMSLocation, use it. Otherwise the WebView geolocation API.
 */

export type HuaweiFix = { lat: number; lng: number; accuracyM?: number };

type HmsPosition = { latitude: number; longitude: number; accuracy?: number };

type HmsBridge = {
  getCurrentPosition?: () => Promise<HmsPosition>;
};

function hmsBridge(): HmsBridge | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & { HMSLocation?: HmsBridge };
  return host.HMSLocation ?? null;
}

function fromPosition(pos: HmsPosition): HuaweiFix | null {
  if (!Number.isFinite(pos.latitude) || !Number.isFinite(pos.longitude)) return null;
  const accuracy = pos.accuracy;
  return {
    lat: pos.latitude,
    lng: pos.longitude,
    accuracyM: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : undefined,
  };
}

export async function huaweiDeviceLocation(opts?: { precise?: boolean }): Promise<HuaweiFix | null> {
  const hms = hmsBridge();
  if (hms?.getCurrentPosition) {
    try {
      const fix = fromPosition(await hms.getCurrentPosition());
      if (fix) return fix;
    } catch {
      /* WebView geolocation is the fallback */
    }
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  const enableHighAccuracy = opts?.precise !== false;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve(
          fromPosition({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        ),
      () => resolve(null),
      { enableHighAccuracy, timeout: 12000, maximumAge: enableHighAccuracy ? 8_000 : 60_000 },
    );
  });
}
