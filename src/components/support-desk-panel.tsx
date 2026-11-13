import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";
import { localePath } from "@/lib/locale-path";
import { messageReferenceInBody, supportCopy, withMessageReference, type SupportLocale } from "@/lib/support-desk";
import { loadSupportDesk, postSupportDesk, supportDeskStatus } from "@/lib/server/support-desk";
import { listAdminSupportDesk, replyAdminSupportDesk } from "@/lib/server/support-desk";

function pack(locale: string) {
  return locale === "fr" ? supportCopy.fr : supportCopy.en;
}

export function SupportDeskBar({
  open,
  onOpen,
}: {
  open: boolean;
  onOpen: (next: boolean) => void;
}) {
  const { locale } = useCopy();
  const copy = pack(locale as SupportLocale);
  const [enabled, setEnabled] = useState(false);
  const [chip, setChip] = useState<"all" | "daycares" | "support">("all");

  useEffect(() => {
    let stop = false;
    void supportDeskStatus()
      .then((row) => {
        if (!stop) setEnabled(Boolean(row.enabled));
      })
      .catch(() => {
        if (!stop) setEnabled(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  if (!enabled) {
    return (
      <section className="mt-4 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="support-desk" data-open="no">
        <h3 className="font-display text-xl">{copy.title}</h3>
        <p className="mt-1 text-sm text-muted">{copy.off}</p>
        <Link
          to={localePath("/contact", locale)}
          className="mt-2 inline-flex min-h-11 min-w-11 items-center font-semibold text-primary underline-offset-4 touch-manipulation hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {copy.contact}
        </Link>
      </section>
    );
  }

  return (
    <div className="mt-4" data-ke="support-desk" data-open="yes">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy.title}>
        {(
          [
            ["all", copy.all],
            ["daycares", copy.daycares],
            ["support", copy.support],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={chip === id}
            className={`min-h-11 rounded-full px-4 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
              chip === id ? "bg-fg text-bg" : "bg-surface text-fg ring-1 ring-border"
            }`}
            onClick={() => {
              setChip(id);
              onOpen(id === "support");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {open ? <SupportThread copy={copy} /> : null}
    </div>
  );
}

function SupportThread({ copy }: { copy: (typeof supportCopy)[SupportLocale] }) {
  const [lines, setLines] = useState<Array<{ id: string; sender: string; body: string }>>([]);
  const [text, setText] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    void loadSupportDesk()
      .then((row) => {
        if (row.enabled) setLines(row.messages);
      })
      .catch(() => setNote(copy.failed));
  }, [copy.failed]);

  return (
    <section className="mt-3 rounded-xl bg-surface p-4 ring-1 ring-border" aria-label={copy.title}>
      <h3 className="font-display text-xl">{copy.title}</h3>
      <p className="mt-1 text-sm text-muted">{copy.lead}</p>
      <ul className="mt-3 space-y-2">
        {lines.length === 0 ? <li className="text-sm text-muted">{copy.empty}</li> : null}
        {lines.map((line) => (
          <li key={line.id} className="rounded-lg bg-bg px-3 py-2 text-sm">
            <span className="font-medium">{line.sender === "admin" ? copy.title : copy.send}</span>
            <p>{line.body}</p>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const body = withMessageReference(text, reference);
          if (!body) return;
          void postSupportDesk({ data: { body } })
            .then((row) => {
              if (!row.enabled) return;
              if (!row.ok && row.reason === "limited") {
                setNote(copy.limited);
                return;
              }
              if (!row.ok) {
                setNote(copy.failed);
                return;
              }
              setLines((current) => [...current, { id: row.id, sender: "user", body }]);
              setText("");
              const outside = row.notice?.email === "sent" || row.notice?.sms === "sent";
              setNote(outside ? copy.sent : `${copy.sent} ${copy.quiet}`);
            })
            .catch(() => setNote(copy.failed));
        }}
      >
        <label className="mb-2 block text-sm">
          <span className="text-muted">{copy.reference}</span>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="KE-0000-0000"
            autoComplete="off"
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-bg px-3 font-mono"
          />
        </label>
        <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-sm">
          <span className="sr-only">{copy.placeholder}</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={copy.placeholder}
            className="min-h-11 w-full rounded-lg border border-border bg-bg px-3"
            maxLength={2000}
          />
        </label>
        <button type="submit" className="min-h-11 min-w-11 rounded-lg bg-fg px-4 text-sm font-medium text-bg touch-manipulation">
          {copy.send}
        </button>
        </div>
      </form>
      {note ? (
        <p className="mt-2 text-sm" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}

export function AdminSupportDesk() {
  const { locale } = useCopy();
  const copy = pack(locale);
  const [enabled, setEnabled] = useState(false);
  const [threads, setThreads] = useState<Array<{ id: string; unread: boolean; preview: string }>>([]);
  const [active, setActive] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    void listAdminSupportDesk()
      .then((row) => {
        if (!row.enabled) return;
        setEnabled(true);
        setThreads(row.threads);
      })
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="admin-support-desk">
      <h3 className="font-display text-xl">{copy.title}</h3>
      <ul className="mt-3 space-y-2">
        {threads.length === 0 ? <li className="text-sm text-muted">{copy.empty}</li> : null}
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className="min-h-11 w-full rounded-lg px-3 text-left text-sm ring-1 ring-border touch-manipulation"
              onClick={() => setActive(thread.id)}
            >
              {thread.unread ? "• " : ""}
              {messageReferenceInBody(thread.preview) ? `${messageReferenceInBody(thread.preview)} · ` : ""}
              {thread.preview || copy.empty}
            </button>
          </li>
        ))}
      </ul>
      {active ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const body = text.trim();
            if (!body) return;
            void replyAdminSupportDesk({ data: { threadId: active, body } }).then(() => setText(""));
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label={copy.placeholder}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3"
          />
          <button type="submit" className="min-h-11 rounded-lg bg-fg px-4 text-sm font-medium text-bg">
            {copy.send}
          </button>
        </form>
      ) : null}
    </section>
  );
}
