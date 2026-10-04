import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { CityHubNotFoundPage } from "@/components/page-not-found";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { cityHubs } from "@/lib/city-hub-data";
import {
  cityHubChipLabel,
  cityHubCityName,
  cityHubDefBySlug,
  cityHubMapSearchQuery,
  cityHubUrl,
  type CityHubListing,
  type CityHubSnapshot,
} from "@/lib/city-hubs";
import { breadcrumbJsonLdScript, faqPageJsonLdScript } from "@/lib/page-seo";
import { cityHubHead, loadCityHub } from "@/lib/city-hub-page";
import { isFrPath, localePath } from "@/lib/locale-path";
import { provinceAbbrev } from "@/lib/province-phrase";
import { formatCount } from "@/lib/utils";
import { SITEMAP_ORIGIN, isSafeSitemapSlug } from "@/lib/sitemap";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/daycare/city/$city")({
  loader: ({ params }) => loadCityHub(params.city),
  notFoundComponent: CityHubNotFoundPage,
  head: ({ loaderData }) => cityHubHead(loaderData, "en"),
  component: EnglishCityHubPage,
});

function EnglishCityHubPage() {
  const hub = Route.useLoaderData();
  return <CityHubPage hub={hub} />;
}

export function CityHubPage({ hub }: { hub: CityHubSnapshot }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onFr = isFrPath(pathname);
  const { t, locale } = useCopy();
  const fr = onFr || locale === "fr";
  const def = cityHubDefBySlug(hub.slug);
  const cityName = def ? cityHubCityName(def, locale) : hub.city;
  const mapSearch = def ? cityHubMapSearchQuery(def) : `${hub.city}, ${hub.province}`;
  const otherHubs = cityHubs().filter((item) => item.slug !== hub.slug);
  const faqItems = [
    {
      q: fr
        ? `KidEase liste-t-il des nounous à ${cityName}?`
        : `Does KidEase list nannies in ${cityName}?`,
      a: fr
        ? "Non. KidEase répertorie seulement les centres, nurseries et milieux familiaux permis par la province ou le territoire. Pas de nounous, de gardiennes non permises, ni de babysitting."
        : "No. KidEase lists provincially or territorially licensed centres, nurseries, and homes only: not nannies, sitters, or unlicensed care.",
    },
    {
      q: fr ? "Comment obtenir une subvention?" : "How do childcare subsidies work?",
      a: fr
        ? `KidEase n’accepte aucune demande et n’héberge aucun formulaire. Consultez le site officiel : ${hub.subsidyLabel}.`
        : `KidEase does not process applications or host government forms. Apply on the official site: ${hub.subsidyLabel}.`,
    },
    {
      q: fr ? "Faut-il un compte pour parcourir ces fiches?" : "Do I need an account to browse these listings?",
      a: fr
        ? "Non. La recherche et l’ouverture des fiches sont gratuites. Connectez-vous seulement pour enregistrer, demander une place ou écrire à un centre En ligne."
        : "No. Searching and opening listings is free. Sign in only to save a centre, request a spot, or message a live listing.",
    },
  ];
  const crumbs = [
    { name: "KidEase", url: `${SITEMAP_ORIGIN}/` },
    { name: fr ? `Garderies à ${cityName}` : `Daycare in ${cityName}`, url: cityHubUrl(hub.slug) },
  ];

  return (
    <Shell bare>
      <JsonLd json={breadcrumbJsonLdScript(crumbs)} />
      <JsonLd json={faqPageJsonLdScript(faqItems)} />
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <nav className="text-sm text-muted">
          <Link to={localePath("/", fr ? "fr" : "en")} className="hover:text-fg hover:underline">
            KidEase
          </Link>
          <span className="mx-1.5" aria-hidden>
            /
          </span>
          <span>{fr ? `Garderies à ${cityName}` : `Daycare in ${cityName}`}</span>
        </nav>
        <p className="mt-6 text-sm font-semibold tracking-wide text-primary">{t("cityHubKicker")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">
          {fr
            ? `Garderies permises à ${cityName}, ${provinceAbbrev(hub.province, "fr")}`
            : `Licensed daycare in ${cityName}, ${hub.province}`}
        </h1>
        <p className="mt-6 text-lg text-muted">
          {fr
            ? `KidEase répertorie ${formatCount(hub.count, "fr")} établissements permis à ${cityName}: centres, prématernelles et milieux familiaux. La recherche est gratuite. Nous ne listons pas les nounous ni les gardiennes.`
            : `KidEase lists ${formatCount(hub.count, "en")} licensed centres, nurseries, and homes in ${cityName}. Search is free. We do not list nannies or sitters.`}
        </p>
        <p className="mt-4 text-sm text-muted">
          <Link
            to={fr ? "/fr/search" : "/search"}
            search={{ q: mapSearch }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("cityHubSearch")}
          </Link>
          {" · "}
          <Link to={localePath("/benefits", fr ? "fr" : "en")} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("benefitsShort")}
          </Link>
          {" · "}
          <Link to={localePath("/faq", fr ? "fr" : "en")} className="font-medium text-primary underline-offset-4 hover:underline">
            FAQ
          </Link>
        </p>

        <h2 className="mt-12 text-2xl">
          {fr ? `Établissements à ${cityName}` : `Licensed listings in ${cityName}`}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {hub.listings.length < hub.count
            ? fr
              ? `${formatCount(hub.listings.length, "fr")} fiches ci-dessous · ${formatCount(hub.count, "fr")} au total dans le répertoire.`
              : `${formatCount(hub.listings.length, "en")} listings below · ${formatCount(hub.count, "en")} in the full directory.`
            : fr
              ? `${formatCount(hub.count, "fr")} fiches permises.`
              : `${formatCount(hub.count, "en")} licensed listings.`}
        </p>
        <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {hub.listings.filter((listing: CityHubListing) => isSafeSitemapSlug(listing.slug)).map((listing: CityHubListing) => (
            <li key={listing.slug}>
              <Link
                to={fr ? "/fr/daycare/$slug" : "/daycare/$slug"}
                params={{ slug: listing.slug }}
                className="flex min-h-11 items-center px-4 py-3 text-sm font-medium hover:bg-bg"
              >
                {listing.name}
              </Link>
            </li>
          ))}
        </ul>
        {hub.listings.length < hub.count ? (
          <p className="mt-4 text-sm">
            <Link
              to={fr ? "/fr/search" : "/search"}
              search={{ q: mapSearch }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("cityHubSeeAll")}
            </Link>
          </p>
        ) : null}

        <section className="mt-12">
          <h2 className="text-2xl">{t("cityHubFaq")}</h2>
          <ul className="mt-6 space-y-6">
            {faqItems.map((item) => (
              <li key={item.q} className="rounded-xl bg-surface p-5 ring-1 ring-border">
                <h3 className="text-lg font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.a}</p>
              </li>
            ))}
          </ul>
          <a
            href={hub.subsidyUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
          >
            {hub.subsidyLabel}
            <ArrowUpRight className="size-4" />
          </a>
        </section>

        {otherHubs.length ? (
          <section className="mt-12">
            <h2 className="text-2xl">{t("browseCities")}</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {otherHubs.map((item) => {
                const otherDef = cityHubDefBySlug(item.slug);
                return (
                  <li key={item.slug}>
                    <Link
                      to={fr ? "/fr/daycare/city/$city" : "/daycare/city/$city"}
                      params={{ city: item.slug }}
                      className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-surface px-3 text-sm font-medium ring-1 ring-border hover:bg-bg"
                    >
                      {otherDef ? cityHubChipLabel(otherDef, locale) : item.city}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </Shell>
  );
}
