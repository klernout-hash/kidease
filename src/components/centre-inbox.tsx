import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Inbox, Search, X } from "lucide-react";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { InboxDetailRail } from "@/components/inbox-detail-rail";
import { InboxMessageRow } from "@/components/inbox-row";
import { PipelineBadge } from "@/components/pipeline-badge";
import { ThreadComposer, ThreadHeader, ThreadTranscript } from "@/components/thread-chrome";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { providerNavSearch } from "@/lib/desk-nav";
import { inboxSearch } from "@/lib/inbox-view";
import type { CentreInboxThread } from "@/lib/inbox-stages";
import { fillQuickReply, opsQuickReplies } from "@/lib/inbox-quick-replies";
import {
  MESSAGE_FILTERS,
  filterInboxList,
  formatStayDate,
  messageFilterCopyKey,
  parseMessageFilter,
  rowTitle,
  type ConversationDetails,
  type MessageFilter,
} from "@/lib/inbox-thread-ui";
import { listInbox, sendConnectedMessage } from "@/lib/server/inbox";
import { useViewAs } from "@/components/view-as-banner";
import { chatBodyWithoutSmsFooter } from "@/lib/sms-copy";
import { getConversationDetails, setConversationUserState } from "@/lib/server/conversation-state";
import { getThread } from "@/lib/server/family";
import { listLeadRequests } from "@/lib/server/lead-requests";
import { useCopy } from "@/lib/use-copy";
import { confirmAction } from "@/lib/success-confirm";
import { cn } from "@/lib/utils";
import type { LeadRequest } from "@/lib/lead-requests";
import type { Message, TourRequest } from "@/lib/types";

