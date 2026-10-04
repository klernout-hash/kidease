import { Link } from "@tanstack/react-router";
import { JsonLd } from "@/components/json-ld";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { AGE_BANDS, vacancyIndexJsonLd, type VacancyIndex } from "@/lib/vacancy-index";
import { vacancyFeeLabel, vacancyIndexCopy, vacancyMonthLabel } from "@/lib/vacancy-index-copy";

export function VacancyIndexPage({
  locale,
  index,
  failed,
}: {
  locale: string;
  index: VacancyIndex | null;
  failed: boolean;
}) {
  const copy = vacancyIndexCopy(locale);
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8 md:py-12">
        {index ? <JsonLd json={vacancyIndexJsonLd(index, locale)} /> : null}
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-[clamp(1.75rem,5vw,3rem)] leading-tight">{copy.title}</h1>
        {index ? (
          <p className="mt-2 text-sm text-muted">{vacancyMonthLabel(index.monthKey, locale)}</p>
        ) : null}
        <p className="mt-4 text-lg text-muted">{copy.what}</p>
        <p className="mt-2 text-muted">{copy.why}</p>
        <p className="mt-2 text-muted">{copy.next}</p>
        <div className="mt-6">
          {locale === "fr" ? (
            <Button asChild size="lg">
              <Link to="/fr/search">{copy.search}</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link to="/search">{copy.search}</Link>
            </Button>
          )}
        </div>

        {failed || !index ? (
          <div className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border">
            <p className="text-sm text-muted">{copy.error}</p>
            <p className="mt-3">
              <Link to={locale === "fr" ? "/fr" : "/"} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
                {copy.home}
              </Link>
            </p>
          </div>
        ) : index.centresWithAges === 0 ? (
          <p className="mt-8 text-sm text-muted">{copy.empty}</p>
        ) : (
          <div className="mt-8 space-y-6">
            {index.provinces.map((province) => (
              <section key={province.code} className="rounded-xl bg-surface p-4 ring-1 ring-border" aria-labelledby={`vac-${province.code}`}>
                <h2 id={`vac-${province.code}`} className="text-xl font-semibold">
                  {locale === "fr" ? province.nameFr : province.nameEn}
                </h2>
                <ul className="mt-3 divide-y divide-border">
                  {AGE_BANDS.map((band) => {
                    const cell = province.ages[band];
                    return (
                      <li key={band} className="py-3 text-sm">
                        <p className="font-medium">{copy.ages[band]}</p>
                        <p className="mt-1 text-muted">
                          {copy.centres}: {cell.centres}
                        </p>
                        <p className="text-muted">
                          {copy.openSpots}: {cell.openSpots}
                        </p>
                        <p className="text-muted">
                          {copy.averageFee}: {cell.averageFee == null ? copy.noFee : vacancyFeeLabel(cell.averageFee, locale)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <section className="mt-10" aria-labelledby="vacancy-method">
          <h2 id="vacancy-method" className="text-2xl">{copy.methodTitle}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
            {copy.methods.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </Shell>
  );
}
