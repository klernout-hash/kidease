/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 */
export const emailAndPasswordEnabled = true;

export async function sendResetPassword({
  user,
  url,
}: {
  user: { email: string };
  url: string;
}) {
  const { sendPasswordResetEmail } = await import("@/lib/server/reset-mail");
  await sendPasswordResetEmail({ to: user.email, url });
}

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { email: string; name?: string | null };
  url: string;
}) {
  try {
    const { sendVerifyEmail } = await import("@/lib/server/verify-mail");
    await sendVerifyEmail({ to: user.email, url, name: user.name });
  } catch (err) {
    console.error("[kidease-mail] verify-email send failed", err);
  }
}

export async function afterEmailVerification(user: { id: string }) {
  try {
    const { sendProviderNextStepsIfReady } = await import("@/lib/server/signup-user-mail.server");
    await sendProviderNextStepsIfReady(user.id);
  } catch (err) {
    console.error("[kidease-mail] afterEmailVerification next-steps failed", err);
  }
}

export const emailAndPasswordConfig = {
  enabled: true as const,
  minPasswordLength: 8,
  resetPasswordTokenExpiresIn: 60 * 60,
  revokeSessionsOnPasswordReset: true as const,
  sendResetPassword,
};

/** Do not set requireEmailVerification — a slow mailbox must not lock sign-in. */
export const emailVerificationConfig = {
  sendOnSignUp: true as const,
  autoSignInAfterVerification: true as const,
  expiresIn: 60 * 60 * 24,
  sendVerificationEmail,
  afterEmailVerification,
};
