import { createFileRoute } from "@tanstack/react-router";
import { SafeRouteError } from "@/components/safe-error-boundary";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadRankingMarketDesk } from "@/lib/server/admin-listings-desk";
import { rankingMarketCsv, type MarketRow } from "@/lib/ranking/market";
import { useCopy } from "@/lib/use-copy";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/admin-ranking")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadRankingMarketDesk(),
  errorComponent: SafeRouteError,
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
  const data = Route.useLoaderData();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const cells = Array.isArray(data.cells) ? data.cells : null;
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  const max = cells?.reduce((peak, cell) => Math.max(peak, Number(cell.demand) || 0, Number(cell.supply) || 0), 1) ?? 1;
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">{t("rankingMarketTitle")}</h1>
            <p className="mt-2 max-w-prose text-sm text-muted">{t("rankingMarketLead")}</p>
            {data.ok ? null : (
              <p className="mt-4 max-w-prose text-sm text-muted" role="alert">
                {fr
                  ? "Ce rapport n'est pas disponible pour le moment."
                  : "This report is not available right now."}{" "}
                <a href="/admin" className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline">
                  {fr ? "Retour à l'admin" : "Back to Admin"}
                </a>
              </p>
            )}
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
        {cells ? (
          <section className="mt-8" data-ke="admin-demand-map">
            <h2 className="font-display text-2xl">{t("adminDemandTitle")}</h2>
            <p className="mt-2 max-w-prose text-sm text-muted">{t("adminDemandLead")}</p>
            <ul className="mt-4 space-y-3">
              {cells.map((cell) => (
                <li key={`${cell.city}-${cell.ageGroup}`}>
                  <p className="text-sm font-medium">
                    {cell.city} · {cell.ageGroup}
                  </p>
                  <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-surface ring-1 ring-border" aria-hidden="true">
                    <div className="h-full bg-primary" style={{ width: `${Math.max(4, Math.round((cell.demand / max) * 100))}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {cell.demand} / {cell.supply}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
