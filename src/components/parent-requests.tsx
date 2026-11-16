import { Link, useRouterState } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { KidNotebook } from "@/components/kid-art";
import { Button } from "@/components/ui/button";
import { inboxThreadTo } from "@/lib/desk-nav";
import { parentRequestKindKey, parentRequestStatusKey, type ParentRequestRow } from "@/lib/parent-request-rows";
import { useCopy } from "@/lib/use-copy";

function requestDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });
}

export function ParentRequestsList({ items }: { items: ParentRequestRow[] }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const listingTo = locale === "fr" ? "/fr/daycare/$slug" : "/daycare/$slug";
  if (!items.length) {
    return (
      <EmptyState title={t("noRequests")} body={t("noRequestsLead")} action={t("emptyFindCare")} actionTo="/search" art={<KidNotebook />} />
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border" data-ke="parent-requests">
      {items.map((row) => (
        <li key={`${row.kind}-${row.id}`} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <Link to={listingTo} params={{ slug: row.daycareSlug }} className="font-medium hover:underline">
              {row.daycareName}
            </Link>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{t(parentRequestKindKey(row.kind))}</span>
              <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-fg ring-1 ring-inset ring-border" data-ke="request-status">
                {t(parentRequestStatusKey(row.status))}
              </span>
            </p>
            <p className="mt-1 text-xs text-subtle">
              {t("parentRequestSentOn")} {requestDate(row.sentAt, locale)}
            </p>
            {row.tourDate ? (
              <p className="mt-1 text-xs text-subtle">
                {t("parentRequestVisitOn")} {requestDate(row.tourDate, locale)}
              </p>
            ) : null}
          </div>
          {row.conversationId ? (
            <Button size="sm" variant="secondary" className="min-h-11 min-w-11 touch-manipulation" asChild>
              <Link to={inboxThreadTo(pathname)} params={{ id: row.conversationId }}>
                {t("openChat")}
              </Link>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
