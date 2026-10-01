import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { listRankingMarket } from "@/lib/server/ranking-market";
import { rankingMarketCsv, type MarketRow } from "@/lib/ranking/market";
import { useCopy } from "@/lib/use-copy";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/admin-ranking")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listRankingMarket(),
  head: () => ({
    meta: [
      { title: "Demand and supply · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RankingMarketPage,
});

function downloadCsv(rows: MarketRow[]) {
  const blob = new Blob([rankingMarketCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kidease-demand-supply.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function RankingMarketPage() {
  const rows = Route.useLoaderData();
  const { t } = useCopy();
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">{t("rankingMarketTitle")}</h1>
            <p className="mt-2 max-w-prose text-sm text-muted">{t("rankingMarketLead")}</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
            onClick={() => downloadCsv(rows)}
            disabled={!rows.length}
          >
            {t("rankingMarketExport")}
          </button>
        </div>
        {rows.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">{t("rankingMarketCity")}</th>
                  <th className="px-2 py-2 font-medium">{t("rankingMarketAge")}</th>
                  <th className="px-2 py-2 font-medium">{t("rankingMarketAsOf")}</th>
                  <th className="px-2 py-2 font-medium">{t("rankingMarketSearches")}</th>
                  <th className="px-2 py-2 font-medium">{t("rankingMarketSaves")}</th>
                  <th className="px-2 py-2 font-medium">{t("rankingMarketSpots")}</th>
                  <th className="px-2 py-2 font-medium">{t("rankingMarketListings")}</th>
                  <th className="px-2 py-2 font-medium">{t("rankingMarketOpenings")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: MarketRow) => (
                  <tr key={`${row.asOf}-${row.city}-${row.ageGroup}`} className="border-b border-border">
                    <td className="px-2 py-2">{row.city}</td>
                    <td className="px-2 py-2">{row.ageGroup}</td>
                    <td className="px-2 py-2 tabular-nums">{row.asOf}</td>
                    <td className="px-2 py-2 tabular-nums">{row.searches}</td>
                    <td className="px-2 py-2 tabular-nums">{row.saves}</td>
                    <td className="px-2 py-2 tabular-nums">{row.spotRequests}</td>
                    <td className="px-2 py-2 tabular-nums">{row.listings}</td>
                    <td className="px-2 py-2 tabular-nums">{row.confirmedOpenings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">{t("rankingMarketEmpty")}</p>
        )}
      </main>
    </Shell>
  );
}
