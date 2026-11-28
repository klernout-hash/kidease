/**
 * One strict check for any return destination (`next`, back target, native
 * hand-back path) before it reaches location.assign / replace or a redirect.
 *
 * Allowed: a same-origin relative path that starts with exactly one `/`,
 * e.g. `/parent`, `/fr/parent?tab=saved#top`, `/search?q=winnipeg`.
 *
 * Rejected (fallback returned):
 * - anything not starting with `/`, including schemes (`https:`, `javascript:`)
 * - `//host` and `/\host` (browsers treat `\` like `/`)
 * - any backslash
 * - control characters, incl. tab / newline / carriage return, which the URL
 *   parser strips (so `/<tab>/host` becomes `//host`)
 * - whitespace in the path part
 * - the same tricks after percent-decoding once and twice
 * - anything that the URL parser resolves to another origin
 *
 * No @/ imports: Node tests load this file directly.
 */

const MAX_LENGTH = 2048;
const PROBE_ORIGIN = "https://kidease.invalid";
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const WHITESPACE = /\s/;

function decodeOnce(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function unsafeLayer(value: string): boolean {
  if (CONTROL.test(value) || value.includes("\\")) return true;
  if (!value.startsWith("/")) return false;
  const second = value.charAt(1);
  return second === "/" || second === "\\";
}

export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value || value.length > MAX_LENGTH) return false;
  if (value.charAt(0) !== "/") return false;
  if (unsafeLayer(value)) return false;
  const cut = value.search(/[?#]/);
  const path = cut === -1 ? value : value.slice(0, cut);
  if (WHITESPACE.test(path)) return false;
  const once = decodeOnce(value);
  if (once !== null && once !== value) {
    if (unsafeLayer(once)) return false;
    const twice = decodeOnce(once);
    if (twice !== null && twice !== once && unsafeLayer(twice)) return false;
  }
  try {
    const url = new URL(value, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return false;
  } catch {
    return false;
  }
  return true;
}

/** `value` if it is a safe internal path (trimmed), else `fallback`. */
export function safeInternalPath<T extends string | null>(value: unknown, fallback: T): string | T {
  const trimmed = typeof value === "string" ? value.trim() : value;
  return isSafeInternalPath(trimmed) ? trimmed : fallback;
}
