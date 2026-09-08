import { lazy, startTransition, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { DeskShell } from "@/components/desk-shell";
import { DaycareCard } from "@/components/daycare-card";
import { StatusBadge } from "@/components/status-badge";
import { ListingStatusBadge, LedgerHonesty } from "@/components/listing-status-badge";
import { TrustSignals } from "@/components/trust-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteAccount, getFamily } from "@/lib/server/family";
import { listTourRequests } from "@/lib/server/tours";
import { listParentBills } from "@/lib/server/billing";
import { shareChildWithCentres } from "@/lib/server/enrol-queue";
import { hasCareDetails } from "@/lib/child-profile";
import { useCopy } from "@/lib/use-copy";
import { signOut } from "@/lib/auth/client";
import { formatAgeLabel } from "@/lib/templates";
import { ageGroupFromMonths, formatMonth, money, monthsBetween } from "@/lib/utils";
import { useSessionDesks } from "@/components/desk-switcher";
import type { Booking, Child, DaycareCard as Card, Payment, TourRequest } from "@/lib/types";
import type { Bill } from "@/lib/bill";
import { billDollars, billIsOpen } from "@/lib/bill";
import { BillStatusBadge } from "@/components/bill-status";
import { periodLabel } from "@/lib/stripe-methods";
import { parentMatchScore } from "@/lib/parent-match";
import { parentUrgencyScore, soonestStartDate } from "@/lib/parent-urgency";
import { distanceKm } from "@/lib/proximity";
import { useAppStore } from "@/lib/store";
import { PipelineBadge } from "@/components/pipeline-badge";
import { featuredDaycares, searchDaycares } from "@/lib/server/daycares";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import { WINNIPEG } from "@/lib/geo";
import { yieldToMain } from "@/lib/yield-main";

const SAVED_EAGER_CARDS = 4;

const ParentPlusPanel = lazy(() =>
  import("@/components/parent-plus").then((m) => ({ default: m.ParentPlusPanel })),
);
const SavedSearchesPanel = lazy(() =>
  import("@/components/saved-searches-panel").then((m) => ({ default: m.SavedSearchesPanel })),
);
const ChildProfileForm = lazy(() =>
  import("@/components/child-profile-form").then((m) => ({ default: m.ChildProfileForm })),
);
const ParentDeskRails = lazy(() =>
  import("@/components/parent-desk-rails").then((m) => ({ default: m.ParentDeskRails })),
);
const TourCard = lazy(() =>
  import("@/components/tour-card").then((m) => ({ default: m.TourCard })),
);

function scheduleIdle(work: () => void): () => void {
  const ric = typeof requestIdleCallback === "function" ? requestIdleCallback : null;
  if (ric) {
    const id = ric(work, { timeout: 400 });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(work, 0);
  return () => window.clearTimeout(id);
}

type ParentTab = "explore" | "saved" | "bookings" | "payments" | "children" | "alerts";

export function ParentDesk({ initialTab }: { initialTab?: ParentTab }) {
  const { user } = useCurrentUserState();
  const { t, locale } = useCopy();
  const { session: desks, ready: desksReady } = useSessionDesks();
  const origin = useAppStore((s) => s.origin);
  const located = useAppStore((s) => s.located);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const [tab, setTab] = useState<ParentTab>(initialTab ?? "explore");
  const [contentTab, setContentTab] = useState<ParentTab>(initialTab ?? "explore");
  const [explore, setExplore] = useState<Card[]>([]);
  const [exploreReady, setExploreReady] = useState(false);
  const [saved, setSaved] = useState<Card[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [tours, setTours] = useState<TourRequest[]>([]);
  const [editing, setEditing] = useState<Child | null | "new">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [savedReady, setSavedReady] = useState(false);
  const [accountToolsReady, setAccountToolsReady] = useState(false);

  const selectTab = useCallback((id: string) => {
    const next = id as ParentTab;
    setTab(next);
    void yieldToMain().then(() => {
      startTransition(() => setContentTab(next));
    });
  }, []);

  const loadExplore = useCallback(
    async (startBookings: Booking[]) => {
      try {
        const loc = origin.lat ? origin : WINNIPEG;
        const rows = await withTimeoutFallback(
          searchDaycares({
            data: {
              lat: loc.lat,
              lng: loc.lng,
              radiusKm,
              sort: "match",
              ageGroup: "any",
              startDate: soonestStartDate(startBookings),
            },
          }),
          LOADER_SETTLE_MS,
          [] as Card[],
        );
        const next = rows.length
          ? rows
          : await withTimeoutFallback(featuredDaycares({ data: loc }), LOADER_SETTLE_MS, [] as Card[]);
        startTransition(() => setExplore(next));
      } finally {
        startTransition(() => setExploreReady(true));
      }
    },
    [origin, radiusKm],
  );

  const loadFamily = useCallback(async () => {
    const f = await getFamily();
    await yieldToMain();
    startTransition(() => {
      setSaved(f.saved);
      setBookings(f.bookings);
      setPayments(f.payments);
      setChildren(f.children);
    });
    return f;
  }, []);

  const loadDeskExtras = useCallback(async () => {
    const [billed, tourRows] = await Promise.all([
      listParentBills().catch(() => ({ bills: [] as Bill[] })),
      listTourRequests({ data: { desk: "parent" } }).catch(() => [] as TourRequest[]),
    ]);
    startTransition(() => {
      setBills(billed.bills);
      setTours(tourRows);
    });
  }, []);

  async function load() {
    const f = await loadFamily();
    await Promise.all([loadExplore(f.bookings), loadDeskExtras()]);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let cancelIdle: (() => void) | undefined;
    void yieldToMain()
      .then(() => {
        if (cancelled) return null;
        return loadFamily();
      })
      .then((f) => {
        if (cancelled || !f) return;
        cancelIdle = scheduleIdle(() => {
          if (cancelled) return;
          void loadExplore(f.bookings).catch(() => undefined);
          void loadDeskExtras().catch(() => undefined);
        });
      })
      .catch(() => {
        startTransition(() => setExploreReady(true));
      });
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [user, loadFamily, loadExplore, loadDeskExtras]);

  useEffect(() => {
    if (contentTab !== "saved") {
      setSavedReady(false);
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      startTransition(() => {
        if (!cancelled) setSavedReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [contentTab]);

  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
    startTransition(() => setContentTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (!exploreReady) return;
    return scheduleIdle(() => setAccountToolsReady(true));
  }, [exploreReady]);

  const deferredSaved = useDeferredValue(saved);
  const rankedSaved = useMemo(() => {
    if (contentTab !== "saved") return [] as Array<Card & { matchScore: number; urgencyScore: number; distanceKm: number }>;
    return [...deferredSaved]
      .map((item) => {
        const child = children[0];
        const ageGroup = child?.birthdate ? ageGroupFromMonths(monthsBetween(child.birthdate)) : "any";
        const startDate = soonestStartDate(bookings.filter((b) => b.daycareId === item.id));
        const km = distanceKm(origin, { lat: item.lat, lng: item.lng });
        return {
          ...item,
          distanceKm: km,
          matchScore: parentMatchScore({ ...item, distanceKm: km }, { ageGroup, radiusKm, distanceKnown: located }),
          urgencyScore: parentUrgencyScore(item, { ageGroup, startDate }),
        };
      })
      .sort((a, b) => b.urgencyScore - a.urgencyScore || b.matchScore - a.matchScore);
  }, [bookings, children, contentTab, deferredSaved, located, origin, radiusKm]);

  if (!user) return null;

  return (
    <DeskShell desk="parent" active={tab} onSelect={selectTab}>
      <p className="text-muted">{user.displayName ?? user.primaryEmail}</p>

      {contentTab === "explore" ? (
        <div className="mt-6">
          <h2 className="font-display text-2xl">{t("exploreForYou")}</h2>
          <p className="mt-1 text-sm text-muted">{t("sortMatchLead")}</p>
          {exploreReady ? (
            <Suspense fallback={<div className="ke-skel mt-6 h-40 rounded-xl" aria-hidden="true" />}>
              <ParentDeskRails items={explore} children={children} bookings={bookings} />
            </Suspense>
          ) : (
            <div className="mt-6 space-y-3" aria-busy="true" aria-live="polite">
              <div className="ke-skel h-40 rounded-xl" />
              <div className="ke-skel h-40 rounded-xl" />
            </div>
          )}
        </div>
      ) : null}

      {contentTab === "saved" ? (
        <div className="ke-listings mt-6">
          {rankedSaved.length ? (
            (savedReady ? rankedSaved : rankedSaved.slice(0, SAVED_EAGER_CARDS)).map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {item.live || (item.claimStatus && item.claimStatus !== "unclaimed") ? (
                    <ListingStatusBadge claimStatus={item.claimStatus} live={item.live} />
                  ) : null}
                  <PipelineBadge
                    tourStatus={tours.find((tour) => tour.daycareId === item.id)?.status}
                    bookingStatus={bookings.find((b) => b.daycareId === item.id)?.status ?? null}
                  />
                  <TrustSignals item={item} surface="parent" compact />
                </div>
                <DaycareCard item={item} showDistance={located} />
              </div>
            ))
          ) : (
            <EmptyState title={t("noSaved")} body={t("noSavedLead")} action={t("emptyFindCare")} actionTo="/search" />
          )}
        </div>
      ) : null}

      {contentTab === "alerts" ? (
        <Suspense fallback={<div className="ke-skel mt-6 h-40 rounded-xl" aria-hidden="true" />}>
          <SavedSearchesPanel />
        </Suspense>
      ) : null}

      {contentTab === "bookings" ? (
        <div className="mt-6 space-y-8">
        {tours.length ? (
          <section>
            <h2 className="font-display text-2xl">{t("pendingTours")}</h2>
            <ul className="mt-4 space-y-3">
              {tours.map((tour) => (
                <li key={tour.id}>
                  <Suspense fallback={<div className="ke-skel h-24 rounded-xl" aria-hidden="true" />}>
                    <TourCard tour={tour} />
                  </Suspense>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {bookings.length === 0 ? (
            <li className="p-8 text-center">
              <EmptyState title={t("noRequests")} body={t("noRequestsLead")} action={t("emptyFindCare")} actionTo="/search" />
            </li>
          ) : (
            bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/daycare/$slug" params={{ slug: b.daycareSlug }} className="font-medium hover:underline">
                      {b.daycareName}
                    </Link>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-sm text-muted">
                    {b.childName ? `${b.childName} · ` : ""}
                    {b.startDate ?? formatMonth(b.startMonth, locale)} · {t(b.ageGroup)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {b.conversationId ? (
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/inbox/$id" params={{ id: b.conversationId }}>
                        {t("openChat")}
                      </Link>
                    </Button>
                  ) : null}
                  {(() => {
                    const openBill = bills.find((bill) => bill.bookingId === b.id && billIsOpen(bill.status));
                    if (openBill) {
                      return (
                        <Button size="sm" asChild>
                          <Link to="/pay/bill/$billId" params={{ billId: openBill.id }} search={{}}>
                            {t("pay")}
                          </Link>
                        </Button>
                      );
                    }
                    if (b.status === "accepted" && b.paymentStatus !== "paid" && desks?.stripeLive) {
                      return (
                        <div className="max-w-[14rem] text-right">
                          <p className="text-xs text-muted">{t("awaitingCentreBill")}</p>
                          <Button size="sm" variant="secondary" className="mt-2" asChild>
                            <Link to="/parent" search={{ tab: "payments" }}>
                              {t("payUseBill")}
                            </Link>
                          </Button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </li>
            ))
          )}
        </ul>
        </div>
      ) : null}

      {contentTab === "payments" ? (
        <div className="mt-6 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl">{t("payments")}</h2>
              {bills.filter((b) => billIsOpen(b.status)).length ? (
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-fg">
                  {t("pay")} · {bills.filter((b) => billIsOpen(b.status)).length}
                </span>
              ) : null}
            </div>
            <LedgerHonesty
              stripeLive={Boolean(desks?.stripeLive)}
              surface="parent"
              className="mt-2"
              ready={desksReady}
            />
            <p className="mt-2 text-sm text-muted">{t("connectFeeParentPay")}</p>
            <div className="mt-4">
              <Suspense fallback={<div className="ke-skel h-32 rounded-xl" aria-hidden="true" />}>
                <ParentPlusPanel />
              </Suspense>
            </div>
          </div>
          {bills.filter((b) => billIsOpen(b.status)).length ? (
            <div>
              <h3 className="font-display text-xl">{t("openBills")}</h3>
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
                {bills
                  .filter((b) => billIsOpen(b.status))
                  .map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{b.daycareName}</p>
                          <BillStatusBadge status={b.status} />
                        </div>
                        <p className="text-sm text-muted">
                          {b.childName ? `${b.childName} · ` : ""}
                          {periodLabel(b.period, locale)}
                          {b.dueAt ? ` · ${t("billDue")} ${b.dueAt}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-display text-xl tabular-nums">{money(billDollars(b), locale)}</span>
                        <Button size="sm" asChild>
                          <Link to="/pay/bill/$billId" params={{ billId: b.id }} search={{}}>
                            {t("pay")}
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h3 className="font-display text-xl">{t("paidBills")}</h3>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
              {bills.filter((b) => b.status === "paid" || b.status === "refunded").length === 0 &&
              payments.length === 0 &&
              bills.filter((b) => billIsOpen(b.status)).length === 0 ? (
                <li className="p-2">
                  <EmptyState title={t("noPayments")} body={t("noPaymentsLead")} action={t("emptyFindCare")} actionTo="/search" />
                </li>
              ) : (
                <>
                  {bills
                    .filter((b) => b.status === "paid" || b.status === "refunded")
                    .map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{b.daycareName}</p>
                            <BillStatusBadge status={b.status} />
                          </div>
                          <p className="text-muted">
                            {periodLabel(b.period, locale)} · {b.number}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums">{money(billDollars(b), locale)}</span>
                          {b.receiptUrl ? (
                            <Button size="sm" variant="secondary" asChild>
                              <a href={b.receiptUrl} target="_blank" rel="noreferrer">
                                {t("viewReceipt")}
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" asChild>
                              <Link to="/pay/bill/$billId" params={{ billId: b.id }} search={{}}>
                                {t("viewReceipt")}
                              </Link>
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  {payments
                    .filter((p) => !bills.some((b) => b.id === p.invoiceId || b.number === p.reference))
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between p-4 text-sm">
                        <div>
                          <p className="font-medium">{p.daycareName}</p>
                          <p className="text-muted">
                            {p.method} · {p.status === "paid" ? t("paid") : t("pending")}
                          </p>
                        </div>
                        <span className="tabular-nums">{money(p.amount, locale)}</span>
                      </li>
                    ))}
                </>
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {contentTab === "children" ? (
        <div className="mt-6 space-y-4">
          <div>
            <h2 className="font-display text-2xl">{t("childProfileTitle")}</h2>
            <p className="mt-1 text-sm text-muted">
              Save the child profile, then send it to saved centres. Each centre sees it in Incoming requests and can approve, wait, or decline.
            </p>
          </div>
          {editing ? (
            <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <Suspense fallback={<div className="ke-skel h-48 rounded-xl" aria-hidden="true" />}>
                <ChildProfileForm
                  initial={editing === "new" ? null : editing}
                  onSaved={() => {
                    setEditing(null);
                    void load();
                  }}
                  onCancel={() => setEditing(null)}
                />
              </Suspense>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
                {children.length === 0 ? (
                  <li className="p-2">
                    <EmptyState title={t("noChildren")} body={t("noChildrenLead")} action={t("emptyAddChild")} onAction={() => setEditing("new")} />
                  </li>
                ) : (
                  children.map((c) => {
                    const selected = picked[c.id] ?? [];
                    return (
                    <li key={c.id} className="ph-no-capture p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {c.name}
                            {c.preferredName ? <span className="text-muted"> ({c.preferredName})</span> : null}
                          </p>
                          <p className="text-sm text-muted">
                            {formatAgeLabel(c.birthdate, locale)} · {c.birthdate}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {c.epiPen ? (
                              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger ring-1 ring-danger/20">
                                {t("epiPenBadge")}
                              </span>
                            ) : null}
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                              {c.allergies || t("noAllergies")}
                            </span>
                            {hasCareDetails(c) ? (
                              <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok">
                                {t("sharedWithCentre")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                          {t("editChild")}
                        </Button>
                      </div>
                      <div className="mt-4 rounded-lg bg-bg p-3 ring-1 ring-border">
                        <p className="text-sm font-medium">{t("sendChildProfile")}</p>
                        {saved.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">
                            {t("sendChildNeedSaved")}
                            <Link to="/search" className="ml-1 underline">
                              {t("wayfindFindCare")}
                            </Link>
                          </p>
                        ) : (
                          <>
                            <ul className="mt-2 space-y-1.5">
                              {saved.map((d) => {
                                const on = selected.includes(d.id);
                                return (
                                  <li key={d.id}>
                                    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        className="size-4 accent-primary"
                                        checked={on}
                                        onChange={() => {
                                          void yieldToMain().then(() => {
                                            startTransition(() => {
                                              setPicked((cur) => {
                                                const next = new Set(cur[c.id] ?? []);
                                                if (on) next.delete(d.id);
                                                else next.add(d.id);
                                                return { ...cur, [c.id]: [...next] };
                                              });
                                            });
                                          });
                                        }}
                                      />
                                      <span>{d.name}</span>
                                      <span className="text-subtle">{d.city}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                            <Button
                              className="mt-3"
                              size="sm"
                              disabled={!selected.length || sendingId === c.id}
                              onClick={() => {
                                setSendingId(c.id);
                                void shareChildWithCentres({ data: { childId: c.id, daycareIds: selected } })
                                  .then((res) => {
                                    toast.success(
                                      t("sentChildTo")
                                        .replace("{name}", res.childName)
                                        .replace("{n}", String(res.sent.length)),
                                    );
                                    selectTab("bookings");
                                    return load();
                                  })
                                  .catch((err) => toast.error(err instanceof Error ? err.message : "Could not send"))
                                  .finally(() => setSendingId(null));
                              }}
                            >
                              {sendingId === c.id ? t("sendChildSending") : t("sendChildCta")}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                    );
                  })
                )}
              </ul>
              <Button onClick={() => setEditing("new")}>{children.length ? t("newChild") : t("addChild")}</Button>
            </>
          )}
        </div>
      ) : null}

      {accountToolsReady ? (
      <section className="mt-14 rounded-xl bg-surface p-5 ring-1 ring-border">
        <h2 className="font-display text-xl">{t("deleteAccount")}</h2>
        <p className="mt-2 text-sm text-muted">{t("deleteAccountLead")}</p>
        {confirmDelete ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={deleting}
              onClick={() => {
                setDeleting(true);
                void deleteAccount()
                  .then(() => signOut("/"))
                  .catch(() => setDeleting(false));
              }}
            >
              {t("deleteAccountConfirm")}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("back")}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="mt-4 text-danger" onClick={() => setConfirmDelete(true)}>
            {t("deleteAccount")}
          </Button>
        )}
      </section>
      ) : null}
    </DeskShell>
  );
}
