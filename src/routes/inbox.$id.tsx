import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPinned, Phone, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ChildCareCard } from "@/components/child-care-card";
import { getFamily, getThread, updateRequestStatus } from "@/lib/server/family";
import { sendConnectedMessage } from "@/lib/server/inbox";
import { formatAgeLabel, formatStart, pushNewRequest, scheduleLabel } from "@/lib/templates";
import { useCopy } from "@/lib/use-copy";
import { cn, money } from "@/lib/utils";
import type { BookingStatus, Child, Message, Schedule } from "@/lib/types";

export const Route = createFileRoute("/inbox/$id")({ component: ThreadPage });

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
};

function ThreadPage() {
  const { id } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t, locale } = useCopy();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [photo, setPhoto] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(true);
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [child, setChild] = useState<Child | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState("");

  async function load() {
    const res = await getThread({ data: id });
    if (!res) return;
    setName(res.daycareName);
    setSlug(res.daycareSlug);
    setPhoto(res.photo);
    setPhone(res.phone);
    setIsParent(res.isParent);
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
          };
        }
      } catch {
        /* provider view */
      }
    }
    setBooking(next);
    setChild(kid);
    setMessages(res.messages);
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, id]);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSendError("");
    try {
      await sendConnectedMessage({ data: { conversationId: id, body } });
      setBody("");
      await load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send");
    }
  }

  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined;
  const closed = booking?.status === "declined" || booking?.status === "cancelled";
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

  return (
    <Shell>
      <main className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to="/inbox" className="text-sm text-muted">
              ← Message centre
            </Link>
            <div className="mt-1 flex items-center gap-3">
              {photo ? <img src={photo} alt="" className="size-10 rounded-md object-cover" /> : null}
              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl">{isParent ? name : booking?.parentName || name}</h1>
                {booking ? <StatusBadge status={booking.status} /> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {telHref ? (
              <Button variant="ghost" size="icon" asChild>
                <a href={telHref} aria-label={t("call")}>
                  <Phone className="size-5" />
                </a>
              </Button>
            ) : null}
            {slug ? (
              <Button variant="ghost" size="icon" asChild>
                <Link to="/checkin/$id" params={{ id: slug }} aria-label={t("videoCall")}>
                  <Video className="size-5" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <p className="mt-2 text-xs text-subtle">Same thread for the parent and this centre after a spot request.</p>
        {notice && isParent ? (
          <div className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg">
            <p className="font-medium">{notice.title}</p>
            <p className="mt-0.5 text-primary-fg/90">{notice.body}</p>
          </div>
        ) : null}
        {child ? (
          <div className="mt-3">
            <ChildCareCard child={child} showCompleteLink={isParent} />
          </div>
        ) : null}
        {isParent && booking?.status === "accepted" && booking.paymentStatus !== "paid" ? (
          <div className="mt-3 rounded-xl bg-primary p-4 text-primary-fg">
            <p className="font-medium">{t("payTitle")}</p>
            <Button size="sm" variant="secondary" className="mt-3" asChild>
              <Link to="/pay/$bookingId" params={{ bookingId: booking.id }}>
                {t("pay")} · {money(booking.monthlyAmount, locale)}
              </Link>
            </Button>
          </div>
        ) : null}
        {!isParent && booking ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["under_review", "accepted", "waitlist", "declined"] as const).map((st) => (
              <Button
                key={st}
                size="sm"
                variant={booking.status === st ? "primary" : "secondary"}
                onClick={() => {
                  void updateRequestStatus({ data: { bookingId: booking.id, status: st } }).then(() => load());
                }}
              >
                {st === "under_review" ? t("markReview") : st === "accepted" ? t("offerSpot") : st === "waitlist" ? t("waitlistChild") : t("declineRequest")}
              </Button>
            ))}
          </div>
        ) : null}
        {slug ? (
          <Link to="/daycare/$slug" params={{ slug }} className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
            <MapPinned className="size-3.5" />
            {t("directions")}
          </Link>
        ) : null}
        <ul className="mt-4 flex-1 space-y-3">
          {messages
            .filter((m) => m.kind === "status" || (m.kind !== "system" && m.kind !== "notify" && m.sender !== "system"))
            .map((m) => (
              <li
                key={m.id}
                className={cn(
                  "max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm",
                  m.kind === "status"
                    ? "w-full max-w-none bg-surface-2 text-fg"
                    : (isParent && m.sender === "parent") || (!isParent && m.sender === "provider")
                      ? "ml-auto bg-primary text-primary-fg"
                      : "bg-surface ring-1 ring-border",
                )}
              >
                {m.body}
              </li>
            ))}
        </ul>
        {closed ? (
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">This enrolment is closed. Messaging is off.</p>
        ) : (
          <form id="reply" onSubmit={onSend} className="sticky bottom-20 mt-4 flex flex-col gap-2 bg-bg py-2 md:bottom-0">
            {sendError ? <p className="text-sm text-danger">{sendError}</p> : null}
            <div className="flex gap-2">
              <input value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("writeMessage")} className="h-12 flex-1 rounded-md border border-border bg-surface px-3" />
              <Button type="submit">{t("send")}</Button>
            </div>
          </form>
        )}
      </main>
    </Shell>
  );
}
