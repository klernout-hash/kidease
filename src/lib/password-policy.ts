export type PasswordCheckId = "length" | "upper" | "lower" | "number" | "special";

export type PasswordCheck = {
  id: PasswordCheckId;
  label: string;
  ok: boolean;
};

const SPECIAL = /[^A-Za-z0-9]/;

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { id: "length", label: "At least 8 characters", ok: password.length >= 8 },
    { id: "upper", label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { id: "lower", label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { id: "number", label: "One number", ok: /\d/.test(password) },
    { id: "special", label: "One special character", ok: SPECIAL.test(password) },
  ];
}

export function passwordMeetsPolicy(password: string): boolean {
  return passwordChecks(password).every((item) => item.ok);
}

export const PASSWORD_POLICY_HINT =
  "Use 8+ characters with upper, lower, a number, and a special character.";
