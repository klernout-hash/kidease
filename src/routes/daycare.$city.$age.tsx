import { createFileRoute, notFound } from "@tanstack/react-router";
import { JsonLd } from "@/components/json-ld";
import { CityHubNotFoundPage } from "@/components/page-not-found";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ageVacancyCopy, ageVacancyMeta } from "@/lib/age-vacancy-copy";
import { ageVacancyPath, type AgeVacancyPage } from "@/lib/age-vacancy";
import { loadAgeVacancyPage } from "@/lib/server/age-vacancy";
import { pageSeoHead } from "@/lib/page-seo";
import { isFrPath } from "@/lib/locale-path";
import { SITEMAP_ORIGIN } from "@/lib/sitemap";
import { useCopy } from "@/lib/use-copy";
import { useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/daycare/$city/$age")({
  loader: async ({ params }) => {
    const page = await loadAgeVacancyPage(params.city, params.age);
    if (!page) throw notFound();
    return page;
  },
  notFoundComponent: CityHubNotFoundPage,
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Daycare · KidEase" }] };
    const meta = ageVacancyMeta("en", loaderData);
    return pageSeoHead({ ...meta, path: ageVacancyPath(loaderData.citySlug, loaderData.age) });
  },
  component: EnglishAgeVacancyPage,
});

function EnglishAgeVacancyPage() {
  const page = Route.useLoaderData();
  return <AgeVacancyView page={page} />;
}

export function AgeVacancyView({ page }: { page: AgeVacancyPage }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { locale } = useCopy();
  const fr = isFrPath(pathname) || locale === "fr";
  const copy = ageVacancyCopy(fr ? "fr" : "en");
  const searchHref = `${fr ? "/fr/search" : "/search"}?q=${encodeURIComponent(page.city)}`;
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: copy.title(page.city, page.age),
    numberOfItems: page.centres,
    itemListElement: page.listings.map((hit, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: hit.name,
      url: `${SITEMAP_ORIGIN}/daycare/${hit.slug}`,
    })),
  };

  return (
    <Shell bare>
      <JsonLd json={JSON.stringify(list)} />
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.title(page.city, page.age)}</h1>
        <p className="mt-4 text-lg text-muted">{copy.what}</p>
        <p className="mt-2 text-muted">{copy.why(page.age)}</p>
        <p className="mt-2 text-muted">{copy.lead}</p>
        <p className="mt-4">
          <Button asChild>
            <a href={searchHref}>{copy.search(page.city)}</a>
          </Button>
        </p>
        <p className="mt-6 text-sm text-muted">
          {copy.centres(page.centres)} · {copy.spots(page.openSpots)}
          {page.averageFee != null ? ` · ${copy.fee(page.averageFee)}` : ""}
        </p>
        {page.averageFee == null ? <p className="mt-2 text-sm text-muted">{copy.noFee}</p> : null}
        <ul className="mt-6 divide-y divide-border">
          {page.listings.map((hit) => (
            <li key={hit.id} className="py-4">
              <a className="font-medium text-fg underline-offset-4 hover:underline" href={`/daycare/${hit.slug}`}>
                {hit.name}
              </a>
              <p className="mt-1 text-sm text-muted">
                {page.city}, {page.province} · {copy.ages(hit.ageMinMonths, hit.ageMaxMonths)}
                {hit.spots ? ` · ${hit.spots}` : ""}
                {hit.fee != null ? ` · $${hit.fee}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}
