import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdminMailStatus, sendAdminMail } from "@/lib/server/admin-mail";

export function AdminMailPanel() {
  const [mailbox, setMailbox] = useState("kyle@kidease.ca");
  const [inboxUrl, setInboxUrl] = useState("https://app.titan.email");
  const [canSend, setCanSend] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void getAdminMailStatus()
      .then((s) => {
        setMailbox(s.mailbox);
        setInboxUrl(s.inboxUrl);
        setCanSend(s.canSend);
      })
      .catch(() => undefined);
  }, []);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await sendAdminMail({ data: { to, subject, body } });
      setNote(`Sent from ${mailbox}. Replies land in Titan.`);
      setBody("");
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
            Inbox is Titan for <span className="text-fg">{mailbox}</span>. KidEase can send from that address; replies still arrive in Titan.
          </p>
        </div>
        <a
          href={inboxUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
        >
          Open Titan inbox
        </a>
      </div>

      <form onSubmit={onSend} className="space-y-3 rounded-2xl bg-surface p-5 ring-1 ring-border">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Compose</p>
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
