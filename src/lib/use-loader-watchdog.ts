import { useEffect, useRef } from "react";
import { captureLoaderFailure, LOADER_WATCHDOG_MS, type LoaderSurface } from "@/lib/loader-settle";

/**
 * While `pending` stays true, fire `onTimeout` once after `ms` and capture a
 * $exception for `surface`. A late success can still replace the error state.
 */
export function useLoaderWatchdog(
  pending: boolean,
  surface: LoaderSurface,
  onTimeout: () => void,
  ms = LOADER_WATCHDOG_MS,
): void {
  const latest = useRef(onTimeout);
  latest.current = onTimeout;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      captureLoaderFailure(surface, new Error(`${surface}-timeout`), "timeout");
      latest.current();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [pending, surface, ms]);
}
