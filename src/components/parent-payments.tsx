import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EarningsBillSheet } from "@/components/earnings-bill-sheet";
import { EmptyState } from "@/components/empty-state";
import { KidNotebook } from "@/components/kid-art";
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
