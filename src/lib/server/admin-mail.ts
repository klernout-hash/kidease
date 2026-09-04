import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL } from "@/lib/server/notify";
import { requireAdmin } from "@/lib/server/roles";
import { reportError } from "@/lib/observe";
import {
  adminMailHtml,
  adminMailStatusFromEnv,
  humanTitanError,
  mailboxAddress,
  mailFromHeader,
  titanAppPassword,
  type AdminMailStatus,
  type TitanListItem,
  type TitanMessage,
} from "@/lib/server/titan-mail";

export type { AdminMailStatus, TitanListItem, TitanMessage };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fallbackSendAvailable() {
  return Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SENDGRID_API_KEY?.trim());
}

export const getAdminMailStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminMailStatus> => {
    await requireAdmin(context.userId);
    return adminMailStatusFromEnv();
  });

export const listAdminMailbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { limit?: number }) => ({
    limit: Math.min(80, Math.max(1, Number(input?.limit) || 40)),
  }))
  .handler(async ({ context, data }): Promise<{ ok: boolean; messages: TitanListItem[]; error: string | null }> => {
    await requireAdmin(context.userId);
    if (!titanAppPassword()) {
      return { ok: false, messages: [], error: adminMailStatusFromEnv().setupMessage };
    }
    try {
      const { listTitanInbox } = await import("@/lib/server/titan-mail.server");
      const messages = await listTitanInbox(data.limit);
      return { ok: true, messages, error: null };
    } catch (err) {
      reportError(err, { route: "listAdminMailbox" });
      return { ok: false, messages: [], error: humanTitanError(err, titanAppPassword()) };
    }
  });

export const getAdminMailboxMessage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { uid: number }) => ({
    uid: Number(input?.uid),
  }))
  .handler(async ({ context, data }): Promise<{ ok: boolean; message: TitanMessage | null; error: string | null }> => {
    await requireAdmin(context.userId);
    if (!titanAppPassword()) {
      return { ok: false, message: null, error: adminMailStatusFromEnv().setupMessage };
    }
    try {
      const { getTitanMessage } = await import("@/lib/server/titan-mail.server");
      const message = await getTitanMessage(data.uid);
      return { ok: true, message, error: null };
    } catch (err) {
      reportError(err, { route: "getAdminMailboxMessage" });
      return { ok: false, message: null, error: humanTitanError(err, titanAppPassword()) };
    }
  });

export const sendAdminMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { to: string; subject: string; body: string; inReplyTo?: string; references?: string }) => ({
    to: String(input.to || "").trim(),
    subject: String(input.subject || "").trim(),
    body: String(input.body || "").trim(),
    inReplyTo: String(input.inReplyTo || "").trim(),
    references: String(input.references || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (!EMAIL_RE.test(data.to)) throw new Error("Enter a valid email address.");
    if (!data.subject) throw new Error("Add a subject.");
    if (!data.body) throw new Error("Add a message.");

    const html = adminMailHtml(data.body);
    if (titanAppPassword()) {
      try {
        const { sendTitanMail } = await import("@/lib/server/titan-mail.server");
        return await sendTitanMail({
          to: data.to,
          subject: data.subject,
          text: data.body,
          html,
          inReplyTo: data.inReplyTo || undefined,
          references: data.references || undefined,
        });
      } catch (err) {
        reportError(err, { route: "sendAdminMail.titan" });
        throw new Error(humanTitanError(err, titanAppPassword()));
      }
    }

    const from = mailFromHeader();
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
          headers: {
            ...(data.inReplyTo ? { "In-Reply-To": data.inReplyTo } : {}),
            ...(data.references ? { References: data.references } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error(`Could not send: ${await res.text()}`);
      return { ok: true as const, via: "resend" as const, copiedToSent: false };
    }

    const sendgrid = process.env.SENDGRID_API_KEY?.trim();
    if (sendgrid) {
      const fromMatch = from.match(/^(.*)<([^>]+)>$/);
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: data.to }] }],
          from: { email: fromMatch?.[2]?.trim() || mailboxAddress(), name: fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase" },
          reply_to: { email: ADMIN_EMAIL },
          subject: data.subject,
          content: [
            { type: "text/plain", value: data.body },
            { type: "text/html", value: html },
          ],
          headers: {
            ...(data.inReplyTo ? { "In-Reply-To": data.inReplyTo } : {}),
            ...(data.references ? { References: data.references } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error(`Could not send: ${await res.text()}`);
      return { ok: true as const, via: "sendgrid" as const, copiedToSent: false };
    }

    if (!fallbackSendAvailable()) {
      throw new Error(adminMailStatusFromEnv().setupMessage || "Outbound mail is not configured on this host.");
    }
    throw new Error("Outbound mail is not configured on this host.");
  });
