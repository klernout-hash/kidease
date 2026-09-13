/**
 * Password hygiene: min length, complexity, common-list, HIBP k-anonymity.
 * HIBP range API sends only the first 5 hex chars of SHA-1 — never the password.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_TOO_SHORT = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
export const PASSWORD_COMMON_MESSAGE =
  "That password is too common. Choose a longer phrase you have not used elsewhere.";
export const PASSWORD_BREACHED_MESSAGE =
  "That password appears in a public breach list. Choose a different one.";
export const PASSWORD_POLICY_HINT =
  "Use 8+ characters with upper, lower, a number, and a special character. Do not reuse a breached or common password.";

export type PasswordCheckId = "length" | "upper" | "lower" | "number" | "special";

export type PasswordCheck = {
  id: PasswordCheckId;
  label: string;
  ok: boolean;
};

const SPECIAL = /[^A-Za-z0-9]/;

/** Top common 8+ passwords (offline fallback when HIBP egress is blocked). */
export const COMMON_PASSWORDS = [
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "qwertyui",
  "qwerty123",
  "qwerty12",
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "abcdefgh",
  "abcdefg1",
  "letmein1",
  "letmein12",
  "welcome1",
  "welcome12",
  "welcome123",
  "iloveyou",
  "iloveyou1",
  "monkey12",
  "monkey123",
  "dragon12",
  "dragon123",
  "baseball",
  "football",
  "starwars",
  "trustno1",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "admin123",
  "admin1234",
  "administrator",
  "rootroot",
  "changeme",
  "changeme1",
  "kidease1",
  "kidease12",
  "kidease123",
  "daycare1",
  "daycare12",
  "parent12",
  "parent123",
  "summer12",
  "summer123",
  "winter12",
  "winter123",
  "sunshine",
  "princess",
  "superman",
  "whatever",
  "computer",
  "internet",
  "michelle",
  "jennifer",
  "jonathan",
  "nicholas",
  "samantha",
  "alexander",
  "chocolate",
  "liverpool",
  "barcelona",
  "mastercard",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "zaq12wsx",
  "qazwsxed",
  "qazwsxedc",
  "asdfasdf",
  "asdasdasd",
  "password!",
  "Password1",
  "Password123",
  "Passw0rd",
  "P@ssw0rd",
  "Abc12345",
  "Abcd1234",
  "Qwerty12",
  "Qwerty123",
  "Welcome1",
  "Welcome123",
] as const;

const COMMON_SET = new Set(COMMON_PASSWORDS.map((item) => item.toLowerCase()));

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { id: "upper", label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { id: "lower", label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { id: "number", label: "One number", ok: /\d/.test(password) },
    { id: "special", label: "One special character", ok: SPECIAL.test(password) },
  ];
}

export function passwordMeetsPolicy(password: string): boolean {
  return passwordChecks(password).every((item) => item.ok);
}

export function isCommonPassword(password: string, email?: string): boolean {
  const trimmed = password.trim();
  if (!trimmed) return false;
  if (COMMON_SET.has(trimmed.toLowerCase())) return true;
  const local = (email || "").split("@")[0]?.trim().toLowerCase();
  if (local && local.length >= PASSWORD_MIN_LENGTH && trimmed.toLowerCase() === local) return true;
  if (local && trimmed.toLowerCase() === `${local}123`) return true;
  if (local && trimmed.toLowerCase() === `${local}1`) return true;
  return false;
}

export function localPasswordIssue(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_TOO_SHORT;
  if (isCommonPassword(password, email)) return PASSWORD_COMMON_MESSAGE;
  if (!passwordMeetsPolicy(password)) return PASSWORD_POLICY_HINT;
  return null;
}
