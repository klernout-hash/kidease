import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EarningsBillSheet } from "@/components/earnings-bill-sheet";
import { EarningsHeader } from "@/components/earnings-header";
import { EmptyState } from "@/components/empty-state";
import {
  billsCsv,
  filterBills,
  formatEarnDate,
  listingChoices,
  sumField,
  type DateFilter,
  type EarningsResult,
  type TypeFilter,
} from "@/lib/earnings-desk";
import type { CopyKey } from "@/lib/copy";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useCopy } from "@/lib/use-copy";

export function EarningsListScreen({
  desk,
  kind,
  billId,
  period,
}: {
  desk: EarningsResult | null;
  kind: "upcoming" | "paid";
  billId?: string;
  period?: string;
}) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const navigate = useNavigate();
  const [dates, setDates] = useState<DateFilter>("all");
  const [listingId, setListingId] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>("all");
  const source = useMemo(() => (desk?.ok ? (kind === "paid" ? desk.paid : desk.upcoming) : []), [desk, kind]);
  const listings = useMemo(() => listingChoices(source), [source]);
  const filtered = filterBills(source, { dates, listingId, type }).filter((bill) => !period || bill.period === period);
  const total = sumField(filtered, "netCents");
  const open = filtered.find((bill) => bill.id === billId) ?? source.find((bill) => bill.id === billId) ?? null;
  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  const title = kind === "paid" ? t("earningsPaid") : t("earningsUpcoming");
  const closeBill = () => {
    void navigate({ to: "/menu", search: { screen: "earnings", view: kind, period } });
  };

  if (!desk?.ok) {
    return (
      <main className="ke-gutter mx-auto w-full max-w-lg pb-10 pt-4">
        <EarningsHeader title={title} back={{ screen: "earnings" }} />
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      </main>
    );
  }

  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-28 pt-4" data-ke="earnings-list" data-kind={kind}>
      <EarningsHeader title={title} back={{ screen: "earnings" }} />
      <div className="sticky top-0 z-10 -mx-1 mt-4 flex gap-2 overflow-x-auto bg-bg px-1 py-2" data-ke="earnings-filters">
        <FilterChip label={dateLabel(dates, t)} active={dates !== "all"} onClick={() => setDates(cycleDate(dates))} />
        <FilterChip
          label={listingId ? listings.find((item) => item.id === listingId)?.name || t("earningsAllListings") : t("earningsAllListings")}
          active={listingId != null}
          onClick={() => setListingId(cycleListing(listingId, listings))}
        />
        <FilterChip label={type === "all" ? t("earningsAllTypes") : t(type === "tuition" ? "earningsTuition" : "earningsExtraFees")} active={type !== "all"} onClick={() => setType(cycleType(type))} />
      </div>
      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{source.length === 0 ? (kind === "paid" ? t("earningsPaidEmpty") : t("earningsUpcomingEmpty")) : t("earningsNoMatch")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {filtered.map((bill) => (
            <li key={bill.id}>
              <Link
                to="/menu"
                search={{ screen: "earnings", view: kind, bill: bill.id, period }}
                className="flex min-h-14 items-center gap-3 py-3 touch-manipulation"
                data-ke="earnings-row"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{formatEarnDate(bill.paidAt || bill.dueAt || bill.payoutOn, french) || bill.period}</span>
                  <span className="block text-sm text-muted">{bill.status === "paid" ? t("earningsSent") : t("earningsScheduled")}</span>
                </span>
                {bill.netCents != null ? <span className="tabular-nums">{cad(bill.netCents)}</span> : null}
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-lg items-center justify-between gap-3 border-t border-border bg-bg px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [[data-channel=app]_&]:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <p className="text-sm">
          <span className="block text-muted">{t("earningsFiltered")}</span>
          <span className="font-semibold tabular-nums">{total == null ? "" : cad(total)}</span>
        </p>
        <button
          type="button"
          data-ke="earnings-export"
          className="min-h-11 rounded-full border border-fg px-4 text-sm font-semibold touch-manipulation"
          onClick={() => downloadCsv(kind, billsCsv(filtered, "netCents"))}
        >
          {t("earningsExportCsv")}
        </button>
      </div>
      {open ? <EarningsBillSheet bill={open} audience="centre" onClose={closeBill} /> : null}
    </main>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function cycleDate(current: DateFilter): DateFilter {
  if (current === "all") return "this-month";
  if (current === "this-month") return "last-month";
  if (current === "last-month") return "this-year";
  return "all";
}

function cycleListing(current: string | null, listings: Array<{ id: string; name: string }>): string | null {
  if (!listings.length) return null;
  if (!current) return listings[0]?.id ?? null;
  const index = listings.findIndex((item) => item.id === current);
  return index < 0 || index === listings.length - 1 ? null : (listings[index + 1]?.id ?? null);
}

function cycleType(current: TypeFilter): TypeFilter {
  if (current === "all") return "tuition";
  if (current === "tuition") return "extra";
  return "all";
}

function downloadCsv(kind: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kidease-${kind}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function dateLabel(dates: DateFilter, t: (key: CopyKey) => string): string {
  if (dates === "this-month") return t("earningsThisMonth");
  if (dates === "last-month") return t("earningsLastMonth");
  if (dates === "this-year") return t("earningsThisYear");
  return t("earningsAllDates");
}
