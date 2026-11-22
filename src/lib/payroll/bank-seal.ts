/**
 * Bank and SIN numbers for pay forms.
 * AES-256-GCM. The key is PAYROLL_BANK_KEY (64 hex chars or base64).
 * No key in source. Plaintext is never stored when the key is missing.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "kebank1:";

export function payrollBankKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = String(env.PAYROLL_BANK_KEY || "").trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

/** Encrypt. Returns null when the key is missing so callers cannot store plaintext. */
export function sealBank(value: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const text = value.trim();
  const key = payrollBankKey(env);
  if (!text || !key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64url");
}

/** Decrypt for the owner PDF only. Ciphertext is never returned. */
export function openBank(value: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!value.startsWith(PREFIX)) return null;
  const key = payrollBankKey(env);
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

export function planDeposit(input: {
  institution: string;
  transit: string;
  account: string;
  env?: NodeJS.ProcessEnv;
}): { ok: true; cipher: string; last4: string } | { ok: false; error: "bank" | "bank_key" } {
  const institution = input.institution.replace(/\D/g, "");
  const transit = input.transit.replace(/\D/g, "");
  const account = input.account.replace(/\D/g, "");
  if (!/^\d{3}$/.test(institution) || !/^\d{5}$/.test(transit) || !/^\d{7,12}$/.test(account)) {
    return { ok: false, error: "bank" };
  }
  const cipher = sealBank(`${institution}|${transit}|${account}`, input.env);
  if (!cipher) return { ok: false, error: "bank_key" };
  return { ok: true, cipher, last4: account.slice(-4) };
}
