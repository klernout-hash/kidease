/**
 * Listing loaders throw redirect() and notFound() for control flow.
 * redirect() is a Response with `.options`. isRedirect() recognizes it.
 */

import { isNotFound, isRedirect, notFound } from "@tanstack/react-router";

function transientText(message: string): boolean {
  const lower = message.toLowerCase();
  if (!lower) return false;
  if (lower.includes("too many requests")) return true;
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) return true;
  if (lower.includes("timeout") || lower.includes("timed out")) return true;
  if (/\b429\b/.test(lower) || /\b5\d\d\b/.test(lower)) return true;
  return false;
}

/** 429, 5xx, and network failures are not a missing listing. */
export function isTransientListingError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    const status = error.status;
    if (status === 408 || status === 429 || status >= 500) return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return transientText(message);
}

/**
 * Re-throw a router redirect, not-found, or a transient failure.
 * A real catalogue miss becomes a 404. A 429 must not.
 */
export function rethrowRouterControl(error: unknown, slug: string): never {
  if (isRedirect(error) || isNotFound(error) || isTransientListingError(error)) throw error;
  console.error("[listing-loader]", slug, error);
  throw notFound();
}
