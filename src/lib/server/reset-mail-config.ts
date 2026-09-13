import { transactionalMailConfigured } from "../transactional-mail.ts";

export const RESET_MAIL_NOT_CONFIGURED =
  "Email is not configured (missing RESEND_API_KEY or SENDGRID_API_KEY or TITAN_APP_PASSWORD)";

export function resetMailConfigured(env: NodeJS.ProcessEnv = process.env) {
  return transactionalMailConfigured(env);
}

export function assertResetMailConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (!resetMailConfigured(env)) throw new Error(RESET_MAIL_NOT_CONFIGURED);
}
