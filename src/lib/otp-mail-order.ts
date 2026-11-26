/**
 * Admin Mail label for the real sign-in code path (see sendTransactionalMail):
 * codes go Titan SMTP first when TITAN_APP_PASSWORD is set, then Resend, then SendGrid.
 */
export type OtpMailProviders = {
  resendConfigured: boolean;
  sendgridConfigured: boolean;
  titanConfigured: boolean;
};

export function otpMailOrderLabel(p: OtpMailProviders): string {
  const steps: string[] = [];
  if (p.titanConfigured) steps.push("Titan first");
  if (p.resendConfigured) steps.push(p.titanConfigured ? "then Resend" : "Resend first");
  if (p.sendgridConfigured) steps.push("then SendGrid");
  if (!steps.length) return "Sign-in codes: no mail provider set";
  const off = [
    p.titanConfigured ? null : "Titan off (no TITAN_APP_PASSWORD)",
    p.resendConfigured ? null : "Resend off",
    p.sendgridConfigured ? null : "SendGrid off",
  ].filter(Boolean);
  return `Sign-in codes: ${steps.join(", ")}${off.length ? ` · ${off.join(" · ")}` : ""}`;
}
