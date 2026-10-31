import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";
import { provinceLocativeFr } from "@/lib/province-phrase";
import { jurisdiction } from "@/lib/province-registry";
import { loadVacancyIndex, type VacancyIndexPage as VacancyIndexData } from "@/lib/server/vacancy-index";
import type { PublicAgeBand } from "@/lib/public-programs";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { formatCount } from "@/lib/utils";
import { parseVacancyProvince, type FreshnessCounts } from "@/lib/vacancy-history";
import { vacancyProvinceCopy } from "@/lib/vacancy-province-copy";

const BAND_LABEL: Record<PublicAgeBand, CopyKey> = {
  infant: "infant",
  toddler: "toddler",
  preschool: "preschool",
  "school-age": "schoolAge",
};

export const Route = createFileRoute("/vacancy-index")({
  validateSearch: (search: Record<string, unknown>) => ({
    province: parseVacancyProvince(search.province),
  }),
  loaderDeps: ({ search }) => ({ province: search.province }),
  loader: ({ deps }) => loadVacancyIndex(deps.province),
  head: () =>
    pageSeoHead({
      title: "Open spots by province · KidEase",
      description:
        "Public KidEase listings by province and age. Confirmed open spots only. Fees are not on this page.",
      path: "/vacancy-index",
    }),
  component: VacancyIndexRoute,
});

