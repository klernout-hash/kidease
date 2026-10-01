import { createFileRoute, Link } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { listAiUsage } from "@/lib/server/ai-usage";
import { formatUsdMicros } from "@/lib/ai/cost";
import { PhotoCheckReview } from "@/components/photo-check-review";
import { useCopy } from "@/lib/use-copy";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/admin-ai")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listAiUsage(),
  head: () => ({
    meta: [
      { title: "AI usage · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AiUsagePage,
});

function AiUsagePage() {
  const rows = Route.useLoaderData();
  const { t } = useCopy();
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl">{t("aiUsageTitle")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">{t("aiUsageLead")}</p>
        {rows.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">{t("aiUsageFeature")}</th>
                  <th className="px-2 py-2 font-medium">{t("aiUsageCalls")}</th>
                  <th className="px-2 py-2 font-medium">{t("aiUsageFailures")}</th>
                  <th className="px-2 py-2 font-medium">{t("aiUsageRate")}</th>
                  <th className="px-2 py-2 font-medium">{t("aiUsageCost")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.feature} className="border-b border-border">
                    <td className="px-2 py-2">{row.feature}</td>
                    <td className="px-2 py-2 tabular-nums">{row.calls}</td>
                    <td className="px-2 py-2 tabular-nums">{row.failures}</td>
                    <td className="px-2 py-2 tabular-nums">{Math.round(row.failureRate * 100)}%</td>
                    <td className="px-2 py-2 tabular-nums">{formatUsdMicros(row.costMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">{t("aiUsageEmpty")}</p>
        )}
        <p className="mt-6">
          <Link to="/admin" className="text-sm font-medium text-primary">
            {t("aiUsageBack")}
          </Link>
        </p>
        <PhotoCheckReview />
      </main>
    </Shell>
  );
}
