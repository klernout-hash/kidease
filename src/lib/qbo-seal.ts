import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "keq1:";

function keyFrom(raw: string): Buffer | null {
  const text = raw.trim();
  if (!text) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(text) ? Buffer.from(text, "hex") : Buffer.from(text, "base64");
  return buf.length === 32 ? buf : null;
}

/** Encrypt a QuickBooks token. Returns null when the key is missing. */
export function sealQboToken(value: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const text = value.trim();
  const key = keyFrom(String(env.QBO_TOKEN_KEY || ""));
  if (!text || !key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/** Decrypt a stored token. Ciphertext is never returned. */
export function openQboToken(value: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!value.startsWith(PREFIX)) return null;
  const key = keyFrom(String(env.QBO_TOKEN_KEY || ""));
  if (!key) return null;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
