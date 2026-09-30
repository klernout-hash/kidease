import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { Listing } from "@/routes/daycare.$slug";
import { listingCanonicalUrl, listingSeoHeadTags, listingBreadcrumbJsonLdScript, listingJsonLdScript } from "@/lib/listing-seo";
import { primaryListingPhoto } from "@/lib/listing-photo";
import { DETAIL_SIZES, HERO_WIDTHS, photoSrcSet, photoUrl } from "@/lib/photo";
import { hreflangLinks } from "@/lib/locale-path";
import { decideListingLoader, listingNotFoundHead, shouldNotFoundListing } from "@/lib/listing-not-found";
import { rethrowRouterControl } from "@/lib/listing-loader-errors";
import { ListingNotFoundPage } from "@/components/page-not-found";
import { getHiddenReviewRedirect, getListingSeo } from "@/lib/server/daycares";
import { parseListingAsk } from "@/lib/lead-requests";
import { SITEMAP_ORIGIN } from "@/lib/sitemap";

export const Route = createFileRoute("/fr/daycare/$slug")({
  validateSearch: (s: Record<string, unknown>) => {
    const ask = parseListingAsk(s.ask);
    return ask ? { ask } : {};
  },
  loader: async ({ params }) => {
    try {
      const seo = await getListingSeo({ data: params.slug });
      const hidden = shouldNotFoundListing(seo) ? await getHiddenReviewRedirect({ data: params.slug }) : null;
      const decision = decideListingLoader(params.slug, seo, hidden);
      if (decision.type === "redirect-keeper") {
        throw redirect({ to: "/fr/daycare/$slug", params: { slug: decision.slug }, statusCode: 301 });
      }
      if (decision.type === "redirect-city") {
        throw redirect({ to: "/fr/daycare/city/$city", params: { city: decision.city }, statusCode: 301 });
      }
      if (decision.type === "redirect-search") {
        throw redirect({ to: "/fr/search", search: { q: decision.q }, statusCode: 301 });
      }
      if (decision.type === "not-found") throw notFound();
      return decision.seo;
    } catch (error) {
      rethrowRouterControl(error, params.slug);
    }
  },
  notFoundComponent: ListingNotFoundPage,
  head: ({ loaderData }) => {
    if (!loaderData) return listingNotFoundHead();
    const canonical = listingCanonicalUrl(loaderData.slug).replace(
      `${SITEMAP_ORIGIN}/daycare/`,
      `${SITEMAP_ORIGIN}/fr/daycare/`,
    );
    const jsonLd = listingJsonLdScript(loaderData, "fr");
    const crumbs = listingBreadcrumbJsonLdScript(loaderData, "fr");
    const hero = primaryListingPhoto(loaderData.photos);
    const image = hero
      ? [
          {
            rel: "preload" as const,
            as: "image" as const,
            href: photoUrl(hero, 768),
            imageSrcSet: photoSrcSet(hero, HERO_WIDTHS),
            imageSizes: DETAIL_SIZES,
            fetchPriority: "high" as const,
          },
        ]
      : [];
    return {
      meta: listingSeoHeadTags(loaderData, "fr"),
      links: [
        ...(canonical ? [{ rel: "canonical", href: canonical }] : []),
        ...hreflangLinks(`/fr/daycare/${loaderData.slug}`, SITEMAP_ORIGIN),
        ...image,
      ],
      scripts: [
        ...(jsonLd ? [{ type: "application/ld+json", children: jsonLd }] : []),
        ...(crumbs ? [{ type: "application/ld+json", children: crumbs }] : []),
      ],
    };
  },
  component: Listing,
});
