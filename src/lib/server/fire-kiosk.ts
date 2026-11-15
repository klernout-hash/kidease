import { createServerFn } from "@tanstack/react-start";
import { amazonBuildOnAmazonDevice, fireKioskAllowed } from "@/lib/amazon/gate";

/**
 * A browser gets the web check-in screen. A Fire tablet still needs the
 * Amazon build and the Fire kiosk flags.
 */
export const getFireKioskAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  let userAgent = "";
  try {
    userAgent = getRequest()?.headers.get("user-agent") || "";
  } catch {
    userAgent = "";
  }
  const nativeFire = amazonBuildOnAmazonDevice({ userAgent });
  return {
    allowed: nativeFire ? fireKioskAllowed(process.env, { userAgent }) : true,
    nativeFire,
  };
});
