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

export const emailAndPasswordConfig = {
  enabled: true as const,
  minPasswordLength: 8,
  resetPasswordTokenExpiresIn: 60 * 60,
  revokeSessionsOnPasswordReset: true as const,
  sendResetPassword,
};
