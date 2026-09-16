/**
 * Runtime Node env without a bundler-visible `process` + `env` member read.
 *
 * Vite 8 / Rolldown / Nitro can replace that member (and static NAME lookups)
 * with a build-time snapshot. Vercel Sensitive secrets are often missing from
 * that snapshot (empty string), so a computed lookup on the snapshot still
 * looks unset after a READY deploy.
 *
 * Reach the live env through `Function` + `globalThis["process"]` so bundlers
 * cannot empty-string-replace the read.
 */

export type EnvMap = Record<string, string | undefined>;

const LIVE_ENV_SOURCE =
  'return (function () { var g = globalThis; var p = g && g["process"]; return p && p["env"] ? p["env"] : {}; })()';

export function runtimeProcessEnv(): EnvMap {
  try {
    const mapped = Function(LIVE_ENV_SOURCE)() as EnvMap;
    if (mapped && typeof mapped === "object") return mapped;
  } catch {
    // Function constructor blocked in this realm.
  }
  const g = globalThis as Record<string, unknown>;
  const proc = g["process"] as { env?: EnvMap } | undefined;
  return proc?.["env"] ?? {};
}

export function runtimeEnv(name: string, source?: EnvMap): string {
  const mapped = source ?? runtimeProcessEnv();
  const value = mapped[name];
  return typeof value === "string" ? value.trim() : "";
}
