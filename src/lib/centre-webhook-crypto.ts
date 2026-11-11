/**
 * Webhook signing secrets at rest. AES-256-GCM with CENTRE_WEBHOOK_KEY.
 * The plaintext is used only while signing. A missing key refuses to seal.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "kew1:";

export function centreWebhookKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = String(env.CENTRE_WEBHOOK_KEY || "").trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export function isSealedWebhookSecret(value: string | null | undefined): boolean {
  return String(value || "").startsWith(PREFIX);
}

/** Ciphertext, or null when the key is missing or the value is empty. */
export function sealWebhookSecret(value: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.startsWith(PREFIX)) return text;
  const key = centreWebhookKey(env);
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/** Plaintext for signing. Anything that is not a valid seal stays empty. */
export function openWebhookSecret(value: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const text = String(value ?? "");
  if (!text.startsWith(PREFIX)) return "";
  const key = centreWebhookKey(env);
  if (!key) return "";
  try {
    const raw = Buffer.from(text.slice(PREFIX.length), "base64url");
    if (raw.length < 29) return "";
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
