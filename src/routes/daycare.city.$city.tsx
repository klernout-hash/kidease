import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { cityHubBySlug, cityHubs } from "@/lib/city-hub-data";
import { cityHubChipLabel, cityHubCityName, cityHubDefBySlug, cityHubPath, cityHubUrl } from "@/lib/city-hubs";
import {
  breadcrumbJsonLdScript,
  faqPageJsonLdScript,
  pageSeoHead,
} from "@/lib/page-seo";
import { SITEMAP_ORIGIN } from "@/lib/sitemap";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/daycare/city/$city")({
  loader: ({ params }) => {
    const hub = cityHubBySlug(params.city);
    if (!hub) throw redirect({ to: "/search" });
    return hub;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const title = `Licensed daycare in ${loaderData.city}, ${loaderData.province} · KidEase`;
    const description = `Browse ${loaderData.count} licensed childcare centres in ${loaderData.city}, ${loaderData.province}. Free to search on KidEase — no nannies or sitters.`;
    return pageSeoHead({
      title,
      description,
      path: cityHubPath(loaderData.slug),
    });
  },
  component: CityHubPage,
});

function CityHubPage() {
  const hub = Route.useLoaderData();
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  const def = cityHubDefBySlug(hub.slug);
  const cityName = def ? cityHubCityName(def, locale) : hub.city;
  const otherHubs = cityHubs().filter((item) => item.slug !== hub.slug);
  const faqItems = [
    {
      q: fr
        ? `KidEase liste-t-il des nounous à ${cityName}?`
        : `Does KidEase list nannies in ${cityName}?`,
      a: fr
        ? "Non. KidEase répertorie seulement les garderies permises par la province ou le territoire. Pas de nounous, de gardiennes non permises, ni de babysitting."
        : "No. KidEase lists provincially or territorially licensed childcare centres only — not nannies, sitters, or unlicensed care.",
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
          <Link to="/" className="hover:text-fg hover:underline">
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
            ? `Garderies permises à ${cityName}, ${hub.province}`
            : `Licensed daycare in ${cityName}, ${hub.province}`}
        </h1>
        <p className="mt-6 text-lg text-muted">
          {fr
            ? `KidEase répertorie ${hub.count} centres permis à ${cityName}. La recherche est gratuite. Nous ne listons pas les nounous ni les gardiennes.`
            : `KidEase lists ${hub.count} licensed childcare centres in ${cityName}. Search is free. We do not list nannies or sitters.`}
        </p>
        <p className="mt-4 text-sm text-muted">
          <Link to="/search" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("cityHubSearch")}
          </Link>
          {" · "}
          <Link to="/benefits" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("benefitsShort")}
          </Link>
          {" · "}
          <Link to="/faq" className="font-medium text-primary underline-offset-4 hover:underline">
            FAQ
          </Link>
        </p>

        <h2 className="mt-12 text-2xl">
          {fr ? `Centres à ${cityName}` : `Centres in ${cityName}`}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {hub.listings.length < hub.count
            ? fr
              ? `${hub.listings.length} fiches ci-dessous · ${hub.count} au total dans le répertoire.`
              : `${hub.listings.length} listings below · ${hub.count} in the full directory.`
            : fr
              ? `${hub.count} fiches permises.`
              : `${hub.count} licensed listings.`}
        </p>
        <ul className="mt-6 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
          {hub.listings.map((listing) => (
            <li key={listing.slug}>
              <Link
                to="/daycare/$slug"
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
            <Link to="/search" className="font-medium text-primary underline-offset-4 hover:underline">
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
                      to="/daycare/city/$city"
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