export function CentreInboxDesk({
  selectedId,
  openDetail = false,
}: {
  selectedId?: string;
  openDetail?: boolean;
}) {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const viewing = useViewAs();
  const navigate = useNavigate();
  const [items, setItems] = useState<CentreInboxThread[] | null>(null);
  const [filter, setFilter] = useState<MessageFilter>("all");
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
  const [details, setDetails] = useState<ConversationDetails | null>(null);
  const [stateBusy, setStateBusy] = useState(false);

  const visible = useMemo(
    () => (items ? filterInboxList(items, { filter, query }) : []),
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
    const meta = await getConversationDetails({ data: { conversationId: id } }).catch(() => null);
    setDetails(meta);
  }

  useEffect(() => {
    if (!user?.id) return;
    void loadList().catch(() => setItems([]));
    void listLeadRequests({ data: { desk: "centre" } })
      .then(setLeads)
      .catch(() => setLeads([]));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !selectedId) {
      setMessages([]);
      setTours([]);
      setDetails(null);
      setThreadReady(false);
      return;
    }
    void loadThread(selectedId);
  }, [user?.id, selectedId]);

  useEffect(() => {
    setDetailOpen(openDetail);
  }, [openDetail, selectedId]);

  function refresh() {
    void loadList().catch(() => undefined);
    if (selectedId) void loadThread(selectedId);
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (viewing) {
      setSendError(t("viewAsReadOnly"));
      return;
    }
    if (!selectedId || !body.trim()) return;
    setSendError("");
    try {
      const sent = await sendConnectedMessage({ data: { conversationId: selectedId, body } });
      if (!sent.ok) {
        setSendError(t("threadSendEmpty"));
        return;
      }
      setBody("");
      confirmAction(t, "replySent");
      refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send");
    }
  }

  async function onState(action: "unread" | "star" | "archive") {
    if (!selectedId) return;
    setStateBusy(true);
    try {
      const res = await setConversationUserState({ data: { conversationId: selectedId, action } });
      if (!res.ok) {
        toast.error(t("threadLoadFailed"));
        return;
      }
      setDetails((current) => (current ? { ...current, starred: res.starred, archived: res.archived, markedUnread: res.markedUnread } : current));
      if (action === "unread") toast.success(t("inboxMarkedUnread"));
      if (action === "star") toast.success(res.starred ? t("inboxStarred") : t("inboxUnstarred"));
      if (action === "archive") toast.success(res.archived ? t("inboxArchived") : t("inboxUnarchived"));
      void loadList().catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("threadLoadFailed"));
    } finally {
      setStateBusy(false);
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
  const viewer = user;

  const emptyAll = items !== null && items.length === 0;
  const emptyFilter = items !== null && items.length > 0 && visible.length === 0;
  const confirmedTour = tour?.status === "accepted";

  const listPane = (
    <div className="flex min-h-0 flex-col border-border lg:border-r">
      <div className="shrink-0 space-y-3 p-3">
        <h2 className="font-display text-[clamp(1.6rem,4vw,2rem)]">{t("messages")}</h2>
        <p className="text-sm text-muted">{t("inboxCentreTitle")}</p>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("inboxSearchPh")}
            className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" data-ke="inbox-stage-filters" role="group" aria-label={t("messages")}>
          {MESSAGE_FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(parseMessageFilter(id))}
              className={cn(
                "min-h-11 whitespace-nowrap rounded-full px-4 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                filter === id ? "bg-fg text-bg" : "bg-surface text-fg ring-1 ring-border",
              )}
            >
              {t(messageFilterCopyKey(id, "centre"))}
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
              {t("inboxNothingInFilter").replace("{filter}", t(messageFilterCopyKey(filter, "centre")))}
            </p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setFilter("all"); setQuery(""); }}>
              {t("inboxClearFilters")}
            </Button>
          </li>
        ) : (
          visible.map((row) => (
            <li key={row.id}>
              <InboxMessageRow row={row} view="centre" selected={selectedId === row.id} />
              <PipelineBadge className="sr-only" tourStatus={row.tourStatus} bookingStatus={row.status} />
            </li>
          ))
        )}
      </ul>
    </div>
  );

  const threadTitle = rowTitle({
    viewerIsParent: false,
    parentName: selected?.parentName,
    centreName: centreName || selected?.centreName,
  });
  const threadDates = formatStayDate(selected?.startDate, locale) || selected?.tourDatetime || "";
  const threadSub = [centreName || selected?.centreName, threadDates].filter(Boolean).join(" · ");
  const cleaned = messages.map((m) => ({ ...m, body: chatBodyWithoutSmsFooter(m.body) }));

  const threadPane = (
    <div className="flex min-h-0 flex-col">
      {selected ? (
        <>
          <ThreadHeader
            backTo="/inbox"
            backSearch={inboxSearch("centre")}
            backLabel={t("inboxBackCentre")}
            title={threadTitle || selected.parentName}
            subtitle={threadSub}
            avatars={(details?.participants || [{ id: "parent", name: selected.parentName, image: null, role: "parent" as const }]).map((person) => ({
              name: person.name,
              image: person.image,
            }))}
            showDetails={false}
            actions={
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  className="min-h-11 rounded-full px-3 text-sm font-medium ring-1 ring-border lg:hidden"
                  data-ke="inbox-detail-open"
                  onClick={() => setDetailOpen(true)}
                >
                  {t("inboxDetail")}
                </button>
              </div>
            }
          />
          {confirmedTour ? (
            <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
              <span className="font-medium">{t("inboxTourConfirmedBanner")}</span>
              <Link to="/provider" search={{ desk: "tours" }} className="underline">
                {t("inboxShowTour")}
              </Link>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {!threadReady ? (
              <div className="ke-skel h-20 rounded-xl" aria-hidden />
            ) : cleaned.filter((m) => m.body).length === 0 ? (
              <p className="text-sm text-muted">{t("inboxNoMessagesYet")}</p>
            ) : (
              <ThreadTranscript
                messages={cleaned}
                viewerRole="centre"
                viewerId={viewer.id}
                parentName={selected.parentName}
                centreName={centreName || selected.centreName || selected.daycareName}
                reads={details?.reads || []}
              />
            )}
          </div>
          {viewing ? (
            <p className="border-t border-border px-3 py-3 text-sm text-muted" role="status" data-ke="view-as-lock">
              {t("viewAsReadOnly")}
            </p>
          ) : canWrite ? (
            <ThreadComposer
              inputId="centre-thread-reply"
              value={body}
              onChange={setBody}
              onSubmit={onSend}
              error={sendError}
              placeholder={t("writeMessage")}
              plusLabel={t("inboxQuickReplies")}
              sendLabel={t("send")}
              plusOpen={quickOpen}
              onPlus={() => setQuickOpen((v) => !v)}
              menu={
                <div className="mb-2 rounded-xl bg-surface p-2 ring-1 ring-border">
                  <p className="px-3 py-2 text-sm text-muted">{t("inboxAttachSoon")}</p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {templates.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => insertQuick(row.id)}
                          className="min-h-11 w-full rounded-lg px-3 py-2 text-left hover:bg-bg"
                        >
                          <p className="text-sm font-medium">{row.title}</p>
                          <p className="text-[11px] text-subtle">{row.meta}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              }
            />
          ) : (
            <p className="px-4 py-3 text-sm text-muted">{t("threadReadOnly")}</p>
          )}
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

  function detailPane() {
    if (!selected) {
      return <div className="hidden p-4 text-sm text-muted lg:block">{t("inboxSelectThreadLead")}</div>;
    }
    return (
      <InboxDetailRail
        thread={selected}
        tour={tour}
        leads={leads}
        centreName={centreName || selected.centreName || selected.daycareName}
        canWrite={canWrite}
        onChanged={refresh}
        details={details}
                viewerId={viewer.id}
        stateBusy={stateBusy}
        onMarkUnread={() => void onState("unread")}
        onToggleStar={() => void onState("star")}
        onToggleArchive={() => void onState("archive")}
      />
    );
  }

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
        className="grid min-h-[70dvh] overflow-hidden rounded-xl bg-surface ring-1 ring-border md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)_minmax(15rem,18rem)]"
      >
        <div className={cn(selectedId ? "hidden md:flex md:flex-col" : "flex flex-col")}>{listPane}</div>
        <div className={cn(!selectedId ? "hidden md:flex md:flex-col" : "flex flex-col")}>{threadPane}</div>
        <div className="hidden border-l border-border xl:block">{detailPane()}</div>
      </div>
      {detailOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center xl:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("inboxDetailClose")} onClick={() => setDetailOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("inboxDetail")}
            className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl bg-surface shadow-card ring-1 ring-border md:max-h-[min(40rem,85dvh)] md:max-w-lg md:rounded-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-medium">{t("inboxDetail")}</p>
              <Button size="icon" variant="ghost" onClick={() => setDetailOpen(false)} aria-label={t("inboxDetailClose")}>
                <X className="size-5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {detailPane()}
            </div>
          </div>
        </div>
      ) : null}
    </DeskShell>
  );
}
