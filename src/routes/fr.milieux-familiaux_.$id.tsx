import { createFileRoute } from "@tanstack/react-router";
import { QcHomeListing } from "@/components/qc-home-listing";
import { pageSeoHead } from "@/lib/page-seo";
import { getQcHomeDaycare } from "@/lib/server/qc-home-daycares";

export const Route = createFileRoute("/fr/milieux-familiaux_/$id")({
  loader: ({ params }) => getQcHomeDaycare({ data: { slug: params.id, locale: "fr" } }),
  head: ({ loaderData }) => {
    const name = loaderData?.listing?.displayName || "Milieu familial reconnu";
    const slug = loaderData?.listing?.slug;
    const seo = pageSeoHead({
      title: `${name} · KidEase`,
      description: "Milieu familial reconnu au Québec. KidEase montre la municipalité, pas une adresse de rue.",
      path: slug ? `/fr/milieux-familiaux/${slug}` : "/fr/milieux-familiaux",
    });
    if (!loaderData?.enabled || loaderData.listing?.sample) {
      seo.meta.push({ name: "robots", content: "noindex, nofollow" });
    }
    return seo;
  },
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  return <QcHomeListing locale="fr" enabled={data.enabled} listing={data.listing} error={data.error} />;
}
