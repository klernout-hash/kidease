import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "ke1:";

/** 32-byte key from CHILD_HEALTH_KEY (64 hex chars or standard base64). */
export function childHealthKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = String(env.CHILD_HEALTH_KEY || "").trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

/** Encrypt a health note. Plaintext stays plaintext until the key is set. */
export function sealHealth(value: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const key = childHealthKey(env);
  if (!key || text.startsWith(PREFIX)) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/** Decrypt a health note. Ciphertext is never returned to the screen. */
export function openHealth(value: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const text = String(value ?? "");
  if (!text.startsWith(PREFIX)) return text;
  const key = childHealthKey(env);
  if (!key) return "";
  try {
    const raw = Buffer.from(text.slice(PREFIX.length), "base64url");
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

const HEALTH_FIELDS = [
  "allergies",
  "medical_notes",
  "medications",
  "doctor_name",
  "doctor_phone",
  "emergency_name",
  "emergency_phone",
  "notes",
] as const;

export function revealChildHealth<T extends Record<string, unknown>>(row: T, env?: NodeJS.ProcessEnv): T {
  const next = { ...row };
  for (const field of HEALTH_FIELDS) {
    if (field in next && (typeof next[field] === "string" || next[field] == null)) {
      (next as Record<string, unknown>)[field] = openHealth(next[field] as string | null, env);
    }
  }
  return next;
}
