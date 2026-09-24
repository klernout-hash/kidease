import { config } from "zod";

/**
 * Zod otherwise probes `new Function("")` on the first object parse.
 * The probe is inside try/catch, but Chrome still reports a script-src
 * violation when 'unsafe-eval' is absent. jitless skips the probe.
 * Called from the module body so it runs before later client imports.
 */
config({ jitless: true });

/** Referenced from client.tsx so the bundler keeps this side effect. */
export const zodCspInstalled = true;
