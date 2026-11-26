import { Fragment, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { parentDeskPath } from "@/lib/desk-nav";
import { isSafeSitemapSlug } from "@/lib/sitemap";
import { AreaWaitlistForm } from "@/components/area-waitlist-form";
import { useRoleChrome } from "@/components/role-chrome";
import { RoleUpgradeCard } from "@/components/role-upgrade-card";
import { Button } from "@/components/ui/button";
import { parentHomeCardEligible, showHomeUpgradeCard } from "@/lib/upgrade-prompt";
import { showsParentBrowseActions } from "@/lib/role-access";
import type { LeadRequest } from "@/lib/lead-requests";
import { spotOfferCopy } from "@/lib/spot-offer-copy";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";
import { localePath } from "@/lib/locale-path";
import {
  parentHomeSectionOrder,
  parentHomeStage,
  type ParentHomeSection,
} from "@/lib/parent-home-stage";
import { billDollars, billIsOpen, type Bill } from "@/lib/bill";
import { PaymentStateBadge, PaymentStateNote } from "@/components/bill-status";
import { failureReasonText } from "@/lib/payment-state";
import { parentRequestRows, parentRequestStatusLabelKey, selectParentTours } from "@/lib/parent-request-rows";
import { money } from "@/lib/utils";
import type { Booking, DaycareCard, TourRequest } from "@/lib/types";

/** Prioritize the family’s current stage while keeping search available for siblings. */
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
  loadError = false,
  extrasState = "pending",
  bills = [],
  care,
  attention,
  matches,
  onRetry,
  onDismiss,
  onOpenPayments,
}: {
  /** Opens the Payments tab in place (the desk's own tab switch). */
  onOpenPayments?: () => void;
  saved: DaycareCard[];
  bookings: Booking[];
  tours: TourRequest[];
  leads: LeadRequest[];
  paid?: boolean;
  planLabel?: string | null;
  renewsOn?: string | null;
  messages?: number;
  dismissed?: boolean;
  settled?: boolean;
  loadError?: boolean;
  extrasState?: "pending" | "ready" | "error";
  bills?: Bill[];
  care?: ReactNode;
  attention?: ReactNode;
  matches?: ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const { t, locale } = useCopy();
  const nativeShell = useInNativeShell();
  const parentActions = showsParentBrowseActions(useRoleChrome().role);
  const joinLabel = spotOfferCopy(locale).join;
  const parentPath = parentDeskPath(useRouterState({ select: (s) => s.location.pathname }));
  const tourSelection = selectParentTours(tours, new Date());
  // Same rows and labels as the Requests tab (#1014 item 10), so one request
  // never reads Declined here and Cancelled there.
  const requestRows = parentRequestRows({ leads, tours, bookings });
  const nextTour = tourSelection.upcoming[0] ?? tourSelection.needsReply[0];
  const nextTourConfirmed = Boolean(nextTour && tourSelection.upcoming[0] === nextTour);
  const empty =
    saved.length === 0 && bookings.length === 0 && tours.length === 0 && leads.length === 0;
  const card = showHomeUpgradeCard({
    paid,
    eligible: parentHomeCardEligible({
      requests: bookings.length + tours.length + leads.length,
      messages,
    }),
    dismissed,
  });

  const stage = parentHomeStage(bookings, settled);
  const fr = locale === "fr";
  const extraNotice = (
    <p className="mt-2 text-sm text-muted" role="status">
      {extrasState === "error"
        ? fr
          ? "Les demandes et factures n’ont pas toutes été chargées."
          : "Some requests or bills could not load."
        : fr
          ? "Recherche de vos demandes et factures…"
          : "Checking your requests and bills…"}
      {extrasState === "error" && onRetry ? (
        <Button variant="secondary" className="ml-2" onClick={onRetry}>
          {fr ? "Réessayer" : "Try again"}
        </Button>
      ) : null}
    </p>
  );
  const openPayments = (event: { preventDefault: () => void }) => {
    if (!onOpenPayments) return;
    event.preventDefault();
    onOpenPayments();
  };
  const sections: Record<ParentHomeSection, ReactNode> = {
    care,
    attention,
    bills: (
      <section data-ke="parent-home-bills">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* The "Open bills" heading reads as a link, so it opens Payments too. */}
          <h2 className="font-display text-xl">
            <Link
              to={parentPath}
              search={{ tab: "payments" }}
              onClick={openPayments}
              data-ke="parent-home-bills-heading"
              className="hover:underline"
            >
              {t("openBills")}
            </Link>
          </h2>
          <Link
            to={parentPath}
            search={{ tab: "payments" }}
            onClick={openPayments}
            data-ke="parent-home-bills-all"
            className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 text-sm font-medium text-primary"
          >
            {t("parentHomeSeeAll")}
          </Link>
        </div>
        {extrasState !== "ready" ? (
          extraNotice
        ) : bills.some((bill) => billIsOpen(bill.status)) ? (
          <ul className="mt-2 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
            {bills
              .filter((bill) => billIsOpen(bill.status))
              .slice(0, 3)
              .map((bill) => (
                <li key={bill.id}>
                  <Link
                    to={parentPath}
                    search={{ tab: "payments" }}
                    onClick={openPayments}
                    data-ke="parent-home-bill-row"
                    aria-label={
                      fr
                        ? `Ouvrir la facture de ${bill.daycareName || "la garderie"}, ${money(billDollars(bill), locale)}`
                        : `Open bill from ${bill.daycareName || "your centre"}, ${money(billDollars(bill), locale)}`
                    }
                    className="flex w-full min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-surface-2"
                  >
                    <span className="min-w-0 text-sm">
                      {bill.daycareName}
                      {bill.childName ? ` · ${bill.childName}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <PaymentStateBadge state={bill.paymentState} />
                      <span className="text-sm font-medium tabular-nums">
                        {money(billDollars(bill), locale)}
                      </span>
                    </span>
                  </Link>
                  {bill.paymentState && bill.paymentState !== "processing" ? (
                    <span className="flex w-full flex-wrap items-center gap-2 px-3 pb-2">
                      <PaymentStateNote
                        state={bill.paymentState}
                        reason={failureReasonText(bill.lastErrorCode, fr ? "fr" : "en")}
                        className="min-w-0 flex-1"
                      />
                      <Link
                        to="/pay/bill/$billId"
                        params={{ billId: bill.id }}
                        search={{}}
                        className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary"
                      >
                        {bill.paymentState === "requires_action" ? t("billConfirmPayment") : t("billPayAgain")}
                      </Link>
                    </span>
                  ) : bill.paymentState === "processing" ? (
                    <PaymentStateNote state="processing" className="block w-full px-3 pb-2" />
                  ) : null}
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {fr ? "Aucune facture ouverte." : "No open bills."}
          </p>
        )}
      </section>
    ),
    matches,
    saved: (
      <section data-ke="parent-home-saved">
        <div className="flex flex-wrap items-center justify-between gap-[8px]">
          <h2 className="font-display text-xl">{t("parentHomeSaved")}</h2>
          <Link
            to={parentPath}
            search={{ tab: "saved" }}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-2 text-sm font-medium text-primary"
          >
            {t("saved")}
          </Link>
        </div>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("parentHomeNoneSaved")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {saved.slice(0, 4).map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                {isSafeSitemapSlug(item.slug) ? (
                  <Link
                    to="/daycare/$slug"
                    params={{ slug: item.slug }}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center text-sm font-medium"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <span className="flex min-h-[44px] min-w-0 flex-1 items-center text-sm font-medium">
                    {item.name}
                  </span>
                )}
                {parentActions && isSafeSitemapSlug(item.slug) ? (
                  <Link
                    to="/daycare/$slug"
                    params={{ slug: item.slug }}
                    hash="join-waitlist"
                    data-ke="card-join-waitlist"
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-primary"
                  >
                    {joinLabel}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    ),
    requests: (
      <section data-ke="parent-home-waiting">
        <div className="flex flex-wrap items-center justify-between gap-[8px]">
          <h2 className="font-display text-xl">{t("parentHomeRequests")}</h2>
          <Link
            to={parentPath}
            search={{ tab: "requests" }}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-2 text-sm font-medium text-primary"
          >
            {t("parentHomeSeeAll")}
          </Link>
        </div>
        {extrasState !== "ready" ? (
          extraNotice
        ) : requestRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("parentHomeNoRequests")}</p>
        ) : (
          <ul className="mt-2 space-y-2" data-ke="parent-home-requests">
            {requestRows.slice(0, 4).map((row) => (
              <li
                key={`${row.kind}-${row.id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 ring-1 ring-border"
              >
                <span className="min-w-0 truncate text-sm">{row.daycareName || t("parentHomeRequests")}</span>
                <span className="shrink-0 text-xs text-muted" data-ke="home-request-status" data-state={row.status}>
                  {t(parentRequestStatusLabelKey(row))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-fg">{t("parentNextTour")}</h3>
          {extrasState !== "ready" ? (
            extraNotice
          ) : nextTour ? (
            <p className="mt-1 text-sm text-muted">
              {nextTour.daycareName}
              {nextTourConfirmed
                ? ` · ${t("parentTourConfirmed")}`
                : ` · ${t("parentTourWaiting")}`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">{t("parentNoTour")}</p>
          )}
        </div>
      </section>
    ),
    search: empty ? null : (
      <form
        action={localePath("/search", locale)}
        method="get"
        className="flex flex-wrap gap-[8px]"
        data-ke="parent-home-search"
      >
        <label className="min-w-[44px] flex-1">
          <span className="sr-only">{t("parentHomeSearchLabel")}</span>
          <input
            name="q"
            placeholder={t("parentHomePlaceholder")}
            className="ke-input w-full"
            autoComplete="off"
          />
        </label>
        <Button type="submit" variant="secondary" className="shrink-0 rounded-full px-4">
          {t("search")}
        </Button>
      </form>
    ),
    area: <AreaWaitlistForm returnTo={parentPath} />,
    plan: card && !nativeShell ? (
      <RoleUpgradeCard
        role="parent"
        paid={card === "plan"}
        planLabel={planLabel}
        renewsOn={renewsOn}
        onDismiss={card === "upgrade" ? onDismiss : undefined}
      />
    ) : null,
  };

  return (
    <div
      className="mt-4 space-y-6"
      data-ke="parent-home"
      data-stage={stage}
      data-settled={settled ? "1" : "0"}
    >
      <div>
        <h1 className="font-display text-2xl">
          {fr ? "Votre espace parent KidEase" : "Your KidEase parent home"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {stage === "enrolled"
            ? fr
              ? "Retrouvez les nouvelles de votre enfant, les actions à faire et vos factures. Consultez les soins du jour."
              : "Keep up with your child’s day, next steps and bills. Check today’s care."
            : fr
              ? "Trouvez une garderie permise et suivez vos demandes. Cherchez une garde près de chez vous."
              : "Find licensed care and follow your requests. Search for care nearby."}
        </p>
        {stage !== "pending" && !loadError ? (
          <Button asChild className="mt-3">
            {stage === "enrolled" ? (
              <Link to={parentPath} search={{ tab: "care" }}>
                {fr ? "Voir les soins du jour" : "View daily care"}
              </Link>
            ) : (
              <Link to={localePath("/search", locale)}>{t("parentHomeFindAction")}</Link>
            )}
          </Button>
        ) : null}
      </div>
      {loadError ? (
        <div role="alert" className="rounded-xl border border-border bg-surface p-4">
          <p>
            {fr
              ? "Votre espace parent n’a pas pu être chargé."
              : "Your parent home could not load."}
          </p>
          {onRetry ? (
            <Button className="mt-3" onClick={onRetry}>
              {fr ? "Réessayer" : "Try again"}
            </Button>
          ) : null}
          <Link
            to={localePath("/search", locale)}
            className="ml-3 inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            {t("emptyFindCare")}
          </Link>
        </div>
      ) : stage === "pending" ? (
        <p role="status" className="text-sm text-muted">
          {fr ? "Préparation de votre espace parent…" : "Getting your parent home ready…"}
        </p>
      ) : (
        parentHomeSectionOrder(stage).map((section) => (
          <Fragment key={section}>{sections[section]}</Fragment>
        ))
      )}
    </div>
  );
}
