import { Link, useRouterState } from "@tanstack/react-router";
import { chatBodyWithoutSmsFooter } from "@/lib/sms-copy";
import { maskInboxPreview } from "@/lib/inbox-secrets";
import { nextInboxAction } from "@/lib/engagement";
import {
  inboxStatusLine,
  inboxTimeLabel,
  lastMessageFromViewer,
  participantInitials,
  rowTitle,
  withYouPrefix,
  type InboxListRow,
} from "@/lib/inbox-thread-ui";
import { inboxThreadTo } from "@/lib/desk-nav";
import { inboxSearch, type InboxView } from "@/lib/inbox-view";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { CentreInboxThread } from "@/lib/inbox-stages";

export function InboxMessageRow({
  row,
  view,
  selected = false,
  now = new Date(),
}: {
  row: CentreInboxThread | InboxListRow;
  view: InboxView;
  selected?: boolean;
  now?: Date;
}) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const viewerIsParent = view !== "centre";
  const centre = ("centreName" in row && row.centreName) || (viewerIsParent ? row.daycareName : "");
  const title = rowTitle({
    viewerIsParent,
    memberNames: "memberNames" in row ? row.memberNames : null,
    centreName: centre,
    parentName: row.parentName,
  }) || centre || row.daycareName;
  const fromYou = lastMessageFromViewer(viewerIsParent, "lastSender" in row ? row.lastSender : null);
  const preview = withYouPrefix(
    fromYou,
    maskInboxPreview(chatBodyWithoutSmsFooter(("preview" in row && row.preview) || ("lastBody" in row ? row.lastBody : "") || "")),
    t("inboxYouPrefix"),
  );
  const status = inboxStatusLine({ status: row.status, tourStatus: "tourStatus" in row ? row.tourStatus : null });
  const next = nextInboxAction({
    unread: row.unread,
    viewerIsParent,
    providerReplied: "providerReplied" in row ? Boolean(row.providerReplied) : !row.unread && !viewerIsParent,
    tourStatus: "tourStatus" in row ? row.tourStatus : null,
    bookingStatus: row.status,
  });
  const nextKey =
    next === "reply"
      ? "inboxNextReply"
      : next === "tour"
        ? viewerIsParent
          ? "inboxNextTourParent"
          : "inboxNextTour"
        : next === "follow_up"
          ? "inboxNextFollow"
          : next === "waitlist"
            ? "inboxNextWaitlist"
            : null;
  const when = inboxTimeLabel("lastAt" in row ? row.lastAt : "", now, locale);
  const avatarName = viewerIsParent ? title : "parentName" in row ? row.parentName : title;

  return (
    <Link
      to={inboxThreadTo(pathname)}
      params={{ id: row.id }}
      search={inboxSearch(view)}
      data-ke="inbox-row"
      className={cn(
        "flex min-h-11 items-start gap-3 px-3 py-3 hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        selected && "bg-bg",
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-fg" aria-hidden>
        {participantInitials(avatarName || title)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate text-[15px]", row.unread ? "font-semibold text-fg" : "font-medium text-fg")}>{title}</span>
          {row.unread ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-label={t("inboxFilterUnread")} /> : null}
          {"starred" in row && row.starred ? <span className="text-xs text-primary" aria-label={t("inboxStar")}>★</span> : null}
          <span className="ml-auto shrink-0 text-xs text-subtle">{when}</span>
        </span>
        <span className={cn("mt-0.5 block truncate text-sm", row.unread ? "text-fg" : "text-muted")}>
          {preview || t("inboxNoMessagesYet")}
        </span>
        {nextKey ? <span className="mt-1 block text-sm font-medium text-primary" data-ke="inbox-next">{t(nextKey)}</span> : null}
        {status ? (
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <span className={cn("size-2 shrink-0 rounded-full", status.dot === "ok" ? "bg-ok" : "bg-warn")} aria-hidden />
            <span className="truncate">
              {t(status.key)}
              {centre ? ` · ${centre}` : ""}
            </span>
          </span>
        ) : centre && !viewerIsParent ? (
          <span className="mt-1 block truncate text-sm text-muted">{centre}</span>
        ) : null}
      </span>
    </Link>
  );
}
