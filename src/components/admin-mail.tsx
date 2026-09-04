import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getAdminMailboxMessage,
  getAdminMailStatus,
  listAdminMailbox,
  sendAdminMail,
  type AdminMailStatus,
  type TitanListItem,
  type TitanMessage,
} from "@/lib/server/admin-mail";

export function AdminMailPanel() {
  const [status, setStatus] = useState<AdminMailStatus | null>(null);
  const [messages, setMessages] = useState<TitanListItem[]>([]);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [open, setOpen] = useState<TitanMessage | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [inReplyTo, setInReplyTo] = useState("");
  const [references, setReferences] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const mailbox = status?.mailbox || "kyle@kidease.ca";
  const inboxUrl = status?.inboxUrl || "https://app.titan.email";
  const canSend = Boolean(status?.canSend);

  async function loadInbox() {
    setInboxLoading(true);
    setInboxError(null);
    try {
      const inbox = await listAdminMailbox({ data: { limit: 40 } });
      if (inbox.ok) setMessages(inbox.messages);
      setInboxError(inbox.error);
    } catch (err) {
      setMessages([]);
      setInboxError(err instanceof Error ? err.message : "Could not load the Titan inbox.");
    } finally {
      setInboxLoading(false);
    }
  }

  useEffect(() => {
    void getAdminMailStatus()
      .then((next) => {
        setStatus(next);
        if (!next.titanLinked) {
          setInboxError(next.setupMessage);
          setInboxLoading(false);
          return;
        }
        return loadInbox();
      })
      .catch(() => {
        setInboxError("Could not load Mail.");
        setInboxLoading(false);
      });
  }, []);

  async function onOpen(uid: number) {
    setBusy(true);
    setOpenError(null);
    try {
      const res = await getAdminMailboxMessage({ data: { uid } });
      if (!res.ok || !res.message) {
        setOpenError(res.error || "Could not open that message.");
        return;
      }
      setOpen(res.message);
      setMessages((rows) => rows.map((row) => (row.uid === uid ? { ...row, unseen: false } : row)));
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not open that message.");
    } finally {
      setBusy(false);
    }
  }

  function onReply(message: TitanMessage) {
    setTo(message.fromEmail);
    setSubject(replySubject(message.subject));
    setBody(quoteReplyBody(message.from, message.date, message.text));
    setInReplyTo(message.messageId);
    const refs = [message.references, message.messageId].filter(Boolean).join(" ").trim();
    setReferences(refs);
    setNote(null);
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const sent = await sendAdminMail({
        data: { to, subject, body, inReplyTo, references },
      });
      const via = sent.via === "titan" ? "Titan" : sent.via === "resend" ? "Resend" : sent.via === "sendgrid" ? "SendGrid" : "mail";
      setNote(`Sent from ${mailbox} via ${via}.`);
      setBody("");
      setInReplyTo("");
      setReferences("");
      if (status?.titanLinked) void loadInbox();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Mail</h2>
          <p className="mt-1 text-sm text-muted">
            Inbox is Titan for <span className="text-fg">{mailbox}</span>. List, read, and reply here; Open Titan inbox stays as a fallback.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.titanLinked ? (
            <Button type="button" variant="secondary" size="sm" disabled={inboxLoading || busy} onClick={() => void loadInbox()}>
              {inboxLoading ? "Refreshing…" : "Refresh inbox"}
            </Button>
          ) : null}
          <a
            href={inboxUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
          >
            Open Titan inbox
          </a>
        </div>
      </div>

      {inboxError ? (
        <p className="mb-6 rounded-2xl bg-surface px-5 py-4 text-sm text-muted ring-1 ring-border">
          {inboxError}
        </p>
      ) : null}

      <section className="mb-6 overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Inbox</p>
          <p className="text-xs text-muted">
            {inboxLoading ? "Loading…" : messages.length === 0 ? "No messages" : `${messages.length} shown`}
          </p>
        </div>
        {inboxLoading ? (
          <p className="border-t border-border px-5 py-8 text-sm text-muted">Loading Titan inbox…</p>
        ) : messages.length === 0 ? (
          <p className="border-t border-border px-5 py-8 text-sm text-muted">
            {status?.titanLinked ? "This Titan inbox is empty." : "Inbox listing needs TITAN_APP_PASSWORD."}
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {messages.map((row) => (
              <li key={row.uid}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left hover:bg-bg"
                  onClick={() => void onOpen(row.uid)}
                  disabled={busy}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={row.unseen ? "truncate font-medium" : "truncate"}>{row.from}</p>
                      {row.unseen ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-primary">New</span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-muted">{row.subject}</p>
                  </div>
                  <p className="shrink-0 text-xs text-subtle">{formatMailDate(row.date)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openError ? <p className="mb-6 text-sm text-muted">{openError}</p> : null}

      {open ? (
        <section className="mb-6 rounded-2xl bg-surface p-5 ring-1 ring-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Message</p>
          <h3 className="mt-2 font-display text-xl">{open.subject}</h3>
          <p className="mt-1 text-sm text-muted">
            {open.from}
            {open.date ? ` · ${formatMailDate(open.date)}` : ""}
          </p>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6">
            {open.text || "No plain-text body. Use Open Titan inbox if you need the original."}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onReply(open)}>
              Reply
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(null)}>
              Close
            </Button>
          </div>
        </section>
      ) : null}

      <form onSubmit={onSend} className="space-y-3 rounded-2xl bg-surface p-5 ring-1 ring-border">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
          {inReplyTo ? "Reply" : "Compose"}
        </p>
        <label className="block text-sm">
          To
          <input className="ke-input mt-1" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="parent@email.com" />
        </label>
        <label className="block text-sm">
          Subject
          <input className="ke-input mt-1" required value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="block text-sm">
          Message
          <textarea className="ke-input mt-1 min-h-40" required value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {note ? <p className="text-sm text-muted">{note}</p> : null}
        <Button type="submit" disabled={busy || !canSend}>
          {busy ? "Sending…" : canSend ? `Send from ${mailbox}` : "Outbound mail is not configured"}
        </Button>
      </form>
    </>
  );
}

function formatMailDate(raw: string) {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
}

function replySubject(subject: string) {
  const trimmed = subject.trim() || "(no subject)";
  return /^re\s*:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function quoteReplyBody(from: string, date: string, text: string) {
  const clipped = text.trim().slice(0, 4000);
  const quoted = clipped
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${date || "an earlier message"}, ${from || "the sender"} wrote:\n${quoted}`;
}
