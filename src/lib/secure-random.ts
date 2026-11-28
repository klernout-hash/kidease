/**
 * Cryptographically secure randomness for ids, codes and tokens.
 * Uses Web Crypto (`globalThis.crypto`), present in browsers, the Capacitor
 * web view, Node 22+ and Vercel functions. Never falls back to Math.random.
 *
 * No @/ imports: Node tests load this file directly.
 */

export const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function webCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Secure randomness is not available");
  }
  return c;
}

/** Unbiased integer in [0, max). `max` must be 1..2^32. */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 0x1_0000_0000) throw new RangeError("bad max");
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    webCrypto().getRandomValues(buf);
    const value = buf[0]!;
    if (value < limit) return value % max;
  }
}

/** Secure float in [0, 1), for places a `() => number` hook is kept for tests. */
export function secureRandom(): number {
  const buf = new Uint32Array(2);
  webCrypto().getRandomValues(buf);
  // 53 random bits, the full precision of a double.
  return (buf[0]! * 0x20_0000 + (buf[1]! >>> 11)) / 0x20_0000_0000_0000;
}

/** `length` characters drawn uniformly from `alphabet`. */
export function secureRandomString(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[secureRandomInt(alphabet.length)];
  return out;
}

/** Lowercase hex string from `bytes` random bytes. */
export function secureRandomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  webCrypto().getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
