import { useLayoutEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { isNative } from "@/lib/native";
import { isNativeUserAgent } from "@/lib/native-entitlements";

/** True inside the Capacitor shell. Server uses the KidEaseNative user agent. */
export function useInNativeShell(): boolean {
  const nativeShell = useRouteContext({
    from: "__root__",
    select: (ctx) => Boolean(ctx.nativeShell),
  });
  const [native, setNative] = useState(nativeShell);
  useLayoutEffect(() => {
    const ua = typeof navigator !== "undefined" && isNativeUserAgent(navigator.userAgent);
    const runtime = document.documentElement.dataset.runtime;
    if (ua || isNative() || runtime === "ios" || runtime === "android" || runtime === "native") {
      setNative(true);
    }
  }, []);
  return native;
}
