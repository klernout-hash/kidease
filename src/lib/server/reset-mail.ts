import { createServerFn } from "@tanstack/react-start";
import { ADMIN_EMAIL } from "@/lib/server/notify";
import { assertResetMailConfigured, resetMailConfigured } from "@/lib/server/reset-mail-config";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { brandedNotice } from "@/lib/email-layout";
import { preferFrenchResetUrl, RESET_SUBJECT_EN, RESET_SUBJECT_FR } from "@/lib/fr-auth-qc";

export { RESET_MAIL_NOT_CONFIGURED, assertResetMailConfigured, resetMailConfigured } from "@/lib/server/reset-mail-config";

/** Public boolean only — never leak which mail key is set. */
export const getResetMailReady = createServerFn({ method: "GET" }).handler(() => {
  return resetMailConfigured();
});

function resetNoticeHtml(url: string, heading: string, body: string, cta: string) {
  return `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">${heading}</h1>
      <p style="margin:16px 0 0;color:#5c6578;">${body}</p>
      <p style="margin:24px 0 0;">
        <a href="${url}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">${cta}</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/** Send a password reset link to the registered mailbox. Never log the URL or token. */
export async function sendPasswordResetEmail(input: { to: string; url: string; french?: boolean }) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) throw new Error("A registered email is required.");
  assertResetMailConfigured();
  let french = input.french;
  if (french === undefined) {
    const { frenchAuthMailForEmail } = await import("@/lib/server/fr-auth-mail.server");
    french = await frenchAuthMailForEmail(to);
  }
  const url = preferFrenchResetUrl(input.url, french);
  const subject = french ? RESET_SUBJECT_FR : RESET_SUBJECT_EN;
  const heading = french ? "Réinitialiser votre mot de passe" : "Reset your password";
  const body = french
    ? "Utilisez le bouton ci-dessous. Le lien expire dans environ une heure. Si vous n’avez pas demandé ceci, ignorez le courriel."
    : "Use the button below. The link expires in about an hour. If you did not ask for this, ignore the email.";
  const cta = french ? "Choisir un nouveau mot de passe" : "Choose a new password";
  const reason = french
    ? "Vous recevez ce message parce qu’une réinitialisation du mot de passe a été demandée pour ce courriel."
    : "You get this because a password reset was requested for this email.";
  const text = french
    ? `Réinitialisez votre mot de passe KidEase avec ce lien :\n\n${url}\n\nCe lien expire dans environ une heure. Si vous n’avez pas demandé de réinitialisation, ignorez ce courriel.`
    : `Reset your KidEase password using this link:\n\n${url}\n\nThis link expires in about 1 hour. If you did not ask for a reset, you can ignore this email.`;
  const html = resetNoticeHtml(url, heading, body, cta);
  const result = await sendTransactionalMail({
    purpose: "password_reset",
    to,
    subject,
    text,
    html,
    replyTo: ADMIN_EMAIL,
    branded: brandedNotice({
      heading,
      text: body,
      cta: /^https:\/\//i.test(url) ? { label: cta, href: url } : undefined,
      reason,
      locale: french ? "fr" : "en",
    }),
  });
  return result.status;
}