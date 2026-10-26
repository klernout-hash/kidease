import { getRequest } from "@tanstack/react-start/server";
import { resolveAnonymousOriginFromHeaders, type ResolvedOrigin } from "@/lib/default-origin";

/** Server-only: Vercel/CF IP geo → a Canadian city, or the neutral Canada view. */
export function requestSearchOrigin(): ResolvedOrigin {
  return resolveAnonymousOriginFromHeaders(getRequest()?.headers ?? null);
}
