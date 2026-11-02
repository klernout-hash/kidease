/**
 * Amazon Appstore listing for the Get the app page.
 *
 * `AMAZON_APPSTORE_URL` is `NEXT_PUBLIC_AMAZON_APPSTORE_URL`.
 * It stays empty until that value is an https amazon.ca or amazon.com
 * listing. The button is hidden when this returns null. Do not invent a URL.
 *
 * On 2 Nov 2026 an amazon.ca Apps search for "KidEase" showed one free app
 * (the KidEase pin, dated that day). A click reached
 * https://www.amazon.ca/dp/B0HPYHR4TS and Amazon then blocked the product
 * page, so the developer name and package were not confirmed. That URL is
 * not the default.
 */

import { STORE } from "./store-listing.ts";

export const AMAZON_APPSTORE_ENV = "NEXT_PUBLIC_AMAZON_APPSTORE_URL";

const AMAZON_HOSTS = new Set(["amazon.ca", "www.amazon.ca", "amazon.com", "www.amazon.com"]);
const ASIN = /^[A-Z0-9]{10}$/;
const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

function readPublicEnv(name: string): string {
  const meta = typeof import.meta !== "undefined" ? (import.meta as { env?: Record<string, unknown> }).env : undefined;
  const fromMeta = meta?.[name];
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  if (typeof process !== "undefined") {
    const fromProc = process.env?.[name];
    if (typeof fromProc === "string" && fromProc.trim()) return fromProc.trim();
  }
  return "";
}

/** https listing on amazon.ca or amazon.com, or null. */
export function AMAZON_APPSTORE_URL(raw = readPublicEnv(AMAZON_APPSTORE_ENV)): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!AMAZON_HOSTS.has(url.hostname)) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const dp = path.match(/^\/(?:[^/]+\/)?dp\/([A-Z0-9]{10})$/);
  const gp = path.match(/^\/gp\/product\/([A-Z0-9]{10})$/);
  if (dp || gp) {
    const asin = (dp ?? gp)?.[1] ?? "";
    if (!ASIN.test(asin)) return null;
    return url.toString();
  }
  if (path === "/gp/mas/dl/android") {
    const pkg = url.searchParams.get("p") ?? "";
    const asin = url.searchParams.get("asin") ?? "";
    if (pkg && !PACKAGE.test(pkg)) return null;
    if (asin && !ASIN.test(asin)) return null;
    if (!pkg && !asin) return null;
    return url.toString();
  }
  return null;
}

/** Fire and Android open the Amazon Appstore app. Desktop and iPhone use the web URL. */
export function prefersAmazonDeepLink(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Silk|Kindle|KF[A-Z]{2}|AmazonWebView/i.test(ua)) return true;
  return /Android/i.test(ua);
}

/** Package deep link. The web listing URL is the fallback. */
export function amazonAppstoreDeepLink(pkg = STORE.playPackageName): string {
  return `amzn://apps/android?p=${encodeURIComponent(pkg)}`;
}

/**
 * On Fire and Android, try the Appstore app, then the web listing if the
 * page is still visible. Other devices follow the web link.
 */
export function openAmazonListing(webUrl: string, userAgent: string | null | undefined): boolean {
  if (typeof window === "undefined" || !prefersAmazonDeepLink(userAgent)) return false;
  const deep = amazonAppstoreDeepLink();
  const started = Date.now();
  const timer = window.setTimeout(() => {
    if (document.visibilityState === "visible" && Date.now() - started >= 700) {
      window.location.assign(webUrl);
    }
  }, 900);
  const onHide = () => {
    window.clearTimeout(timer);
  };
  document.addEventListener("visibilitychange", onHide, { once: true });
  window.location.assign(deep);
  return true;
}
