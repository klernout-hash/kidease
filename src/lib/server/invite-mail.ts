import { ADMIN_EMAIL } from "@/lib/server/notify";
import { sendTransactionalMail } from "@/lib/transactional-mail";

export function employeeInviteAppOrigin(): string {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(
    /\/$/,
    "",
  );
}

export function employeeInviteUrl(token: string, origin = employeeInviteAppOrigin()): string {
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export async function sendEmployeeInviteEmail(input: {
  to: string;
  centreName: string;
  roleLabel: string;
  url: string;
  invitedName?: string | null;
}) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) throw new Error("A work email is required.");
  const hello = input.invitedName?.trim() ? `Hi ${input.invitedName.trim()},` : "Hi,";
  const subject = `You're invited to ${input.centreName} on KidEase`;
  const text = `${hello}

You've been invited to join ${input.centreName} on KidEase as ${input.roleLabel}.

Open this link to create your own login (or sign in if you already have one):

${input.url}

This invite expires in 14 days. If you were not expecting this, you can ignore the email.

— KidEase
Vous avez été invité(e) à joindre ${input.centreName} sur KidEase. Ouvrez le lien pour créer votre propre connexion.`;
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">Join ${escapeHtml(input.centreName)}</h1>
      <p style="margin:16px 0 0;color:#5c6578;">${escapeHtml(hello)} You've been invited as ${escapeHtml(input.roleLabel)}. Use your own login — do not share the owner's password.</p>
      <p style="margin:24px 0 0;">
        <a href="${escapeAttr(input.url)}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">Accept invite</a>
      </p>
      <p style="margin:20px 0 0;font-size:13px;color:#5c6578;">This link expires in 14 days. Vous avez été invité(e) à joindre ce centre sur KidEase.</p>
    </td></tr>
  </table>
</body></html>`;
  return sendTransactionalMail({
    purpose: "invite",
    to,
    subject,
    text,
    html,
    replyTo: ADMIN_EMAIL,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
