export const RESET_MAIL_NOT_CONFIGURED =
  "Email is not configured (missing RESEND_API_KEY or SENDGRID_API_KEY)";

export function resetMailConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.RESEND_API_KEY?.trim() || env.SENDGRID_API_KEY?.trim());
}

export function assertResetMailConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (!resetMailConfigured(env)) throw new Error(RESET_MAIL_NOT_CONFIGURED);
}
