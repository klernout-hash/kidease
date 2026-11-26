import { useEffect, useState, type FormEvent } from "react";
import { ThreadComposer, ThreadTranscript } from "@/components/thread-chrome";
import {
  liveSupportPack,
  mergeSupportOutbox,
  newSupportIdempotencyKey,
  outboxAfterSend,
  supportRoleText,
  supportRowsToMessages,
  type SupportActor,
  type SupportOutboxItem,
} from "@/lib/live-support";
import { loadLiveSupport, sendLiveSupport, type LiveSupportDetail, type LiveSupportMessage } from "@/lib/server/live-support";
import { MIN_POLL_MS, pollBackoffMs } from "@/lib/fn-query";
import type { InboxRead } from "@/lib/inbox-thread-ui";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

type LoadOk = {
  enabled: true;
  ok: true;
  threadId: string | null;
  messages: LiveSupportMessage[];
  reads: InboxRead[];
  detail: LiveSupportDetail;
  viewerId: string;
  staff: boolean;
};

export function LiveSupportChat({
  mode,
  threadId = "",
}: {
  mode: SupportActor;
  threadId?: string;
}) {
  const { locale } = useCopy();
  const copy = liveSupportPack(locale);
  const [messages, setMessages] = useState<LiveSupportMessage[]>([]);
  const [reads, setReads] = useState<InboxRead[]>([]);
  const [detail, setDetail] = useState<LiveSupportDetail | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [openId, setOpenId] = useState(threadId);
  const [text, setText] = useState("");
  const [reference, setReference] = useState("");
  const [outbox, setOutbox] = useState<SupportOutboxItem[]>([]);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setOpenId(threadId);
  }, [threadId]);

  useEffect(() => {
    if (mode === "staff" && !threadId) return;
    let cancelled = false;
    let timer = 0;
    let failures = 0;

    const arm = (delay: number) => {
      timer = window.setTimeout(() => {
        void run();
      }, delay);
    };

    const run = async () => {
      if (cancelled) return;
      if (document.hidden) {
        arm(MIN_POLL_MS);
        return;
      }
      try {
        const row = await loadLiveSupport({ data: { threadId: mode === "staff" ? threadId : "" } });
        if (cancelled) return;
        if (!row.enabled || !("ok" in row) || !row.ok) {
          setMissing(true);
          failures = 0;
        } else {
          const loaded = row as LoadOk;
          setMissing(false);
          setMessages(loaded.messages);
          setReads(loaded.reads);
          setDetail(loaded.detail);
          setViewerId(loaded.viewerId);
          setOpenId(loaded.threadId || "");
          failures = 0;
        }
      } catch {
        failures += 1;
      }
      if (!cancelled) arm(failures > 0 ? pollBackoffMs(failures) : MIN_POLL_MS);
    };

    void run();
    const onVis = () => {
      if (document.hidden || cancelled) return;
      window.clearTimeout(timer);
      failures = 0;
      void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mode, threadId]);

  async function deliver(item: SupportOutboxItem) {
    setOutbox((current) => {
      const rest = current.filter((row) => row.key !== item.key);
      return [...rest, { ...item, state: "sending" }];
    });
    setError("");
    try {
      const row = await sendLiveSupport({
        data: {
          body: item.body,
          idempotencyKey: item.key,
          reference,
          threadId: mode === "staff" ? openId || threadId : "",
          as: mode,
        },
      });
      if (!row.enabled || !("ok" in row) || !row.ok) {
        const limited = "reason" in row && row.reason === "limited";
        setError(limited ? copy.limited : copy.failed);
        setOutbox((current) => outboxAfterSend(current, item.key, false));
        return;
      }
      setOutbox((current) => outboxAfterSend(current, item.key, true));
      if (row.threadId) setOpenId(row.threadId);
      const fresh = await loadLiveSupport({ data: { threadId: mode === "staff" ? row.threadId : "" } });
      if (fresh.enabled && "ok" in fresh && fresh.ok) {
        setMessages(fresh.messages);
        setReads(fresh.reads);
        setDetail(fresh.detail);
      }
    } catch {
      setError(copy.failed);
      setOutbox((current) => outboxAfterSend(current, item.key, false));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    const item: SupportOutboxItem = {
      key: newSupportIdempotencyKey(),
      body,
      createdAt: new Date().toISOString(),
      state: "sending",
    };
    setText("");
    void deliver(item);
  }

  if (mode === "staff" && !threadId) {
    return <p className="text-sm text-muted">{copy.choose}</p>;
  }
  if (missing) {
    return <p className="text-sm text-muted">{copy.inboxEmpty}</p>;
  }

  const transcript = mergeSupportOutbox(supportRowsToMessages(messages), outbox, mode);
  const namedReads = reads.map((read) => ({
    ...read,
    name: detail && read.userId === detail.userId ? read.name || detail.name : copy.supportName,
  }));
  const parentName = detail?.name || copy.name;
  const failed = outbox.filter((item) => item.state === "failed");

  return (
    <section className="@container mt-3 rounded-xl bg-surface ring-1 ring-border" data-ke="live-support" aria-label={copy.title}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="font-display text-xl">{copy.title}</h3>
          <p className="mt-1 text-sm text-muted">{copy.lead}</p>
        </div>
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 @3xl:hidden"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {copy.details}
        </button>
      </div>
      {/* Container width, not viewport: in a narrow column the 16rem aside left the chat 0px wide. */}
      <div className="grid gap-3 p-3 @3xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <div className="max-h-[min(32rem,60dvh)] overflow-y-auto px-1">
            {transcript.length === 0 ? <p className="px-1 text-sm text-muted">{copy.empty}</p> : null}
            <ThreadTranscript
              messages={transcript}
              viewerRole={mode === "staff" ? "centre" : "parent"}
              viewerId={viewerId}
              parentName={parentName}
              centreName={copy.supportName}
              reads={namedReads}
              peers={[
                { id: detail?.userId, name: parentName, role: "parent" },
                { name: copy.supportName, role: "owner" },
              ]}
            />
          </div>
          {failed.map((item) => (
            <div key={item.key} className="mt-2 rounded-xl bg-bg px-3 py-2 ring-1 ring-border" role="alert">
              <p className="text-sm">{item.body}</p>
              <p className="mt-1 text-sm text-danger">{copy.failed}</p>
              <button
                type="button"
                className="mt-1 min-h-11 rounded-full px-3 text-sm font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => void deliver(item)}
              >
                {copy.retry}
              </button>
            </div>
          ))}
          {mode === "member" ? (
            <label className="mt-2 block text-sm">
              <span className="text-muted">{copy.reference}</span>
              <span className="mt-0.5 block text-xs text-subtle">{copy.referenceHint}</span>
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="KE-0000-0000"
                autoComplete="off"
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-bg px-3 font-mono"
              />
            </label>
          ) : null}
          <ThreadComposer
            inputId={mode === "staff" ? "live-support-staff" : "live-support-member"}
            value={text}
            onChange={setText}
            onSubmit={onSubmit}
            error={error}
            placeholder={copy.placeholder}
            plusLabel={copy.details}
            sendLabel={copy.send}
            plusOpen={false}
            onPlus={() => setDetailsOpen((open) => !open)}
          />
        </div>
        <aside className={cn("rounded-xl bg-bg p-3 ring-1 ring-border", detailsOpen ? "block" : "hidden @3xl:block")} data-ke="live-support-details">
          <h4 className="text-sm font-semibold">{copy.details}</h4>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted">{copy.name}</dt>
              <dd>{detail?.name || copy.none}</dd>
            </div>
            <div>
              <dt className="text-muted">{copy.role}</dt>
              <dd>{detail ? supportRoleText(detail.role, locale === "fr" ? "fr" : "en") : copy.none}</dd>
            </div>
            <div>
              <dt className="text-muted">{copy.centre}</dt>
              <dd>{detail?.centres.length ? detail.centres.join(", ") : copy.none}</dd>
            </div>
            <div>
              <dt className="text-muted">{copy.children}</dt>
              <dd>{detail?.children.length ? detail.children.join(", ") : copy.none}</dd>
            </div>
            <div>
              <dt className="text-muted">{copy.reference}</dt>
              <dd className="font-mono">{detail?.reference || copy.none}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
