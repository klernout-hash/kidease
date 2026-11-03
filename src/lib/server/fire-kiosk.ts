import { createServerFn } from "@tanstack/react-start";
import { fireKioskAllowed } from "@/lib/amazon/gate";

/** Kiosk only opens in the Amazon Appstore build on an Amazon device with FEATURE_FIRE_KIOSK on. */
export const getFireKioskAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  let userAgent = "";
  try {
    userAgent = getRequest()?.headers.get("user-agent") || "";
  } catch {
    userAgent = "";
  }
  return { allowed: fireKioskAllowed(process.env, { userAgent }) };
});
