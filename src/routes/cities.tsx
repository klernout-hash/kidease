import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { citiesIndexGroups } from "@/lib/cities-index";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/cities")({
  head: () =>
    pageSeoHead({
      title: "Cities in Canada · KidEase",
      description: "Licensed daycare directories grouped by province across Canada.",
      path: "/cities",
    }),
  component: CitiesPage,
});

export function CitiesPage() {
  const { t, locale } = useCopy();
  const groups = citiesIndexGroups(locale);
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-10 md:py-14" data-ke="cities-index">
        <h1 className="text-[clamp(1.75rem,4vw,2.5rem)]">{t("browseCities")}</h1>
        <p className="mt-3 max-w-xl text-base text-muted">{t("citiesLead")}</p>
        <div className="mt-10 space-y-8">
          {groups.map((group) => (
            <section key={group.code} aria-labelledby={`province-${group.code}`}>
              <h2 id={`province-${group.code}`} className="text-xl">
                {group.name}
              </h2>
              {group.cities.length ? (
                <ul className="mt-2">
                  {group.cities.map((city) => (
                    <li key={city.slug}>
                      <Link
                        to="/daycare/city/$city"
                        params={{ city: city.slug }}
                        className="inline-flex min-h-11 items-center text-base font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {city.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">{t("citiesEmpty")}</p>
              )}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </Shell>
  );
}
