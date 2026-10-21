import { createServerFn } from "@tanstack/react-start";
import { storeChannelFromSignals, type StoreChannel } from "@/lib/native-entitlements";

/**
 * Server read of the store channel.
 * The request helper stays inside this server function so the client bundle
 * does not import `@tanstack/react-start/server`.
 */
export const readServerStoreChannel = createServerFn({ method: "GET" })
  .validator((input: { search?: string } | undefined) => ({
    search: String(input?.search || "").slice(0, 2048),
  }))
  .handler(async ({ data }): Promise<StoreChannel> => {
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      let fromUrl = "";
      try {
        fromUrl = new URL(req?.url || "", "https://www.kidease.ca").search;
      } catch {
        fromUrl = "";
      }
      return storeChannelFromSignals({
        userAgent: req?.headers.get("user-agent"),
        search: fromUrl || data.search,
        cookie: req?.headers.get("cookie"),
      });
    } catch {
      return storeChannelFromSignals({ search: data.search });
    }
  });
