import type { ReactNode } from "react";
import { ArrowUp, Plus } from "lucide-react";
import { HistoryBack } from "@/components/history-back";
import { historyHref } from "@/lib/screen-history";
import { messageReceipt } from "@/lib/engagement";
import { chatBodyWithoutSmsFooter } from "@/lib/sms-copy";
import {
  joinNames,
  messageClock,
  messageDayLabel,
  participantInitials,
  readByNames,
  type InboxRead,
} from "@/lib/inbox-thread-ui";
import type { Message } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

function showChatBubble(m: Message) {
  return m.kind === "status" || (m.kind !== "system" && m.kind !== "notify" && m.sender !== "system");
}

function peerFor(sender: Message["sender"], peers: Array<{ name: string; image?: string | null; role?: string }>) {
  const role = sender === "parent" ? "parent" : "owner";
  return peers.find((person) => person.role === role) || peers.find((person) => person.role !== "parent");
}

function PersonFace({ name, image, large = false }: { name: string; image?: string | null; large?: boolean }) {
  const box = large ? "size-10 text-xs" : "size-8 text-[11px]";
  const px = large ? 40 : 32;
  if (image) {
    return <img src={image} alt="" width={px} height={px} className={cn(box, "shrink-0 rounded-full object-cover")} />;
  }
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-fg", box)} aria-hidden>
      {participantInitials(name)}
    </span>
  );
}

function mineOf(viewerRole: string, sender: Message["sender"]) {
  if (viewerRole === "parent") return sender === "parent";
  if (viewerRole === "centre") return sender === "provider";
  return false;
}

export function ThreadTranscript({
  messages,
  viewerRole,
  viewerId,
  parentName,
  centreName,
  reads,
  peers = [],
  now = new Date(),
}: {
  messages: Message[];
  viewerRole: string;
  viewerId: string;
  parentName: string;
  centreName: string;
  reads: InboxRead[];
  peers?: Array<{ name: string; image?: string | null; role?: string }>;
  now?: Date;
}) {
  const { t, locale } = useCopy();
  const visible = messages
    .filter(showChatBubble)
    .map((m) => ({ ...m, body: chatBodyWithoutSmsFooter(m.body) }))
    .filter((m) => m.body);
  const lastOwn = [...visible].reverse().find((m) => mineOf(viewerRole, m.sender) && m.kind !== "status");
  let lastDay = "";

  return (
    <ul className="ph-no-capture flex flex-col gap-3" aria-live="polite">
      {visible.map((m) => {
        const day = messageDayLabel(m.createdAt, now, locale);
        const dayKey = `${day.today}-${day.yesterday}-${day.text}`;
        const showDay = dayKey !== lastDay;
        lastDay = dayKey;
        const mine = mineOf(viewerRole, m.sender);
        const senderName = m.sender === "parent" ? parentName : centreName;
        const peer = peerFor(m.sender, peers);
        const readers = lastOwn && m.id === lastOwn.id ? readByNames(reads, m.createdAt, viewerId) : [];
        return (
          <li key={m.id} className="contents">
            {showDay && (day.today || day.yesterday || day.text) ? (
              <p className="py-2 text-center text-xs font-medium text-subtle">
                {day.today ? t("inboxDayToday") : day.yesterday ? t("inboxDayYesterday") : day.text}
              </p>
            ) : null}
            {m.kind === "status" ? (
              <p className="mx-auto max-w-md rounded-full bg-surface-2 px-3 py-1 text-center text-xs text-muted">{m.body}</p>
            ) : (
              <div className={cn("flex max-w-[85%] items-end gap-2", mine ? "self-end flex-row-reverse" : "self-start")}>
                {mine ? null : <PersonFace name={peer?.name || senderName} image={peer?.image} />}
                <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start")}>
                {messageClock(m.createdAt, locale) ? (
                  <p className={cn("mb-1 px-1 text-xs text-muted", mine && "text-right")}>
                    {!mine ? <span className="font-medium text-fg">{senderName}</span> : null}
                    {!mine ? ` · ${messageClock(m.createdAt, locale)}` : messageClock(m.createdAt, locale)}
                  </p>
                ) : null}
                <p
                  className={cn(
                    "whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-snug",
                    mine ? "rounded-br-md bg-fg text-bg" : "rounded-bl-md bg-surface text-fg ring-1 ring-border",
                  )}
                >
                  {m.body}
                </p>
                {readers.length ? (
                  <p className="mt-1 px-1 text-xs text-subtle" data-ke="inbox-seen">
                    {t("inboxSeenHere")}
                    {" · "}
                    {t("inboxReadBy").replace("{names}", joinNames(readers, t("inboxAnd")))}
                  </p>
                ) : mine && lastOwn && m.id === lastOwn.id ? (
                  <p className="mt-1 px-1 text-xs text-subtle" data-ke="inbox-not-phoned">
                    {t(messageReceipt({ seenInApp: false }).label === "saved_not_phoned" ? "inboxPhoneNotSent" : "inboxSeenHere")}
                  </p>
                ) : null}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ThreadHeader({
  backTo,
  backSearch,
  backLabel,
  title,
  subtitle,
  avatars,
  onDetails,
  showDetails = true,
  bare = false,
}: {
  backTo: "/inbox";
  backSearch?: Record<string, string>;
  backLabel: string;
  title: string;
  subtitle: string;
  avatars: Array<{ name: string; image?: string | null }>;
  onDetails?: () => void;
  showDetails?: boolean;
  bare?: boolean;
}) {
  const { t } = useCopy();
  const face = avatars.find((item) => item.image) || avatars[0];
  return (
    <header className={cn("flex min-w-0 items-center gap-1 px-1 py-1", bare ? "" : "border-b border-border")} data-ke="thread-header">
      <HistoryBack
        fallbackHref={historyHref(backTo, backSearch)}
        fallbackLabel={t("back")}
        fallbackAria={backLabel}
        marker="thread-back"
        className="max-w-11 min-w-11 justify-center px-0 [&>span]:sr-only"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {face ? <PersonFace name={face.name} image={face.image} large /> : null}
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-[15px] font-semibold leading-5">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {showDetails && onDetails ? (
        <button
          type="button"
          onClick={onDetails}
          data-ke="inbox-detail-open"
          className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
        >
          {t("inboxDetail")}
        </button>
      ) : null}
    </header>
  );
}

export function ThreadComposer({
  inputId,
  value,
  onChange,
  onSubmit,
  error,
  placeholder,
  plusLabel,
  sendLabel,
  plusOpen,
  onPlus,
  menu,
}: {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  error?: string;
  placeholder: string;
  plusLabel: string;
  sendLabel: string;
  plusOpen: boolean;
  onPlus: () => void;
  menu?: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} data-ke="thread-composer" className="sticky bottom-0 z-20 border-t border-border/60 bg-bg/95 backdrop-blur px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {error ? (
        <p className="mb-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {plusOpen ? menu : null}
      <div className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-1 ring-1 ring-border">
        <button
          type="button"
          onClick={onPlus}
          aria-expanded={plusOpen}
          aria-label={plusLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Plus className="size-5" aria-hidden />
        </button>
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <button
          type="submit"
          aria-label={sendLabel}
          disabled={!value.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fg text-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
        >
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </div>
    </form>
  );
}
