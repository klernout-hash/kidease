/**
 * Mask door / wifi / PIN / medical secrets in inbox list + template previews.
 * Staff still see the real thread body. Never leak codes in chips or last-line previews.
 */

export const INBOX_SECRET_MASK = "Code on file · shared at check-in";
export const INBOX_MEDICAL_MASK = "On file · shared at check-in";

const CODE_RE =
  /\b(?:wifi|wi-?fi|password|passwd|passcode|door\s*code|gate\s*code|entry\s*code|alarm\s*code|pin|p\.?i\.?n\.?|keycode|key\s*code|lockbox|access\s*code)\b[^.\n]{0,80}/gi;

const MEDICAL_RE =
  /\b(?:allerg(?:y|ies)|epi-?pen|epinephrine|medications?|medical\s+notes?|inhaler|anaphylaxis|nut-?free)\b[^.\n]{0,120}/gi;

export function containsInboxSecret(text: string | null | undefined): boolean {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  CODE_RE.lastIndex = 0;
  MEDICAL_RE.lastIndex = 0;
  return CODE_RE.test(raw) || MEDICAL_RE.test(raw);
}

export function maskInboxPreview(text: string | null | undefined, fallback = ""): string {
  let out = String(text || "").replace(/\s+/g, " ").trim();
  if (!out) return fallback;
  CODE_RE.lastIndex = 0;
  MEDICAL_RE.lastIndex = 0;
  out = out.replace(CODE_RE, INBOX_SECRET_MASK);
  out = out.replace(MEDICAL_RE, INBOX_MEDICAL_MASK);
  if (out.length > 140) out = `${out.slice(0, 137).trim()}…`;
  return out;
}

export function assertNoInboxSecrets(text: string | null | undefined): string {
  const masked = maskInboxPreview(text, "");
  return masked;
}