function formatCounted(iso: string, locale: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function VacancyIndexRoute() {
  const data = Route.useLoaderData();
  return <VacancyIndexView data={data} />;
}

function centreLine(n: number, locale: string, template: string): string {
  const formatted = formatCount(n, locale);
  if (locale === "fr" && Math.abs(n) < 2) return `${formatted} centre`;
  return template.replace("{n}", formatted);
}

function spotText(value: number | null): string {
  return value == null ? "-" : String(value);
}

function ProvinceFreshness({ counts, locale }: { counts: FreshnessCounts; locale: "en" | "fr" }) {
  const copy = vacancyProvinceCopy(locale);
  const rows = [
    [copy.fresh, counts.fresh],
    [copy.aging, counts.aging],
    [copy.stale, counts.stale],
    [copy.unknown, counts.unknown],
  ] as const;
  return (
    <ul className="mt-3 space-y-1 text-sm text-muted" data-ke="vacancy-freshness">
      {rows.map(([label, n]) => (
        <li key={label}>
          {label}: {formatCount(n, locale)}
        </li>
      ))}
    </ul>
  );
}

export function VacancyIndexView({ data }: { data: VacancyIndexData }) {
  const { t, locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const extra = vacancyProvinceCopy(lang);
  const focus = data.focus ? jurisdiction(data.focus) : null;
  const focusName = focus ? (lang === "fr" ? focus.nameFr : focus.nameEn) : "";
  const counted = t("vacancyIndexCounted").replace("{date}", formatCounted(data.countedOn, locale));
  const provinces = focus ? data.provinces.filter((row) => row.code === focus.code) : data.provinces;

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-10 md:py-14" data-ke="vacancy-index">
        <p className="text-sm font-semibold tracking-wide text-primary">KidEase</p>
        <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)]">
          {focus ? extra.pageTitle(focusName) : t("vacancyIndexTitle")}
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted">{focus ? extra.lead : t("vacancyIndexLead")}</p>
        <p className="mt-2 text-sm text-muted">{counted}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to={localePath("/search", locale)} search={focus ? { q: focusName } : undefined}>
              {focus ? extra.backSearch : t("vacancyIndexCta")}
            </Link>
          </Button>
          <Link
            to={localePath("/help", locale)}
            className="inline-flex min-h-11 min-w-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            {extra.help}
          </Link>
          {focus ? (
            <Link
              to={localePath("/vacancy-index", locale)}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {extra.allProvinces}
            </Link>
          ) : null}
        </div>
        {focus && data.freshnessByCode?.[focus.code] ? (
          <ProvinceFreshness counts={data.freshnessByCode[focus.code]} locale={lang} />
        ) : null}
        {focus ? (
          <p className="mt-3 max-w-xl text-sm text-muted" data-ke="vacancy-official">
            {data.official
              ? extra.official(
                  formatCount(data.official.openings, locale),
                  formatCount(data.official.centres, locale),
                  formatCounted(data.official.fetchedAt.slice(0, 10), locale),
                )
              : extra.officialMissing}
          </p>
        ) : null}

        {data.totalCentres === 0 ? (
          <div className="mt-10 rounded-xl bg-surface p-5 ring-1 ring-border">
            <p className="text-base">{t("vacancyIndexEmpty")}</p>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <Link to={localePath("/", locale)} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
                {t("vacancyIndexHome")}
              </Link>
              <Link to={localePath("/contact", locale)} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
                {t("vacancyIndexContact")}
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            {provinces.map((province) => {
              const place = jurisdiction(province.code);
              const name = place ? (locale === "fr" ? place.nameFr : place.nameEn) : province.code;
              return (
                <section key={province.code} aria-labelledby={`vacancy-${province.code}`}>
                  <h2 id={`vacancy-${province.code}`} className="text-xl">
                    {name}
                  </h2>
                  <p className="mt-1 text-sm tabular-nums text-muted">
                    {centreLine(province.centres, locale, t("vacancyIndexCentres"))}
                  </p>
                  {province.agesUnknown > 0 ? (
                    <p className="mt-1 text-sm text-muted">
                      {t("vacancyIndexAgesUnknown").replace("{n}", formatCount(province.agesUnknown, locale))}
                    </p>
                  ) : null}
                  <ul className="mt-3 divide-y divide-border">
                    {province.bands.map((band) => {
                      const spots = !band.spotsTracked
                        ? t("vacancyIndexSpotsUnstored")
                        : band.openSpots == null
                          ? t("vacancyIndexSpotsUnknown")
                          : t("vacancyIndexSpots").replace("{n}", formatCount(band.openSpots, locale));
                      return (
                        <li key={band.band} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                          <span className="font-medium">{t(BAND_LABEL[band.band])}</span>
                          <span className="text-sm text-muted tabular-nums">
                            {centreLine(band.centres, locale, t("vacancyIndexCentres"))}
                            {" · "}
                            {spots}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    <Link
                      to={localePath("/search", locale)}
                      search={{ q: name }}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {t("vacancyIndexSearchProvince").replace("{name}", locale === "fr" ? provinceLocativeFr(province.code) : name)}
                    </Link>
                    {data.provincePages && !focus ? (
                      <Link
                        to={localePath("/vacancy-index", locale)}
                        search={{ province: province.code.toLowerCase() }}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {extra.provinceLink}
                      </Link>
                    ) : null}
                  </p>
                  {!focus && data.freshnessByCode?.[province.code] ? (
                    <ProvinceFreshness counts={data.freshnessByCode[province.code]} locale={lang} />
                  ) : null}
                </section>
              );
            })}
            {data.unplaced > 0 ? (
              <p className="text-sm text-muted">{t("vacancyIndexUnplaced").replace("{n}", formatCount(data.unplaced, locale))}</p>
            ) : null}
          </div>
        )}

        {focus ? (
          <section className="mt-10" aria-labelledby="vacancy-history" data-ke="vacancy-history">
            <h2 id="vacancy-history" className="text-xl">
              {extra.historyTitle}
            </h2>
            {data.history.length ? (
              <ul className="mt-3 divide-y divide-border">
                {data.history.map((row) => {
                  const label =
                    row.source === "edit" ? extra.historyEdit : row.source === "import" ? extra.historyImport : extra.historyConfirm;
                  return (
                    <li key={row.id} className="py-3">
                      <p className="font-medium">{row.name}</p>
                      <p className="mt-1 text-sm text-muted">
                        {label}
                        {" · "}
                        {formatCounted(row.at.slice(0, 10), locale)}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-muted">
                        {extra.spots(spotText(row.infant), spotText(row.toddler), spotText(row.preschool))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">{extra.historyEmpty}</p>
            )}
          </section>
        ) : null}

        <section className="mt-12" aria-labelledby="vacancy-method">
          <h2 id="vacancy-method" className="text-xl">
            {t("vacancyIndexMethodT")}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
            <li>{t("vacancyIndexMethod1")}</li>
            <li>{t("vacancyIndexMethod2")}</li>
            <li>{t("vacancyIndexMethod3")}</li>
            <li>{t("vacancyIndexMethod4")}</li>
            <li>{t("vacancyIndexMethod5")}</li>
            <li>{t("vacancyIndexMethod6")}</li>
            <li>{t("vacancyIndexMethod7")}</li>
          </ul>
          <p className="mt-4">
            <Link to="/cities" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t("browseCities")}
            </Link>
          </p>
        </section>
      </main>
    </Shell>
  );
}
