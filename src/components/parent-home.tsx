import { Link } from "@tanstack/react-router";
import { isSafeSitemapSlug } from "@/lib/sitemap";
import { EmptyState } from "@/components/empty-state";
import { RoleUpgradeCard } from "@/components/role-upgrade-card";
import { StatusBadge } from "@/components/status-badge";
import { parentHomeCardEligible, showHomeUpgradeCard } from "@/lib/upgrade-prompt";
import { useCopy } from "@/lib/use-copy";
import type { Booking, DaycareCard, TourRequest } from "@/lib/types";

type LeadSnap = { id: string; daycareName?: string | null; status: string };

function tourWhen(tour: TourRequest): string {
  const times = [...(tour.preferredTimes || [])].filter((slot) => slot.date);
  times.sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
  const first = times[0];
  if (first?.date) return `${first.date} ${first.time || "00:00"}`;
  return tour.createdAt;
}

/** Parent landing: search, saved centres, request status, and the next tour. */
export function ParentHome({
  saved,
  bookings,
  tours,
  leads,
  paid = false,
  planLabel = null,
  renewsOn = null,
  messages = 0,
  dismissed = false,
  settled = false,
  onDismiss,
}: {
  saved: DaycareCard[];
  bookings: Booking[];
  tours: TourRequest[];
  leads: LeadSnap[];
  paid?: boolean;
  planLabel?: string | null;
  renewsOn?: string | null;
  messages?: number;
  dismissed?: boolean;
  settled?: boolean;
  onDismiss?: () => void;
}) {
  const { t } = useCopy();
  const nextTour = [...tours]
    .filter((tour) => tour.status === "pending" || tour.status === "accepted")
    .sort((a, b) => tourWhen(a).localeCompare(tourWhen(b)))[0];
  const empty = saved.length === 0 && bookings.length === 0 && tours.length === 0 && leads.length === 0;
  const card = showHomeUpgradeCard({
    paid,
    eligible: parentHomeCardEligible({
      requests: bookings.length + tours.length + leads.length,
      messages,
    }),
    dismissed,
  });

  return (
    <div className="mt-4 space-y-6" data-ke="parent-home" data-settled={settled ? "1" : "0"}>
      {card ? (
        <RoleUpgradeCard
          role="parent"
          paid={card === "plan"}
          planLabel={planLabel}
          renewsOn={renewsOn}
          onDismiss={card === "upgrade" ? onDismiss : undefined}
        />
      ) : null}
      <form action="/search" method="get" className="flex gap-2" data-ke="parent-home-search">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("parentHomeSearchLabel")}</span>
          <input
            name="q"
            placeholder={t("parentHomePlaceholder")}
            className="ke-input min-h-12 w-full"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="min-h-12 shrink-0 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg">
          {t("search")}
        </button>
      </form>

      {empty ? (
        <EmptyState
          title={t("parentHomeFindTitle")}
          body={t("parentHomeFindBody")}
          action={t("parentHomeFindAction")}
          actionTo="/search"
        />
      ) : (
        <>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl">{t("parentHomeSaved")}</h2>
              <Link to="/parent" search={{ tab: "saved" }} className="text-sm font-medium text-primary">
                {t("saved")}
              </Link>
            </div>
            {saved.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("parentHomeNoneSaved")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
                {saved.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    {isSafeSitemapSlug(item.slug) ? (
                      <Link to="/daycare/$slug" params={{ slug: item.slug }} className="flex min-h-12 items-center px-3 text-sm font-medium">
                        {item.name}
                      </Link>
                    ) : (
                      <span className="flex min-h-12 items-center px-3 text-sm font-medium">{item.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl">{t("parentHomeRequests")}</h2>
              <Link to="/parent" search={{ tab: "requests" }} className="text-sm font-medium text-primary">
                {t("parentHomeSeeAll")}
              </Link>
            </div>
            {bookings.length === 0 && leads.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("parentHomeNoRequests")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {bookings.slice(0, 3).map((booking) => (
                  <li key={booking.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 ring-1 ring-border">
                    <span className="min-w-0 truncate text-sm">{booking.daycareName}</span>
                    <StatusBadge status={booking.status} />
                  </li>
                ))}
                {leads.slice(0, 3).map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 ring-1 ring-border">
                    <span className="min-w-0 truncate text-sm">{lead.daycareName || t("parentHomeRequests")}</span>
                    <span className="text-xs text-muted">{lead.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-fg">{t("parentNextTour")}</h3>
              {nextTour ? (
                <p className="mt-1 text-sm text-muted">
                  {nextTour.daycareName}
                  {nextTour.status === "pending" ? ` · ${t("parentTourWaiting")}` : ` · ${t("parentTourConfirmed")}`}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">{t("parentNoTour")}</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
