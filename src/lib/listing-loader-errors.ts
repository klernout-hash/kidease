/**
 * Listing loaders throw redirect() and notFound() for control flow.
 * redirect() is a Response with `.options`. isRedirect() recognizes it.
 */

import { isNotFound, isRedirect, notFound } from "@tanstack/react-router";

/** Re-throw a router redirect or not-found. Anything else becomes a 404. */
export function rethrowRouterControl(error: unknown, slug: string): never {
  if (isRedirect(error) || isNotFound(error)) throw error;
  console.error("[listing-loader]", slug, error);
  throw notFound();
}
