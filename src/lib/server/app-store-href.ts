import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { storeForDevice } from "@/lib/app-stores";

/** Store link for this visit. Stays on the server so the route file can load in the browser. */
export const appStoreHrefForRequest = createServerFn({ method: "GET" }).handler((): string | null => {
  try {
    const headers = getRequest()?.headers;
    return storeForDevice(headers?.get("user-agent"), undefined, headers?.get("cookie") ?? null)?.url ?? null;
  } catch {
    return null;
  }
});
