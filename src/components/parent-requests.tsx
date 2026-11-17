import { Link, useRouterState } from "@tanstack/react-router";
import { ListingPhotoFallback } from "@/components/building-photo";
import { EmptyState } from "@/components/empty-state";
import { KidNotebook } from "@/components/kid-art";
import { TourCountSummary } from "@/components/tour-count-summary";
import { Button } from "@/components/ui/button";
import { inboxThreadTo } from "@/lib/desk-nav";
import { parentRequestKindKey, parentRequestStatusKey, type ParentRequestRow } from "@/lib/parent-request-rows";
import { summarizeTourCounts } from "@/lib/tour-counts";
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
  const counts = summarizeTourCounts({
    requests: items.map((row) => ({ status: row.status, kind: row.kind })),
  });
  return (
    <div className="space-y-3">
    <TourCountSummary counts={counts} locale={locale} />
    <ul className="grid gap-4" data-ke="parent-requests">
      {items.map((row) => {
        const status =
          row.kind === "tour" && row.status === "waiting" ? t("parentRequestTourAsked") : t(parentRequestStatusKey(row.status));
        return (
          <li key={`${row.kind}-${row.id}`} id={row.kind === "tour" ? `tour-${row.id}` : undefined}>
            <article className="overflow-hidden rounded-xl bg-surface ring-1 ring-border" data-ke="parent-request-card">
              <ListingPhotoFallback className="aspect-[16/10] w-full bg-surface-2" />
              <div className="space-y-1 p-4">
                <Link
                  to={listingTo}
                  params={{ slug: row.daycareSlug }}
                  className="inline-flex min-h-11 min-w-11 items-center font-medium hover:underline"
                >
                  {row.daycareName}
                </Link>
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">{t(parentRequestKindKey(row.kind))}</span>
                  <span className="inline-flex min-h-11 items-center rounded-full bg-surface-2 px-3 text-sm font-medium text-fg ring-1 ring-inset ring-border" data-ke="request-status">
                    {status}
                  </span>
                </p>
                <p className="text-sm text-subtle">
                  {t("parentRequestSentOn")} {requestDate(row.sentAt, locale)}
                </p>
                {row.tourDate ? (
                  <p className="text-sm text-subtle">
                    {t("parentRequestVisitOn")} {requestDate(row.tourDate, locale)}
                  </p>
                ) : null}
                {row.conversationId ? (
                  <Button size="md" variant="secondary" className="mt-2" asChild>
                    <Link to={inboxThreadTo(pathname)} params={{ id: row.conversationId }}>
                      {t("openChat")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
