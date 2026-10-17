import type { ReactNode } from "react";
import { ArrowUp, ChevronLeft, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
  now = new Date(),
}: {
  messages: Message[];
  viewerRole: string;
  viewerId: string;
  parentName: string;
  centreName: string;
  reads: InboxRead[];
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
              <div className={cn("flex max-w-[85%] flex-col", mine ? "self-end items-end" : "self-start items-start")}>
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
                  <p className="mt-1 px-1 text-xs text-subtle">
                    {t("inboxReadBy").replace("{names}", joinNames(readers, t("inboxAnd")))}
                  </p>
                ) : null}
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
  actions,
  showDetails = true,
}: {
  backTo: "/inbox";
  backSearch?: Record<string, string>;
  backLabel: string;
  title: string;
  subtitle: string;
  avatars: Array<{ name: string; image?: string | null }>;
  onDetails?: () => void;
  actions?: ReactNode;
  showDetails?: boolean;
}) {
  const { t } = useCopy();
  const faces = avatars.slice(0, 3);
  return (
    <header className="flex items-center gap-2 border-b border-border px-2 py-2">
      <Link
        to={backTo}
        search={backSearch}
        aria-label={backLabel}
        className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex shrink-0 -space-x-2" aria-hidden>
          {faces.map((face) =>
            face.image ? (
              <img key={face.name} src={face.image} alt="" className="size-9 rounded-full object-cover ring-2 ring-surface" />
            ) : (
              <span
                key={face.name}
                className="grid size-9 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary ring-2 ring-surface"
              >
                {participantInitials(face.name)}
              </span>
            ),
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions}
      {showDetails && onDetails ? (
        <button
          type="button"
          onClick={onDetails}
          data-ke="inbox-detail-open"
          className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium ring-1 ring-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
    <form onSubmit={onSubmit} className="sticky bottom-0 bg-bg px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
