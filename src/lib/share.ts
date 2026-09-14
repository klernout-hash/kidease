/** Relative .ts imports so scripts/share.test.mjs can load this file in Node. */
import { shareText, shouldOfferWebShare } from "./native.ts";
import { SITEMAP_ORIGIN, sitemapListingPath } from "./sitemap.ts";

/** Canonical public origin for share links. App Store IDs are not required for v1. */
export const SHARE_APP_URL = SITEMAP_ORIGIN;

export type SharePayload = {
  title: string;
  text: string;
  url: string;
};

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export type ShareFeedbackKey = "shareStarted" | "linkCopied" | "shareCopiedFallback" | "shareFailed";

/** Toast / inline copy for a share attempt. Cancel stays silent. */
export function shareFeedbackKey(outcome: ShareOutcome): ShareFeedbackKey | null {
  if (outcome === "shared") return "shareStarted";
  if (outcome === "copied") return "linkCopied";
  if (outcome === "failed") return "shareFailed";
  return null;
}

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

export function listingMailtoHref(input: { name: string; slug: string; note: string }) {
  const url = listingShareUrl(input.slug);
  const subject = encodeURIComponent(input.name);
  const body = encodeURIComponent(`${input.name}\n${url}\n\n${input.note}`);
  return `mailto:?subject=${subject}&body=${body}`;
}

export async function copyText(value: string): Promise<boolean> {
  if (typeof document !== "undefined") {
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
      if (ok) return true;
    } catch {
      /* fall through to clipboard API */
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function shareOrCopy(payload: SharePayload): Promise<ShareOutcome> {
  const attempt = await shareText(payload.title, payload.text, payload.url);
  if (attempt === "shared") return "shared";
  // Only treat cancel as final when an OS sheet actually appeared. Desktop
  // browsers often abort `navigator.share` instantly with no UI — copy instead.
  if (attempt === "cancelled" && shouldOfferWebShare(payload)) return "cancelled";
  const copied = await copyText(payload.url);
  return copied ? "copied" : "failed";
}
