import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EarningsBillSheet } from "@/components/earnings-bill-sheet";
import { EmptyState } from "@/components/empty-state";
import { KidNotebook } from "@/components/kid-art";
import { Button } from "@/components/ui/button";
import {
  filterBills,
  formatEarnDate,
  listingChoices,
  sumField,
  type DateFilter,
  type EarnBill,
} from "@/lib/earnings-desk";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { PayMode } from "@/lib/connect-payments";
import { listParentPayChoices, listWalletMethods, setParentPayMode, startManualPay } from "@/lib/server/connect-payments";
import { loadStripeClient } from "@/lib/stripe-browser";

type Payments = { ok: true; bills: EarnBill[]; maskedEmail: string | null } | { ok: false };

export function ParentPaymentsScreen({ data, billId }: { data: Payments | null; billId?: string }) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const navigate = useNavigate();
  const [dates, setDates] = useState<DateFilter>("all");
  const [listingId, setListingId] = useState<string | null>(null);
  const bills = useMemo(() => (data?.ok ? data.bills : []), [data]);
  const listings = useMemo(() => listingChoices(bills), [bills]);
  const filtered = filterBills(bills, { dates, listingId, type: "all" });
  const total = sumField(filtered, "grossCents");
  const open = bills.find((bill) => bill.id === billId) ?? null;
  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");

  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-28 pt-4" data-ke="parent-payments">
      <div className="flex items-center gap-2">
        <Link
          to="/menu"
          aria-label={t("back")}
          className="inline-flex min-h-11 items-center text-sm font-medium"
        >
          {t("back")}
        </Link>
        <h1 className="font-display text-2xl">{t("earningsPayments")}</h1>
      </div>
      <ParentPayChoices />
      {data && !data.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}
      {data?.ok && bills.length === 0 ? (
        <div className="mt-6 rounded-[1.25rem] bg-surface p-4 ring-1 ring-border">
          <EmptyState
            title={t("earningsPaymentsEmpty")}
            body={t("earningsPaymentsBody")}
            art={<KidNotebook className="mx-auto h-20 w-28 text-primary" />}
          />
        </div>
      ) : null}
      {data?.ok && bills.length > 0 ? (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto" data-ke="payments-filters">
            <Chip label={dateLabel(dates, t)} active={dates !== "all"} onClick={() => setDates(cycleDate(dates))} />
            <Chip
              label={listingId ? listings.find((item) => item.id === listingId)?.name || t("earningsAllListings") : t("earningsAllListings")}
              active={listingId != null}
              onClick={() => setListingId(nextListing(listingId, listings))}
            />
          </div>
          {filtered.length === 0 ? <p className="mt-6 text-sm text-muted">{t("earningsNoMatch")}</p> : null}
          <ul className="mt-2 divide-y divide-border">
            {filtered.map((bill) => (
              <li key={bill.id}>
                <Link
                  to="/menu"
                  search={{ screen: "payments", bill: bill.id }}
                  className="flex min-h-16 items-center gap-3 py-3 touch-manipulation"
                  data-ke="payment-row"
                >
                  {bill.centrePhoto ? (
                    <img src={bill.centrePhoto} alt={bill.centreName || t("earningsPayments")} width={48} height={48} className="size-12 rounded-xl object-cover" />
                  ) : (
                    <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-sm font-semibold" aria-hidden>
                      {bill.centreName?.slice(0, 1) || ""}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{bill.centreName || t("earningsPayments")}</span>
                    <span className="block text-sm text-muted">
                      {formatEarnDate(bill.paidAt, french) || ""} · {t("earningsPaid")}
                    </span>
                  </span>
                  {bill.grossCents != null ? <span className="tabular-nums">{cad(bill.grossCents)}</span> : null}
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-lg items-center justify-between border-t border-border bg-bg px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [[data-channel=app]_&]:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
            <p className="text-sm">
              <span className="block text-muted">{t("earningsFiltered")}</span>
              <span className="font-semibold tabular-nums">{total == null ? "" : cad(total)}</span>
            </p>
          </div>
          {open ? (
            <EarningsBillSheet
              bill={open}
              audience="parent"
              onClose={() => {
                void navigate({ to: "/menu", search: { screen: "payments" } });
              }}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium touch-manipulation ${active ? "bg-fg text-bg" : "bg-surface"}`}
    >
      {label}
    </button>
  );
}

function dateLabel(dates: DateFilter, t: (key: CopyKey) => string): string {
  if (dates === "this-month") return t("earningsThisMonth");
  if (dates === "last-month") return t("earningsLastMonth");
  if (dates === "this-year") return t("earningsThisYear");
  return t("earningsAllDates");
}

function cycleDate(current: DateFilter): DateFilter {
  if (current === "all") return "this-month";
  if (current === "this-month") return "last-month";
  if (current === "last-month") return "this-year";
  return "all";
}

function nextListing(current: string | null, listings: Array<{ id: string; name: string }>): string | null {
  if (!listings.length) return null;
  if (!current) return listings[0]?.id ?? null;
  const index = listings.findIndex((item) => item.id === current);
  return index < 0 || index === listings.length - 1 ? null : (listings[index + 1]?.id ?? null);
}

function ParentPayChoices() {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [modes, setModes] = useState<{ daycareId: string; daycareName: string; mode: PayMode }[]>([]);
  const [openBills, setOpenBills] = useState<
    { id: string; daycareId: string; daycareName: string; amountCents: number; number: string }[]
  >([]);
  const [methods, setMethods] = useState<{ id: string; label: string }[]>([]);
  const [methodId, setMethodId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    void listParentPayChoices()
      .then((res) => {
        if (cancel || !res.enabled) return;
        setEnabled(true);
        setReady(res.ready);
        setPublishableKey(res.publishableKey);
        setModes(res.modes);
        setOpenBills(res.open);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void listWalletMethods()
      .then((res) => {
        if (!res.ok) return;
        setMethods(res.methods.map((method) => ({ id: method.id, label: `${method.brand} ···· ${method.last4}` })));
        const preferred = res.methods.find((method) => method.isDefault) || res.methods[0];
        if (preferred) setMethodId(preferred.id);
      })
      .catch(() => undefined);
  }, [ready]);

  if (!enabled || (modes.length === 0 && openBills.length === 0)) return null;
  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  return (
    <section className="mt-6 space-y-4" data-ke="parent-pay-choices">
      {!ready ? <p className="text-sm text-muted">{t("walletNotSetUp")}</p> : null}
      {modes.map((row) => (
        <form
          key={row.daycareId}
          className="rounded-[1.25rem] bg-surface p-4 ring-1 ring-border"
          onSubmit={(event) => {
            event.preventDefault();
            const mode = new FormData(event.currentTarget).get("mode") === "automatic" ? "automatic" : "manual";
            setBusy(true);
            void setParentPayMode({ data: { daycareId: row.daycareId, mode } })
              .then((res) => {
                if (!res.ok) {
                  toast.error(t("actionFailed"));
                  return;
                }
                setModes((current) => current.map((item) => (item.daycareId === row.daycareId ? { ...item, mode } : item)));
                toast.success(t("payModeSaved"));
              })
              .catch(() => toast.error(t("actionFailed")))
              .finally(() => setBusy(false));
          }}
        >
          <h2 className="text-base font-semibold">{t("payChoose").replace("{centre}", row.daycareName)}</h2>
          <label className="mt-3 flex min-h-11 items-start gap-3 text-sm">
            <input type="radio" name="mode" value="automatic" defaultChecked={row.mode === "automatic"} className="mt-1 size-4" />
            <span>
              <span className="block font-medium">{t("payAutomatic")}</span>
              <span className="text-muted">{t("payAutomaticBody")}</span>
            </span>
          </label>
          <label className="mt-2 flex min-h-11 items-start gap-3 text-sm">
            <input type="radio" name="mode" value="manual" defaultChecked={row.mode !== "automatic"} className="mt-1 size-4" />
            <span>
              <span className="block font-medium">{t("payManual")}</span>
              <span className="text-muted">{t("payManualBody")}</span>
            </span>
          </label>
          <Button type="submit" className="mt-4 w-full" disabled={busy}>
            {t("walletSave")}
          </Button>
        </form>
      ))}
      {openBills.map((bill) => {
        const mode = modes.find((row) => row.daycareId === bill.daycareId)?.mode || "manual";
        if (mode !== "manual" || !ready) return null;
        return (
          <div key={bill.id} className="rounded-[1.25rem] bg-surface p-4 ring-1 ring-border" data-ke="pay-now">
            <p className="font-medium">{bill.daycareName}</p>
            <p className="text-sm text-muted">{bill.number}</p>
            <p className="mt-1 tabular-nums">{cad(bill.amountCents)}</p>
            {methods.length > 0 ? (
              <label className="mt-3 block text-sm font-medium">
                {t("walletTitle")}
                <select
                  className="ke-input mt-1 min-h-11 w-full"
                  value={methodId}
                  onChange={(event) => setMethodId(event.target.value)}
                >
                  {methods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mt-3 text-sm text-muted">{t("walletEmpty")}</p>
            )}
            <Button
              type="button"
              className="mt-4 w-full"
              disabled={busy || !methodId || !publishableKey}
              onClick={() => {
                if (!publishableKey || !methodId) return;
                setBusy(true);
                void startManualPay({ data: { billId: bill.id, paymentMethodId: methodId } })
                  .then(async (res) => {
                    if (!res.ok || !res.clientSecret) {
                      toast.error(t("actionFailed"));
                      return;
                    }
                    const stripe = await loadStripeClient(publishableKey);
                    if (!stripe) {
                      toast.error(t("walletNotSetUp"));
                      return;
                    }
                    const paid = await stripe.confirmPayment({
                      clientSecret: res.clientSecret,
                      redirect: "if_required",
                      confirmParams: {
                        return_url: `${window.location.origin}/menu?screen=payments`,
                        payment_method: methodId,
                      },
                    });
                    if (paid.error) {
                      toast.error(paid.error.message || t("actionFailed"));
                      return;
                    }
                    toast.success(t("payModeSaved"));
                  })
                  .catch(() => toast.error(t("actionFailed")))
                  .finally(() => setBusy(false));
              }}
            >
              {t("payBillNow")}
            </Button>
          </div>
        );
      })}
    </section>
  );
}
