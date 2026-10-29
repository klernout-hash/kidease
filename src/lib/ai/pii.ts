/**
 * Strip personal data before any text is sent to a model.
 * The model only ever sees the string this returns.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const ISO_DATE = /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g;
const SLASH_DATE = /\b\d{1,2}[/-]\d{1,2}[/-](?:19|20)?\d{2}\b/g;
const MONTH =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre";
const MONTH_DATE = new RegExp(
  `\\b(?:${MONTH})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTH})\\s+(?:19|20)\\d{2}\\b`,
  "gi",
);
const LABELLED =
  /\b(?:child(?:'s)? name|nom de l'enfant|parent name|email|e-mail|phone|téléphone|telephone|birthdate|birth date|date de naissance|dob|health|santé|special needs|besoins particuliers)\s*[: -]\s*[^\n,;]{1,80}/gi;
const HEALTH =
  /\b(?:asthma|allergy|allergies|autism|adhd|epilepsy|diabetes|eczema|anaphylaxis|special needs|besoins particuliers|médicament|medications?|diagnosis|diagnosed|epi-?pen)\b(?:\s*[: -]\s*[^\n,;.]{1,80})?/gi;

const DROP_KEYS = new Set([
  "childname",
  "child_name",
  "name",
  "firstname",
  "lastname",
  "email",
  "phone",
  "birthdate",
  "birth_date",
  "dob",
  "health",
  "specialneeds",
  "special_needs",
  "notes_health",
]);

export function scrubText(value: string): string {
  return value
    .replace(EMAIL, "[redacted]")
    .replace(PHONE, "[redacted]")
    .replace(ISO_DATE, "[redacted]")
    .replace(SLASH_DATE, "[redacted]")
    .replace(MONTH_DATE, "[redacted]")
    .replace(LABELLED, "[redacted]")
    .replace(HEALTH, "[redacted]");
}

export function scrubFacts<T>(value: T): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (Array.isArray(value)) return value.map((item) => scrubFacts(item)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (DROP_KEYS.has(key.toLowerCase().replace(/[^a-z_]/g, ""))) continue;
    out[key] = scrubFacts(item);
  }
  return out as T;
}
