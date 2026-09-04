export type PasswordRuleId = "length" | "upper" | "lower" | "number" | "special";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  ok: boolean;
};

const SPECIAL = /[^A-Za-z0-9]/;

export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: "length", label: "At least 8 characters", ok: password.length >= 8 },
    { id: "upper", label: "1 uppercase letter", ok: /[A-Z]/.test(password) },
    { id: "lower", label: "1 lowercase letter", ok: /[a-z]/.test(password) },
    { id: "number", label: "1 number", ok: /[0-9]/.test(password) },
    { id: "special", label: "1 special character", ok: SPECIAL.test(password) },
  ];
}

export function passwordMeetsRules(password: string): boolean {
  return passwordRules(password).every((rule) => rule.ok);
}

export const PASSWORD_HINT =
  "Use 8+ characters with upper, lower, a number, and a special character.";
