import { createServerFn } from "@tanstack/react-start";
import { isNativeUserAgent } from "@/lib/native-entitlements";

/**
 * Server read of the Capacitor user agent.
 * The request helper stays inside this server function so the client bundle
 * does not import `@tanstack/react-start/server`.
 */
export const readNativeShell = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    return isNativeUserAgent(getRequest()?.headers.get("user-agent"));
  } catch {
    return false;
  }
});
