import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk-shell";
import { LiveSupportChat } from "@/components/live-support-chat";
import { liveSupportPack, supportRoleText } from "@/lib/live-support";
import { listLiveSupportInbox, liveSupportStatus } from "@/lib/server/live-support";
import { MIN_POLL_MS } from "@/lib/fn-query";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

type ThreadCard = {
  id: string;
  name: string;
  role: string;
  unread: number;
  preview: string;
  reference: string | null;
};

export function AdminSupportInbox({ initialThread = "" }: { initialThread?: string }) {
  const { locale } = useCopy();
  const copy = liveSupportPack(locale);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [threads, setThreads] = useState<ThreadCard[]>([]);
  const [active, setActive] = useState(initialThread);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    setActive(initialThread);
  }, [initialThread]);

  useEffect(() => {
    if (!enabled || !active) return;
    const timer = window.setTimeout(() => {
      void listLiveSupportInbox().then((list) => {
        if (list.enabled && "ok" in list && list.ok) setThreads(list.threads);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [active, enabled]);

  useEffect(() => {
    let stop = false;
    let timer = 0;

    const load = () => {
      void liveSupportStatus()
        .then((row) => {
          if (stop) return;
          setEnabled(row.enabled);
          if (!row.enabled) return;
          return listLiveSupportInbox().then((list) => {
            if (stop) return;
            if (!list.enabled || !("ok" in list) || !list.ok) {
              setForbidden(true);
              return;
            }
            setForbidden(false);
            setThreads(list.threads);
            setActive((current) => current || list.threads[0]?.id || "");
          });
        })
        .catch(() => {
          if (!stop) setEnabled(false);
        });
    };

    load();
    timer = window.setInterval(load, MIN_POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  const body = (
    <section data-ke="admin-support-inbox">
      <h2 className="font-display text-[clamp(1.6rem,4vw,2rem)]">{copy.inboxTitle}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">{copy.inboxLead}</p>
      {enabled === false ? <p className="mt-4 text-sm text-muted">{copy.off}</p> : null}
      {forbidden ? <p className="mt-4 text-sm text-muted">{copy.off}</p> : null}
      {enabled && !forbidden ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <ul className="space-y-2" aria-label={copy.inboxTitle}>
            {threads.length === 0 ? <li className="text-sm text-muted">{copy.inboxEmpty}</li> : null}
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  aria-pressed={active === thread.id}
                  onClick={() => setActive(thread.id)}
                  className={cn(
                    "min-h-11 w-full rounded-xl px-3 py-2 text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    active === thread.id ? "bg-fg text-bg" : "bg-surface text-fg ring-1 ring-border",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{thread.name}</span>
                    {thread.unread > 0 ? (
                      <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-bg">
                        {thread.unread} {copy.unread}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn("mt-0.5 block truncate text-xs", active === thread.id ? "text-bg/80" : "text-muted")}>
                    {supportRoleText(thread.role as "Parent" | "Daycare" | "Staff", locale === "fr" ? "fr" : "en")}
                    {thread.reference ? ` · ${thread.reference}` : ""}
                    {thread.preview ? ` · ${thread.preview}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <LiveSupportChat mode="staff" threadId={active} />
        </div>
      ) : null}
      <p className="mt-6">
        <Link to="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {copy.back}
        </Link>
      </p>
    </section>
  );

  return (
    <DeskShell
      desk="admin"
      active="support-inbox"
      onSelect={(id) => {
        if (id !== "support-inbox" && typeof window !== "undefined") window.location.assign("/admin");
      }}
    >
      {enabled === null ? <p className="text-sm text-muted">{copy.inboxTitle}</p> : body}
    </DeskShell>
  );
}
