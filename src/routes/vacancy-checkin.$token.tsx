import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { getVacancyCheckin } from "@/lib/server/vacancy-checkin";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/vacancy-checkin/$token")({
  validateSearch: (search: Record<string, unknown>) => {
    const saved = search.saved;
    if (saved === "0" || saved === "1" || saved === "2" || saved === "3plus") return { saved };
    return {};
  },
  loader: async ({ params }) => getVacancyCheckin({ data: params.token }),
  head: () => ({
    meta: [
      { title: "Open spots this week · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VacancyCheckinPage,
});

function VacancyCheckinPage() {
  const { token } = Route.useParams();
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  const { t } = useCopy();
  const choices = [
    { value: "0", label: t("vacancyCheckinZero") },
    { value: "1", label: t("vacancyCheckinOne") },
    { value: "2", label: t("vacancyCheckinTwo") },
    { value: "3", label: t("vacancyCheckinThree") },
  ] as const;

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-8">
        <p className="text-sm text-subtle">KidEase</p>
        <h1 className="mt-2 font-display text-3xl tracking-[-0.03em] text-balance">{t("vacancyCheckinTitle")}</h1>
        {!data.ok ? (
          <div className="mt-4">
            <p className="text-sm text-muted">{t("vacancyCheckinInvalid")}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/">{t("vacancyCheckinHome")}</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/contact">{t("vacancyCheckinContact")}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm font-medium">{data.name}</p>
            <p className="mt-2 text-sm text-muted">{t("vacancyCheckinLead")}</p>
            <p className="mt-2 text-sm">{t("vacancyCheckinViews").replace("{n}", String(data.weeklyViews))}</p>
            {search.saved ? (
              <p className="mt-3 text-sm font-medium" role="status">
                {t("vacancyCheckinSaved")}{" "}
                {search.saved === "0" ? t("vacancyCheckinZeroNote") : t("vacancyCheckinKeepNote")}
              </p>
            ) : null}
            <form method="post" action="/api/vacancy-checkin" className="mt-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm font-medium">{t("vacancyCheckinChoose")}</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {choices.map((choice) => (
                  <Button
                    key={choice.value}
                    type="submit"
                    name="choice"
                    value={choice.value}
                    variant="secondary"
                    className="min-h-11 min-w-11"
                  >
                    {choice.label}
                  </Button>
                ))}
              </div>
            </form>
          </div>
        )}
      </main>
    </Shell>
  );
}
