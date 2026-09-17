/**
 * Runtime Node env without a bundler-visible `process` + `env` member read.
 *
 * Vite 8 / Rolldown / Nitro can replace that member (and static NAME lookups)
 * with a build-time snapshot. Vercel Sensitive secrets are often missing from
 * that snapshot (empty string), so a computed lookup on the snapshot still
 * looks unset after a READY deploy.
 *
 * Encrypted Production secrets are on the live Node env. A client `process`
 * shim inlined into the Nitro server graph can overwrite `globalThis.process`
 * with `{ env: { NODE_ENV, VITE_* } }` — Function() + globalThis then look
 * empty even though `node:process` still has DOCUSIGN_*.
 *
 * Prefer `node:process` via createRequire, then Function + globalThis, so
 * bundlers cannot empty-string-replace the read.
 */

import { createRequire } from "node:module";

export type EnvMap = Record<string, string | undefined>;

const LIVE_ENV_SOURCE =
  'return (function () { var g = globalThis; var p = g && g["process"]; return p && p["env"] ? p["env"] : {}; })()';

function asEnvMap(value: unknown): EnvMap | null {
  if (value && typeof value === "object") return value as EnvMap;
  return null;
}

function fromNodeProcess(): EnvMap | null {
  try {
    const req = createRequire(import.meta.url);
    const proc = req("node:process") as { env?: EnvMap } | undefined;
    return asEnvMap(proc?.env);
  } catch {
    return null;
  }
}

function fromFunctionGlobal(): EnvMap | null {
  try {
    return asEnvMap(Function(LIVE_ENV_SOURCE)());
  } catch {
    // Function constructor blocked in this realm.
    return null;
  }
}

function fromGlobalThis(): EnvMap | null {
  const g = globalThis as Record<string, unknown>;
  const proc = g["process"] as { env?: EnvMap } | undefined;
  return asEnvMap(proc?.["env"]);
}

function fromImportMeta(): EnvMap | null {
  try {
    return asEnvMap((import.meta as { env?: unknown }).env);
  } catch {
    return null;
  }
}

function envText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** First non-empty string for each name. `node:process` wins over a Vite shim. */
export function mergeRuntimeEnvMaps(...maps: Array<EnvMap | null | undefined>): EnvMap {
  const out: EnvMap = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      const text = envText(value);
      if (text === undefined) continue;
      const current = out[key];
      if (typeof current === "string" && current.trim()) continue;
      out[key] = text;
    }
  }
  return out;
}

export function runtimeProcessEnv(): EnvMap {
  return mergeRuntimeEnvMaps(fromNodeProcess(), fromFunctionGlobal(), fromGlobalThis(), fromImportMeta());
}

export function runtimeEnv(name: string, source?: EnvMap): string {
  const mapped = source ?? runtimeProcessEnv();
  const value = mapped[name];
  return typeof value === "string" ? value.trim() : "";
}
