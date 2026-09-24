import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Inbox, Paperclip, Search, X } from "lucide-react";
import { DeskShell } from "@/components/desk-shell";
import { InboxDetailRail } from "@/components/inbox-detail-rail";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { providerNavSearch } from "@/lib/desk-nav";
import { inboxSearch } from "@/lib/inbox-view";
import {
  filterCentreThreads,
  INBOX_FILTERS,
  INBOX_FILTER_COPY,
  inboxInitials,
  parseInboxFilter,
  type CentreInboxThread,
  type InboxFilter,
} from "@/lib/inbox-stages";
import { fillQuickReply, opsQuickReplies } from "@/lib/inbox-quick-replies";
import { listInbox, markInboxThreadRead, sendConnectedMessage } from "@/lib/server/inbox";
import { getThread } from "@/lib/server/family";
import { listLeadRequests } from "@/lib/server/lead-requests";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { confirmAction } from "@/lib/success-confirm";
import { cn } from "@/lib/utils";
import type { LeadRequest } from "@/lib/lead-requests";
import type { Message, TourRequest } from "@/lib/types";

function rowDate(iso: string, locale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric" });
}

export function CentreInboxDesk({
  selectedId,
  openDetail = false,
}: {
  selectedId?: string;
  openDetail?: boolean;
}) {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const [items, setItems] = useState<CentreInboxThread[] | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tours, setTours] = useState<TourRequest[]>([]);
  const [canWrite, setCanWrite] = useState(true);
  const [centreName, setCentreName] = useState("");
  const [leads, setLeads] = useState<LeadRequest[]>([]);
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(openDetail);
  const [threadReady, setThreadReady] = useState(false);

  const visible = useMemo(
    () => (items ? filterCentreThreads(items, { filter, query }) : []),
    [items, filter, query],
  );
  const selected = visible.find((row) => row.id === selectedId) ?? items?.find((row) => row.id === selectedId) ?? null;
  const tour = tours[0] ?? null;
  const templates = opsQuickReplies();

  async function loadList() {
    const rows = (await listInbox({ data: { view: "centre" } })) as CentreInboxThread[];
    setItems(rows);
  }

  async function loadThread(id: string) {
    setThreadReady(false);
    const res = await getThread({ data: { conversationId: id, markRead: false } });
    if (!res) {
      setMessages([]);
      setTours([]);
      setThreadReady(true);
      return;
    }
    setCentreName(res.daycareName);
    setMessages(res.messages);
    setTours(res.tours ?? []);
    setCanWrite(res.canWrite !== false);
    setThreadReady(true);
  }

  useEffect(() => {
    if (!user) return;
    void loadList().catch(() => setItems([]));
    void listLeadRequests({ data: { desk: "centre" } })
      .then(setLeads)
      .catch(() => setLeads([]));
  }, [user]);

  useEffect(() => {
    if (!user || !selectedId) {
      setMessages([]);
      setTours([]);
      setThreadReady(false);
      return;
    }
    void loadThread(selectedId);
  }, [user, selectedId]);

  useEffect(() => {
    setDetailOpen(openDetail);
  }, [openDetail, selectedId]);

  function refresh() {
    void loadList().catch(() => undefined);
    if (selectedId) void loadThread(selectedId);
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !body.trim()) return;
    setSendError("");
    try {
      await sendConnectedMessage({ data: { conversationId: selectedId, body } });
      setBody("");
      confirmAction(t, "replySent");
      refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send");
    }
  }

  function insertQuick(id: string) {
    const template = templates.find((row) => row.id === id);
    if (!template || !selected) return;
    setBody(
      fillQuickReply(template.body, {
        parent_name: selected.parentName,
        child_age: selected.childAgeLabel,
        tour_datetime: selected.tourDatetime,
        centre_name: centreName || selected.daycareName,
      }),
    );
    setQuickOpen(false);
  }

  if (isPending) {
    return (
      <DeskShell desk="daycare" active="messages" onSelect={(id) => void navigate({ to: "/provider", search: providerNavSearch(id) })}>
        <div className="space-y-3" aria-hidden>
          <div className="ke-skel h-12 w-full rounded-xl" />
          <div className="ke-skel h-24 w-full rounded-xl" />
        </div>
      </DeskShell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const emptyAll = items !== null && items.length === 0;
  const emptyFilter = items !== null && items.length > 0 && visible.length === 0;
  const confirmedTour = tour?.status === "accepted";

  const listPane = (
    <div className="flex min-h-0 flex-col border-border lg:border-r">
      <div className="shrink-0 space-y-3 p-3">
        <h2 className="font-display text-2xl">{t("inboxCentreTitle")}</h2>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("inboxSearchPh")}
            className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" data-ke="inbox-stage-filters">
          {INBOX_FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(parseInboxFilter(id))}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1",
                filter === id ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-muted ring-border",
              )}
            >
              {t(INBOX_FILTER_COPY[id] as CopyKey)}
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items === null ? (
          <li className="space-y-2 p-3" aria-hidden>
            <div className="ke-skel h-16 rounded-xl" />
            <div className="ke-skel h-16 rounded-xl" />
          </li>
        ) : emptyAll ? (
          <li className="p-4">
            <div className="flex items-start gap-3 rounded-xl bg-surface p-4 ring-1 ring-border">
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Inbox className="size-5" strokeWidth={1.8} />
              </span>
              <div>
                <p className="font-medium">{t("inboxEmptyNeedYou")}</p>
                <p className="mt-1 text-sm text-muted">{t("inboxEmptyNeedYouLead")}</p>
                <Button size="sm" className="mt-3" asChild>
                  <Link to="/inbox" search={inboxSearch("centre")} data-ke="inbox-empty-cta">
                    {t("inboxEmptyNeedYouCta")}
                  </Link>
                </Button>
              </div>
            </div>
          </li>
        ) : emptyFilter ? (
          <li className="p-4">
            <p className="font-medium">
              {t("inboxNothingInFilter").replace("{filter}", t(INBOX_FILTER_COPY[filter] as CopyKey))}
            </p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setFilter("all"); setQuery(""); }}>
              {t("inboxClearFilters")}
            </Button>
          </li>
        ) : (
          visible.map((row) => (
            <li key={row.id}>
              <Link
                to="/inbox/$id"
                params={{ id: row.id }}
                search={inboxSearch("centre")}
                className={cn(
                  "flex items-start gap-3 px-3 py-3 hover:bg-bg",
                  selectedId === row.id && "bg-bg",
                )}
              >
                {row.photo ? (
                  <img src={row.photo} alt="" className="size-10 rounded-md object-cover" />
                ) : (
                  <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                    {inboxInitials(row.parentName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{row.parentName}</p>
                    {row.unread ? <span className="size-2 shrink-0 rounded-full bg-danger" aria-label={t("inboxFilterUnread")} /> : null}
                    {row.confirmedDot ? (
                      <span className="size-2 shrink-0 rounded-full bg-ok" aria-label={t("inboxConfirmedDot")} />
                    ) : null}
                    <span className="ml-auto shrink-0 text-[11px] text-subtle">{rowDate(row.lastAt, locale)}</span>
                  </div>
                  <p className="truncate text-sm text-muted">{row.preview}</p>
                  <span className="mt-1 inline-flex rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium ring-1 ring-border">
                    {t(INBOX_FILTER_COPY[row.stage] as CopyKey)}
                  </span>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );

  const threadPane = (
    <div className="flex min-h-0 flex-col">
      {selected ? (
        <>
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Link to="/inbox" search={inboxSearch("centre")} className="text-sm text-muted lg:hidden">
                {t("inboxBackCentre")}
              </Link>
              <h3 className="truncate font-display text-xl">{selected.parentName}</h3>
              {confirmedTour ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
                  <span className="font-medium">{t("inboxTourConfirmedBanner")}</span>
                  <Link to="/provider" search={{ desk: "tours" }} className="underline">
                    {t("inboxShowTour")}
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              {selected.unread ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void markInboxThreadRead({ data: { conversationId: selected.id } }).then(refresh);
                  }}
                >
                  {t("inboxMarkRead")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                className="lg:hidden"
                data-ke="inbox-detail-open"
                onClick={() => setDetailOpen(true)}
              >
                {t("inboxDetail")}
              </Button>
            </div>
          </div>
          <ul className="ph-no-capture min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {!threadReady ? (
              <li className="ke-skel h-20 rounded-xl" aria-hidden />
            ) : (
              messages
                .filter((m) => m.kind === "status" || (m.kind !== "system" && m.kind !== "notify" && m.sender !== "system"))
                .map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm",
                      m.kind === "status"
                        ? "w-full max-w-none bg-surface-2"
                        : m.sender === "provider"
                          ? "ml-auto bg-primary text-primary-fg"
                          : "bg-surface ring-1 ring-border",
                    )}
                  >
                    {m.body}
                  </li>
                ))
            )}
          </ul>
          {canWrite ? (
            <form onSubmit={onSend} className="sticky bottom-0 space-y-2 border-t border-border bg-bg px-4 py-3">
              {sendError ? <p className="text-sm text-danger">{sendError}</p> : null}
              {quickOpen ? (
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-surface p-2 ring-1 ring-border">
                  {templates.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => insertQuick(row.id)}
                        className="w-full rounded-lg px-3 py-2 text-left hover:bg-bg"
                      >
                        <p className="text-sm font-medium">{row.title}</p>
                        <p className="text-[11px] text-subtle">{row.meta}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled
                  title={t("inboxAttachSoon")}
                  aria-label={t("inboxAttachSoon")}
                >
                  <Paperclip className="size-5" />
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setQuickOpen((v) => !v)}>
                  {t("inboxQuickReplies")}
                </Button>
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t("writeMessage")}
                  className="h-12 flex-1 rounded-md border border-border bg-surface px-3"
                />
                <Button type="submit">{t("send")}</Button>
              </div>
            </form>
          ) : null}
        </>
      ) : (
        <div className="flex flex-1 items-start p-6">
          <div>
            <p className="font-display text-xl">{t("inboxSelectThread")}</p>
            <p className="mt-1 text-sm text-muted">{t("inboxSelectThreadLead")}</p>
          </div>
        </div>
      )}
    </div>
  );

  const detail = selected ? (
    <InboxDetailRail
      thread={selected}
      tour={tour}
      leads={leads}
      centreName={centreName || selected.daycareName}
      canWrite={canWrite}
      onChanged={refresh}
    />
  ) : (
    <div className="hidden p-4 text-sm text-muted lg:block">{t("inboxSelectThreadLead")}</div>
  );

  return (
    <DeskShell
      desk="daycare"
      active="messages"
      wide
      onSelect={(id) => {
        if (id === "messages") return;
        void navigate({ to: "/provider", search: providerNavSearch(id) });
      }}
    >
      <div
        data-ke="centre-inbox"
        className="grid min-h-[70dvh] overflow-hidden rounded-xl bg-surface ring-1 ring-border lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)_minmax(16rem,20rem)]"
      >
        <div className={cn(selectedId ? "hidden lg:flex lg:flex-col" : "flex flex-col")}>{listPane}</div>
        <div className={cn(!selectedId ? "hidden lg:flex lg:flex-col" : "flex flex-col")}>{threadPane}</div>
        <div className="hidden border-l border-border lg:block">{detail}</div>
      </div>
      {detailOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("inboxDetailClose")} onClick={() => setDetailOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("inboxDetail")}
            className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-surface shadow-card ring-1 ring-border"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-medium">{t("inboxDetail")}</p>
              <Button size="icon" variant="ghost" onClick={() => setDetailOpen(false)} aria-label={t("inboxDetailClose")}>
                <X className="size-5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {detail}
            </div>
          </div>
        </div>
      ) : null}
    </DeskShell>
  );
}
