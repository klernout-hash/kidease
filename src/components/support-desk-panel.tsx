import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";
import { localePath } from "@/lib/locale-path";
import { LiveSupportChat } from "@/components/live-support-chat";
import { liveSupportPack } from "@/lib/live-support";
import { messageReferenceInBody, supportCopy, withMessageReference, type SupportLocale } from "@/lib/support-desk";
import { liveSupportStatus } from "@/lib/server/live-support";
import { listAdminSupportDesk, loadSupportDesk, postSupportDesk, replyAdminSupportDesk, supportDeskStatus } from "@/lib/server/support-desk";

function pack(locale: string) {
  return locale === "fr" ? supportCopy.fr : supportCopy.en;
}

function useSupportDeskStatus() {
  const [enabled, setEnabled] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    let stop = false;
    void Promise.all([
      supportDeskStatus().catch(() => ({ enabled: false })),
      liveSupportStatus().catch(() => ({ enabled: false })),
    ]).then(([legacy, next]) => {
      if (stop) return;
      setEnabled(Boolean(legacy.enabled));
      setLive(Boolean(next.enabled));
    });
    return () => {
      stop = true;
    };
  }, []);
  return { enabled, live };
}

/**
 * The support chat body on its own. The daycare inbox renders it in the wide
 * thread column: inside the narrow list column the input was 0px wide.
 */
export function SupportDeskChat() {
  const { locale } = useCopy();
  const copy = pack(locale as SupportLocale);
  const { enabled, live } = useSupportDeskStatus();
  if (live) return <LiveSupportChat mode="member" />;
  if (enabled) return <SupportThread copy={copy} />;
  return null;
}

export function SupportDeskBar({
  open,
  onOpen,
  inlineChat = true,
}: {
  open: boolean;
  onOpen: (next: boolean) => void;
  /** False when the page shows <SupportDeskChat /> in its own wide pane. */
  inlineChat?: boolean;
}) {
  const { locale } = useCopy();
  const copy = pack(locale as SupportLocale);
  const { enabled, live } = useSupportDeskStatus();
  const [picked, setChip] = useState<"all" | "daycares" | "support">("all");
  // Opening a parent thread closes support; the chips follow `open`.
  const chip = open ? "support" : picked === "support" ? "all" : picked;

  if (live) {
    return (
      <div className="mt-4" data-ke="support-desk" data-open="live">
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
        {open && inlineChat ? <LiveSupportChat mode="member" /> : null}
      </div>
    );
  }

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
      {open && inlineChat ? <SupportThread copy={copy} /> : null}
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
  const liveCopy = liveSupportPack(locale);
  const [enabled, setEnabled] = useState(false);
  const [live, setLive] = useState(false);
  const [threads, setThreads] = useState<Array<{ id: string; unread: boolean; preview: string }>>([]);
  const [active, setActive] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    void liveSupportStatus()
      .then((row) => setLive(Boolean(row.enabled)))
      .catch(() => setLive(false));
    void listAdminSupportDesk()
      .then((row) => {
        if (!row.enabled) return;
        setEnabled(true);
        setThreads(row.threads);
      })
      .catch(() => setEnabled(false));
  }, []);

  if (live) {
    return (
      <section className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="admin-support-desk" data-open="live">
        <h3 className="font-display text-xl">{liveCopy.inboxTitle}</h3>
        <p className="mt-1 text-sm text-muted">{liveCopy.inboxLead}</p>
        <Link
          to="/admin-support"
          search={{ thread: undefined }}
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 touch-manipulation hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {liveCopy.inboxTitle}
        </Link>
      </section>
    );
  }

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
