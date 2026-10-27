import { createFileRoute, Link } from "@tanstack/react-router";
import { inboxSearch, parseInboxSearch, resolveInboxView } from "@/lib/inbox-view";
import { Phone, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PipelineBadge } from "@/components/pipeline-badge";
import { ConversationDetailsBody } from "@/components/conversation-details";
import { ThreadComposer, ThreadHeader, ThreadTranscript } from "@/components/thread-chrome";
import { BlockMessagesButton, SafetyReportButton } from "@/components/safety-actions";
import { safetyText } from "@/lib/safety";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ChildCareCard } from "@/components/child-care-card";
import { getFamily, getThread, updateRequestStatus } from "@/lib/server/family";
import { listParentBills } from "@/lib/server/billing";
import { billDollars, billIsOpen, type Bill } from "@/lib/bill";
import { sendConnectedMessage } from "@/lib/server/inbox";
import { getConversationDetails, setConversationUserState } from "@/lib/server/conversation-state";
import type { ConversationDetails } from "@/lib/inbox-thread-ui";
import { formatStayDate, rowTitle } from "@/lib/inbox-thread-ui";
import { chatBodyWithoutSmsFooter } from "@/lib/sms-copy";
import { draftInboxReply } from "@/lib/server/reply-drafts";
import { AI_FLAGS } from "@/lib/ai/flags";
import { replyDraftEventProps, replyDraftQuiet } from "@/lib/ai/reply-drafts";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { capturePostHogEvent } from "@/lib/posthog";
import { parentWaitlistStatus, waitlistEventProps } from "@/lib/waitlist-tracker";
import { formatAgeLabel, formatStart, pushNewRequest, scheduleLabel } from "@/lib/templates";
import { useCopy } from "@/lib/use-copy";
import { confirmAction } from "@/lib/success-confirm";
import { useSessionDesks } from "@/components/desk-switcher";
import { TourCard } from "@/components/tour-card";
import { money } from "@/lib/utils";
import { MIN_POLL_MS, pollBackoffMs } from "@/lib/fn-query";
import type { BookingStatus, Child, Message, Schedule, TourRequest } from "@/lib/types";

export const Route = createFileRoute("/inbox/$id")({
  validateSearch: (s: Record<string, unknown>) => parseInboxSearch(s),
  component: InboxThreadRoute,
});

function InboxThreadRoute() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return <InboxThreadPage id={id} search={search} />;
}

function showChatBubble(m: Message) {
  return m.kind === "status" || (m.kind !== "system" && m.kind !== "notify" && m.sender !== "system");
}

type BookingInfo = {
  id: string;
  status: BookingStatus;
  childName: string | null;
  birthdate: string | null;
  startDate: string | null;
  startMonth: string;
  schedule: Schedule;
  days: string | null;
  parentNote: string | null;
  parentName: string | null;
  monthlyAmount: number;
  paymentStatus?: string | null;
  daycareId?: string;
};

