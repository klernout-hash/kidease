import { createServerFn } from "@tanstack/react-start";
import {
  microsoftStoreCookieHeader,
  storeChannelFromSignals,
  type StoreChannel,
} from "@/lib/native-entitlements";

export type ServerStoreRead = {
  channel: StoreChannel;
  /** Set-Cookie value for `?store=microsoft`, or null when this request must not set it. */
  setCookie: string | null;
};

function requestIsHttps(url: string | undefined, forwardedProto: string | null): boolean {
  const forwarded = String(forwardedProto || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  try {
    return new URL(url || "https://www.kidease.ca").protocol === "https:";
  } catch {
    return true;
  }
}

/**
 * Server read of the store channel.
 * The request helper stays inside this server function so the client bundle
 * does not import `@tanstack/react-start/server`.
 */
export const readServerStoreChannel = createServerFn({ method: "GET" })
  .validator((input: { search?: string } | undefined) => ({
    search: String(input?.search || "").slice(0, 2048),
  }))
  .handler(async ({ data }): Promise<ServerStoreRead> => {
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      let fromUrl = "";
      try {
        fromUrl = new URL(req?.url || "", "https://www.kidease.ca").search;
      } catch {
        fromUrl = "";
      }
      const signals = {
        userAgent: req?.headers.get("user-agent"),
        search: fromUrl || data.search,
        cookie: req?.headers.get("cookie"),
      };
      return {
        channel: storeChannelFromSignals(signals),
        setCookie: microsoftStoreCookieHeader(signals, {
          secure: requestIsHttps(req?.url, req?.headers.get("x-forwarded-proto") ?? null),
        }),
      };
    } catch {
      return { channel: storeChannelFromSignals({ search: data.search }), setCookie: null };
    }
  });
