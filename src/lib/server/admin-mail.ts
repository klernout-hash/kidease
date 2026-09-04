import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL } from "@/lib/server/notify";
import { requireAdmin } from "@/lib/server/roles";

const TITAN_INBOX = "https://app.titan.email";

function mailbox() {
  return (process.env.ADMIN_EMAIL || "kyle@kidease.ca").trim().toLowerCase();
}

export const getAdminMailStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return {
      mailbox: mailbox(),
      inboxUrl: TITAN_INBOX,
      canSend: Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SENDGRID_API_KEY?.trim()),
      titanLinked: Boolean(process.env.TITAN_APP_PASSWORD?.trim()),
    };
  });

export const sendAdminMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { to: string; subject: string; body: string }) => ({
    to: String(input.to || "").trim(),
    subject: String(input.subject || "").trim(),
    body: String(input.body || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to)) throw new Error("Enter a valid email address.");
    if (!data.subject) throw new Error("Add a subject.");
    if (!data.body) throw new Error("Add a message.");

    const from = (process.env.MAIL_FROM || `KidEase <${mailbox()}>`).trim();
    const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;font-size:16px;line-height:1.6;white-space:pre-wrap;">${data.body
      .replace(/&/g, "&#38;")
      .replace(/</g, "&#60;")
      .replace(/>/g, "&#62;")
      .replace(/\n/g, "<br/>")}</td></tr>
  </table>
</body></html>`;

    const resend = process.env.RESEND_API_KEY?.trim();
    if (resend) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [data.to],
          reply_to: ADMIN_EMAIL,
          subject: data.subject,
          text: data.body,
          html,
        }),
      });
      if (!res.ok) throw new Error(`Could not send: ${await res.text()}`);
      return { ok: true as const, via: "resend" as const };
    }

    const sendgrid = process.env.SENDGRID_API_KEY?.trim();
    if (sendgrid) {
      const fromMatch = from.match(/^(.*)<([^>]+)>$/);
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: data.to }] }],
          from: { email: fromMatch?.[2]?.trim() || ADMIN_EMAIL, name: fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase" },
          reply_to: { email: ADMIN_EMAIL },
          subject: data.subject,
          content: [
            { type: "text/plain", value: data.body },
            { type: "text/html", value: html },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Could not send: ${await res.text()}`);
      return { ok: true as const, via: "sendgrid" as const };
    }

    throw new Error("Outbound mail is not configured on this host.");
  });
