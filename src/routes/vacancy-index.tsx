import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { headChromeLocale } from "@/lib/head-locale";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead, UNPAIRED_FR_SEO } from "@/lib/page-seo";
import { provinceLocativeFr } from "@/lib/province-phrase";
import { jurisdiction } from "@/lib/province-registry";
import { loadVacancyIndex, type VacancyIndexPage as VacancyIndexData } from "@/lib/server/vacancy-index";
import type { PublicAgeBand } from "@/lib/public-programs";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { formatCount } from "@/lib/utils";

const BAND_LABEL: Record<PublicAgeBand, CopyKey> = {
  infant: "infant",
  toddler: "toddler",
  preschool: "preschool",
  "school-age": "schoolAge",
};

export const Route = createFileRoute("/vacancy-index")({
  loader: () => loadVacancyIndex(),
  head: ({ matches }) => {
    if (headChromeLocale(matches) === "fr") {
      return pageSeoHead({ ...UNPAIRED_FR_SEO.vacancy, path: "/vacancy-index" });
    }
    return pageSeoHead({
      title: "Open spots by province · KidEase",
      description:
        "Public KidEase listings by province and age. Confirmed open spots only. Fees are not on this page.",
      path: "/vacancy-index",
    });
  },
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

export function VacancyIndexView({ data }: { data: VacancyIndexData }) {
  const { t, locale } = useCopy();
  const counted = t("vacancyIndexCounted").replace("{date}", formatCounted(data.countedOn, locale));

  return (
    <Shell bare>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-10 md:py-14" data-ke="vacancy-index">
        <p className="text-sm font-semibold tracking-wide text-primary">KidEase</p>
        <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)]">{t("vacancyIndexTitle")}</h1>
        <p className="mt-3 max-w-xl text-base text-muted">{t("vacancyIndexLead")}</p>
        <p className="mt-2 text-sm text-muted">{counted}</p>
        <div className="mt-6">
          <Button asChild size="lg">
            <Link to={localePath("/search", locale)}>{t("vacancyIndexCta")}</Link>
          </Button>
        </div>

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
            {data.provinces.map((province) => {
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
                  <Link
                    to={localePath("/search", locale)}
                    search={{ q: name }}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("vacancyIndexSearchProvince").replace("{name}", locale === "fr" ? provinceLocativeFr(province.code) : name)}
                  </Link>
                </section>
              );
            })}
            {data.unplaced > 0 ? (
              <p className="text-sm text-muted">{t("vacancyIndexUnplaced").replace("{n}", formatCount(data.unplaced, locale))}</p>
            ) : null}
          </div>
        )}

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
      <SiteFooter />
    </Shell>
  );
}
