import { Link } from "@tanstack/react-router";
import { Archive, Mail, Star } from "lucide-react";
import { formatPreferredTimes } from "@/lib/threads";
import {
  formatStayDate,
  inboxStatusLine,
  participantInitials,
  type ConversationDetails,
} from "@/lib/inbox-thread-ui";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const ROLE_KEY = {
  parent: "inboxRoleParent",
  owner: "inboxRoleOwner",
  staff: "inboxRoleStaff",
} as const;

export function ConversationDetailsBody({
  details,
  viewerId,
  busy,
  onMarkUnread,
  onToggleStar,
  onToggleArchive,
}: {
  details: ConversationDetails;
  viewerId: string;
  busy?: boolean;
  onMarkUnread: () => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
}) {
  const { t, locale } = useCopy();
  const status = inboxStatusLine({ status: details.status, tourStatus: details.tourStatus });
  const dates =
    formatStayDate(details.startDate, locale) ||
    (details.preferredTimes.length ? formatPreferredTimes(details.preferredTimes, locale) : "");
  const photoOk = isRealListingPhoto(details.photo);
  const manage = details.viewerRole === "centre";

  return (
    <div data-ke="conversation-details" className="flex flex-col gap-6">
      <div className="rounded-2xl bg-surface p-3 ring-1 ring-border">
        <div className="flex items-center gap-3">
          {photoOk ? (
            <img src={details.photo} alt="" width={72} height={72} className="size-[4.5rem] rounded-xl object-cover" />
          ) : (
            <span className="grid size-[4.5rem] place-items-center rounded-xl bg-soft text-sm font-semibold text-primary" aria-hidden>
              {participantInitials(details.daycareName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{details.daycareName}</p>
            {status ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <span className={cn("size-2 rounded-full", status.dot === "ok" ? "bg-ok" : "bg-warn")} aria-hidden />
                {t(status.key)}
              </p>
            ) : null}
            {dates ? <p className="text-sm text-muted">{dates}</p> : null}
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          {manage ? (
            <Link
              to="/provider"
              search={{ desk: "requests" }}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            >
              {t("inboxManageRequest")}
            </Link>
          ) : details.daycareSlug ? (
            <Link
              to="/daycare/$slug"
              params={{ slug: details.daycareSlug }}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            >
              {t("inboxViewListing")}
            </Link>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold">{t("inboxInConversation")}</h3>
        <ul className="mt-3 space-y-3">
          {details.participants.map((person) => {
            const you = person.id === viewerId;
            return (
              <li key={person.id} className="flex items-center gap-3">
                {person.image ? (
                  <img src={person.image} alt="" width={44} height={44} className="size-11 rounded-full object-cover" />
                ) : (
                  <span
                    className={cn(
                      "grid size-11 place-items-center rounded-full text-sm font-semibold",
                      person.role === "parent" ? "bg-[#f3d7c4] text-fg" : "bg-surface-2 text-fg",
                    )}
                    aria-hidden
                  >
                    {you ? t("inboxRoleYou").slice(0, 1) : participantInitials(person.name)}
                  </span>
                )}
                <span>
                  <span className="block text-sm font-medium">{you ? t("inboxRoleYou") : person.name}</span>
                  <span className="block text-sm text-muted">{t(ROLE_KEY[person.role])}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold">{t("inboxConversationActions")}</h3>
        <ul className="mt-2">
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={onMarkUnread}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left text-sm hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Mail className="size-5 text-muted" aria-hidden />
              {t("inboxMarkUnread")}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={busy}
              aria-pressed={details.starred}
              onClick={onToggleStar}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left text-sm hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Star className={cn("size-5", details.starred ? "fill-primary text-primary" : "text-muted")} aria-hidden />
              {details.starred ? t("inboxUnstar") : t("inboxStar")}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={busy}
              aria-pressed={details.archived}
              onClick={onToggleArchive}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left text-sm hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Archive className="size-5 text-muted" aria-hidden />
              {details.archived ? t("inboxUnarchive") : t("inboxArchive")}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
