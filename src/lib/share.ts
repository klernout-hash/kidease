import { shareText } from "@/lib/native";
import { SITEMAP_ORIGIN, sitemapListingPath } from "@/lib/sitemap";

/** Canonical public origin for share links. App Store IDs are not required for v1. */
export const SHARE_APP_URL = SITEMAP_ORIGIN;

export type SharePayload = {
  title: string;
  text: string;
  url: string;
};

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export function listingShareUrl(slug: string): string {
  const clean = slug.trim().replace(/^\/+|\/+$/g, "");
  const segment = clean.split("/").filter(Boolean).pop() ?? "";
  return `${SITEMAP_ORIGIN}${sitemapListingPath(encodeURIComponent(segment))}`;
}

export function appSharePayload(copy: { title: string; text: string }): SharePayload {
  return { title: copy.title, text: copy.text, url: SHARE_APP_URL };
}

export function listingSharePayload(input: { name: string; slug: string; text: string }): SharePayload {
  return {
    title: input.name,
    text: input.text,
    url: listingShareUrl(input.slug),
  };
}

export async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through to execCommand */
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export async function shareOrCopy(payload: SharePayload): Promise<ShareOutcome> {
  const attempt = await shareText(payload.title, payload.text, payload.url);
  if (attempt === "shared") return "shared";
  if (attempt === "cancelled") return "cancelled";
  const copied = await copyText(payload.url);
  return copied ? "copied" : "failed";
}
