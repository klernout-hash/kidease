import { ADMIN_EMAIL } from "@/lib/server/notify";

function fromAddress() {
  return (process.env.MAIL_FROM || "KidEase <kyle@kidease.ca>").trim();
}

/** Send a password reset link to the registered mailbox. Never log the URL or token. */
export async function sendPasswordResetEmail(input: { to: string; url: string }) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) throw new Error("A registered email is required.");
  const subject = "Reset your KidEase password";
  const text = `Reset your KidEase password using this link:\n\n${input.url}\n\nThis link expires in about 1 hour. If you did not ask for a reset, you can ignore this email.`;
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">Reset your password</h1>
      <p style="margin:16px 0 0;color:#5c6578;">Use the button below. The link expires in about an hour. If you did not ask for this, ignore the email.</p>
      <p style="margin:24px 0 0;">
        <a href="${input.url}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">Choose a new password</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
  const from = fromAddress();
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: ADMIN_EMAIL, subject, text, html }),
    });
    if (!res.ok) throw new Error(`Email could not be sent (${res.status}).`);
    return "sent" as const;
  }
  const sendgrid = process.env.SENDGRID_API_KEY?.trim();
  if (sendgrid) {
    const fromMatch = from.match(/^(.*)<([^>]+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromMatch?.[2]?.trim() || ADMIN_EMAIL, name: fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase" },
        reply_to: { email: ADMIN_EMAIL },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Email could not be sent (${res.status}).`);
    return "sent" as const;
  }
  if (process.env.VERCEL_ENV === "production") throw new Error("Email is not configured");
  console.info("[kidease-reset] sent to registered inbox");
  return "logged" as const;
}
