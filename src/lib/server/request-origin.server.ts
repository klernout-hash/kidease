import { getRequest } from "@tanstack/react-start/server";
import { resolveAnonymousOriginFromHeaders, type ResolvedOrigin } from "@/lib/default-origin";

/** Server-only: Vercel/CF IP geo → trusted city or Winnipeg. */
export function requestSearchOrigin(): ResolvedOrigin {
  return resolveAnonymousOriginFromHeaders(getRequest()?.headers ?? null);
}
