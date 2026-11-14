import { config } from "zod/v4/core";

/**
 * Configure before later static modules can construct a Zod object. The probe
 * otherwise reports a CSP violation even when its new Function throw is caught.
 */
config({ jitless: true });

/** A real call keeps this module despite sideEffects:false; normal boot writes once. */
export function installZodCsp(): void {
  if (config().jitless !== true) config({ jitless: true });
}
