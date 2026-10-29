/**
 * Opens the device map app without naming a map vendor in the UI.
 * iOS uses Apple Maps. Android uses a geo: link. The website uses Apple Maps
 * on the web so a failed in-app map does not open Google's error page.
 */

export type MapsPlatform = "ios" | "android" | "web";

export function mapsPlatformFromSignals(input: {
  native?: boolean;
  channel?: string | null;
  userAgent?: string | null;
}): MapsPlatform {
  const ua = String(input.userAgent || "");
  const channel = String(input.channel || "");
  const ios =
    channel === "apple" || /iPhone|iPad|iPod/i.test(ua) || (input.native === true && /Macintosh/i.test(ua) && /Mobile/i.test(ua));
  if (ios) return "ios";
  const android = channel === "google" || channel === "samsung" || channel === "huawei" || /Android/i.test(ua);
  if (android) return "android";
  return "web";
}

export function openInMapsHref(input: {
  platform: MapsPlatform;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Native iOS opens the Maps app with maps://. The website uses maps.apple.com. */
  native?: boolean;
}): string {
  const label = String(input.address || "").replace(/\s+/g, " ").trim();
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
  const q = encodeURIComponent(label || (hasPoint ? `${lat},${lng}` : ""));
  if (input.platform === "ios") {
    const base = input.native ? "maps://?" : "https://maps.apple.com/?";
    if (hasPoint && label) return `${base}ll=${lat},${lng}&q=${q}`;
    if (hasPoint) return `${base}ll=${lat},${lng}`;
    return `${base}q=${q}`;
  }
  if (input.platform === "android") {
    if (hasPoint && label) return `geo:${lat},${lng}?q=${q}`;
    if (label) return `geo:0,0?q=${q}`;
    if (hasPoint) return `geo:${lat},${lng}`;
    return "geo:0,0";
  }
  if (hasPoint && label) return `https://maps.apple.com/?ll=${lat},${lng}&q=${q}`;
  if (hasPoint) return `https://maps.apple.com/?ll=${lat},${lng}`;
  return `https://maps.apple.com/?q=${q}`;
}