export function InboxThreadPage({ id, search }: { id: string; search: ReturnType<typeof parseInboxSearch> }) {
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const { session: desks, sticky } = useSessionDesks();
  const inboxView = resolveInboxView({ search: search.view, sticky });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isParent, setIsParent] = useState(true);
  const [viewerRole, setViewerRole] = useState<"parent" | "centre" | "admin" | "none">("none");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [child, setChild] = useState<Child | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tours, setTours] = useState<TourRequest[]>([]);
  const [canWrite, setCanWrite] = useState(true);
  const [openBill, setOpenBill] = useState<Bill | null>(null);
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [fromDraft, setFromDraft] = useState(false);
  const aiDrafted = useRef(false);
  const replyDraftsOn = useAiFeatureFlag(AI_FLAGS.replyDrafts);
  const [videoSurface, setVideoSurface] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [details, setDetails] = useState<ConversationDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [stateBusy, setStateBusy] = useState(false);

  async function load() {
    if (!id) {
      setLoadState("missing");
      return;
    }
    const res = await getThread({ data: id });
    if (!res) {
      setLoadState("missing");
      return;
    }
    setLoadState("ready");
    setName(res.daycareName);
    setSlug(res.daycareSlug);
    setIsParent(res.isParent);
    setViewerRole(res.viewerRole === "centre" || res.viewerRole === "admin" || res.viewerRole === "parent" ? res.viewerRole : "none");
    let next = res.booking ? { ...res.booking, birthdate: res.booking.birthdate ?? null } : null;
    let kid = res.child ?? null;
    if (!next) {
      try {
        const family = await getFamily();
        const match = family.bookings.find((b) => b.conversationId === id || b.daycareSlug === res.daycareSlug);
        if (match) {
          const found = family.children.find((c) => c.id === match.childId);
          if (found) kid = found;
          next = {
            id: match.id,
            status: match.status,
            childName: match.childName,
            birthdate: found?.birthdate ?? null,
            startDate: match.startDate,
            startMonth: match.startMonth,
            schedule: match.schedule,
            days: match.days,
            parentNote: match.parentNote,
            parentName: match.parentName ?? user?.displayName ?? null,
            monthlyAmount: match.monthlyAmount,
            paymentStatus: match.paymentStatus,
            daycareId: match.daycareId,
          };
        }
      } catch {
        /* provider view */
      }
    }
    setBooking(next);
    setChild(kid);
    setMessages(res.messages);
    setTours(res.tours ?? []);
    const meta = await getConversationDetails({ data: { conversationId: id } }).catch(() => null);
    setDetails(meta);
    setCanWrite(res.canWrite !== false);
    setVideoSurface(Boolean(res.videoSurfaceEnabled));
    setVoiceReady(Boolean(res.voiceReady));
    if (res.isParent && next) {
      const billed = await listParentBills().catch(() => ({ bills: [] as Bill[] }));
      const match = billed.bills.find((bill) => bill.bookingId === next.id && billIsOpen(bill.status)) ?? null;
      setOpenBill(match);
    } else {
      setOpenBill(null);
    }
  }

  useEffect(() => {
    if (!user || !id) return;
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
        await load();
        failures = 0;
      } catch {
        failures += 1;
        setLoadState((current) => (current === "ready" ? current : "error"));
      }
      if (cancelled) return;
      arm(failures > 0 ? pollBackoffMs(failures) : MIN_POLL_MS);
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
    // `load` reads the open thread. The session key is the user id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  useEffect(() => {
    const tourId = search.tour;
    if (!tourId || !tours.some((tour) => tour.id === tourId)) return;
    setDetailOpen(true);
    const node = document.getElementById(`tour-${tourId}`);
    node?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [search.tour, tours]);

  if (isPending) {
    return <p className="p-8 text-muted">{t("loading")}</p>;
  }
  if (!user) return <RedirectToSignIn />;

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    if (aiDrafted.current && replyDraftQuiet()) {
      capturePostHogEvent("reply_draft_held_quiet", replyDraftEventProps({ conversationId: id }));
      setSendError(t("replyDraftQuiet"));
      return;
    }
    setSendError("");
    const drafted = aiDrafted.current;
    try {
      const sent = await sendConnectedMessage({ data: { conversationId: id, body } });
      if (!sent.ok) {
        setSendError("blocked" in sent && sent.blocked ? safetyText(locale).blockedSend : t("threadSendEmpty"));
        return;
      }
      setBody("");
      aiDrafted.current = false;
      setFromDraft(false);
      if (drafted) capturePostHogEvent("reply_draft_sent", replyDraftEventProps({ conversationId: id }));
      confirmAction(t, "replySent");
      await load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("sendFailed"));
    }
  }

  function draftReply() {
    setDrafting(true);
    setSendError("");
    void draftInboxReply({ data: { conversationId: id } })
      .then((res) => {
        if (!res.ok || !res.body) {
          aiDrafted.current = false;
          setFromDraft(false);
          capturePostHogEvent("reply_draft_fallback", replyDraftEventProps({ conversationId: id }));
          setSendError(res.ok ? t("replyDraftFailed") : res.error === "empty" ? t("replyDraftEmpty") : t("replyDraftFailed"));
          return;
        }
        aiDrafted.current = true;
        setFromDraft(true);
        setBody(res.body);
        capturePostHogEvent("reply_draft_used", replyDraftEventProps({ conversationId: id }));
      })
      .catch(() => {
        aiDrafted.current = false;
        setFromDraft(false);
        capturePostHogEvent("reply_draft_fallback", replyDraftEventProps({ conversationId: id }));
        setSendError(t("replyDraftFailed"));
      })
      .finally(() => setDrafting(false));
  }

  const notice = booking
    ? pushNewRequest(
        {
          parentName: booking.parentName ?? user?.displayName ?? "A parent",
          childName: booking.childName ?? "child",
          age: booking.birthdate ? formatAgeLabel(booking.birthdate, locale) : "",
          dob: booking.birthdate,
          daycareName: name,
          start: formatStart(booking.startDate ?? booking.startMonth, locale),
          schedule: scheduleLabel(booking.schedule, booking.days, locale),
          note: booking.parentNote,
        },
        locale,
      )
    : null;

  async function onState(action: "unread" | "star" | "archive") {
    setStateBusy(true);
    try {
      const res = await setConversationUserState({ data: { conversationId: id, action } });
      if (!res.ok) {
        toast.error(t("threadLoadFailed"));
        return;
      }
      setDetails((current) =>
        current ? { ...current, starred: res.starred, archived: res.archived, markedUnread: res.markedUnread } : current,
      );
      if (action === "unread") toast.success(t("inboxMarkedUnread"));
      if (action === "star") toast.success(res.starred ? t("inboxStarred") : t("inboxUnstarred"));
      if (action === "archive") toast.success(res.archived ? t("inboxArchived") : t("inboxUnarchived"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("threadLoadFailed"));
    } finally {
      setStateBusy(false);
    }
  }

  const peopleTitle = rowTitle({
    viewerIsParent: isParent,
    memberNames: details?.participants
      .filter((person) => person.id !== user.id && person.role !== "parent")
      .map((person) => person.name)
      .join(", "),
    centreName: name,
    parentName: booking?.parentName || details?.participants.find((person) => person.role === "parent")?.name,
  });
  const stay = formatStayDate(booking?.startDate, locale);
  const headerTitle = peopleTitle || name;
  const headerSub = [headerTitle === name ? "" : name, stay].filter(Boolean).join(" · ");
  const cleaned = messages.map((m) => ({ ...m, body: chatBodyWithoutSmsFooter(m.body) }));
  const avatars = (details?.participants || [{ name, image: null }]).map((person) => ({
    name: person.name,
    image: "image" in person ? person.image : null,
  }));

  return (
      <main className="mx-auto flex min-h-[70dvh] w-full max-w-3xl flex-col">
        {loadState === "ready" ? (
          <ThreadHeader
            backTo="/inbox"
            backSearch={inboxSearch(inboxView)}
            backLabel={inboxView === "centre" ? t("inboxBackCentre") : t("inboxBackFamily")}
            title={headerTitle}
            subtitle={headerSub}
            avatars={avatars}
            onDetails={() => setDetailOpen(true)}
            actions={
              <div className="flex shrink-0">
                {id && voiceReady ? (
                  <Button variant="ghost" size="icon" asChild>
                    <Link to="/call/$conversationId" params={{ conversationId: id }} reloadDocument aria-label={t("voiceStart")}>
                      <Phone className="size-5" />
                    </Link>
                  </Button>
                ) : null}
                {id && videoSurface ? (
                  <Button variant="ghost" size="icon" asChild>
                    <Link to="/video/$roomId" params={{ roomId: id }} reloadDocument aria-label={t("videoCall")}>
                      <Video className="size-5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : (
          <div className="px-4 pt-4">
            <Link to="/inbox" search={inboxSearch(inboxView)} className="text-sm text-muted">
              {inboxView === "centre" ? t("inboxBackCentre") : t("inboxBackFamily")}
            </Link>
          </div>
        )}
        {loadState === "ready" ? (
          <div className="flex flex-wrap gap-x-4 px-4 pt-1">
            <SafetyReportButton target="thread" conversationId={id} />
            <BlockMessagesButton conversationId={id} />
          </div>
        ) : null}
        {tours[0] || booking ? (
          <div className="px-4 pt-2">
            <PipelineBadge tourStatus={tours[0]?.status} bookingStatus={booking?.status ?? null} />
          </div>
        ) : null}
        <div className="ph-no-capture flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
          {loadState === "loading" ? <p className="text-sm text-muted">{t("loading")}</p> : null}
          {loadState === "missing" ? (
            <div className="rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
              <p className="font-medium">{t("threadMissingTitle")}</p>
              <p className="mt-2 text-sm text-muted">{t("threadMissingLead")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/inbox" search={inboxSearch(inboxView)}>
                    {t("inbox")}
                  </Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link to="/search">{t("search")}</Link>
                </Button>
              </div>
            </div>
          ) : null}
          {loadState === "error" ? (
            <div className="rounded-2xl bg-surface px-5 py-6 ring-1 ring-border">
              <p className="text-sm text-muted">{t("threadLoadFailed")}</p>
              <Button className="mt-4" type="button" onClick={() => void load().catch(() => setLoadState("error"))}>
                {t("threadTryAgain")}
              </Button>
            </div>
          ) : null}
          {loadState === "ready" && messages.filter(showChatBubble).length === 0 ? (
            <p className="text-sm text-muted">{canWrite ? t("threadEmpty") : t("threadEmptyRead")}</p>
          ) : null}
          {loadState === "ready" ? (
            <ThreadTranscript
              messages={cleaned}
              viewerRole={viewerRole}
              viewerId={user.id}
              parentName={booking?.parentName || user.displayName || t("inboxRoleParent")}
              centreName={name}
              reads={details?.reads ?? []}
            />
          ) : null}
        </div>
        {loadState === "ready" && !isParent && replyDraftsOn ? (
          <div data-ke="reply-draft" className="mx-3 mb-2 rounded-xl bg-surface p-3 ring-1 ring-border">
            <h2 className="font-display text-lg">{t("replyDraft")}</h2>
            <p className="mt-1 text-sm text-muted">{t("replyDraftLead")}</p>
            <Button type="button" variant="secondary" className="mt-2 min-h-11" disabled={drafting || !canWrite} onClick={draftReply}>
              {drafting ? t("replyDraftWorking") : t("replyDraft")}
            </Button>
          </div>
        ) : fromDraft ? (
          <p className="px-4 pb-1 text-sm text-muted">{t("replyDraftLead")}</p>
        ) : null}
        {loadState === "ready" && canWrite ? (
          <ThreadComposer
            inputId="thread-reply"
            value={body}
            onChange={setBody}
            onSubmit={onSend}
            error={sendError}
            placeholder={t("writeMessage")}
            plusLabel={t("inboxQuickReplies")}
            sendLabel={t("send")}
            plusOpen={plusOpen}
            onPlus={() => setPlusOpen((open) => !open)}
            menu={<p className="mb-2 rounded-2xl bg-surface px-3 py-2 text-sm text-muted ring-1 ring-border">{t("inboxAttachSoon")}</p>}
          />
        ) : loadState === "ready" ? (
          <p className="mx-3 mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
            {viewerRole === "admin" ? t("threadAdminRead") : t("threadReadOnly")}
          </p>
        ) : null}
        {detailOpen && loadState === "ready" ? (
          <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center" role="presentation">
            <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("inboxDetailClose")} onClick={() => setDetailOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("inboxDetail")}
              className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-bg shadow-card ring-1 ring-border md:rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="font-medium">{t("inboxDetail")}</p>
                <Button size="icon" variant="ghost" onClick={() => setDetailOpen(false)} aria-label={t("inboxDetailClose")}>
                  <X className="size-5" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {details ? (
                  <ConversationDetailsBody
                    details={details}
                    viewerId={user.id}
                    busy={stateBusy}
                    onMarkUnread={() => void onState("unread")}
                    onToggleStar={() => void onState("star")}
                    onToggleArchive={() => void onState("archive")}
                  />
                ) : slug ? (
                  <Link to="/daycare/$slug" params={{ slug }} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
                    {t("inboxViewListing")}
                  </Link>
                ) : null}
                {notice && isParent ? (
                  <div className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg">
                    <p className="font-medium">{notice.title}</p>
                    <p className="mt-0.5 text-primary-fg/90">{notice.body}</p>
                  </div>
                ) : null}
                {child ? <ChildCareCard child={child} showCompleteLink={isParent} /> : null}
                {isParent && desks?.stripeLive && booking?.status === "accepted" && booking.paymentStatus !== "paid" ? (
                  <div className="rounded-xl bg-primary p-4 text-primary-fg">
                    <p className="font-medium">{openBill ? t("payBillTitle") : t("awaitingCentreBill")}</p>
                    {openBill ? <p className="mt-1 text-sm text-primary-fg/90">{t("connectFeeParentPay")}</p> : null}
                    <Button size="sm" variant="secondary" className="mt-3" asChild>
                      {openBill ? (
                        <Link to="/pay/bill/$billId" params={{ billId: openBill.id }} search={{}} data-ke="native-checkout">
                          {t("pay")} · {money(billDollars(openBill), locale)}
                        </Link>
                      ) : (
                        <Link to="/parent" search={{ tab: "payments" }}>
                          {t("payUseBill")}
                        </Link>
                      )}
                    </Button>
                  </div>
                ) : null}
                {viewerRole === "centre" && canWrite && booking ? (
                  <div className="flex flex-wrap gap-2">
                    {(["under_review", "accepted", "waitlist", "declined"] as const).map((st) => (
                      <Button
                        key={st}
                        size="sm"
                        variant={booking.status === st ? "primary" : "secondary"}
                        onClick={() => {
                          void updateRequestStatus({ data: { bookingId: booking.id, status: st } }).then(() => {
                            const status = parentWaitlistStatus(st);
                            if (status) {
                              capturePostHogEvent(
                                "waitlist_status_changed",
                                waitlistEventProps({ daycareId: booking.daycareId, status }),
                              );
                            }
                            load();
                          });
                        }}
                      >
                        {st === "under_review" ? t("markReview") : st === "accepted" ? t("offerSpot") : st === "waitlist" ? t("waitlistChild") : t("declineRequest")}
                      </Button>
                    ))}
                  </div>
                ) : null}
                {tours.map((tour) => (
                  <TourCard key={tour.id} tour={tour} canRespond={canWrite && viewerRole === "centre"} onChanged={() => void load()} />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </main>
  );
}
