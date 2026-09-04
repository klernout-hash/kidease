export type TurnstileMode = "off" | "optional" | "enforce";

/** Production enforces when both keys are present. Preview fails open. */
export function turnstileMode(input: {
  siteKey?: string;
  secretKey?: string;
  production?: boolean;
}): TurnstileMode {
  const site = (input.siteKey || "").trim();
  const secret = (input.secretKey || "").trim();
  if (!site || !secret) return "off";
  return input.production ? "enforce" : "optional";
}
