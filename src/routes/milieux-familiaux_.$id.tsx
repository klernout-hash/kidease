import { createFileRoute } from "@tanstack/react-router";
import { QcHomeListing } from "@/components/qc-home-listing";
import { pageSeoHead } from "@/lib/page-seo";
import { getQcHomeDaycare } from "@/lib/server/qc-home-daycares";

export const Route = createFileRoute("/milieux-familiaux_/$id")({
  loader: ({ params }) => getQcHomeDaycare({ data: { slug: params.id, locale: "en" } }),
  head: ({ loaderData }) => {
    const name = loaderData?.listing?.displayName || "Recognized home daycare";
    const slug = loaderData?.listing?.slug;
    const seo = pageSeoHead({
      title: `${name} · KidEase`,
      description: "Recognized Quebec home daycare. KidEase shows the town, not a street address.",
      path: slug ? `/milieux-familiaux/${slug}` : "/milieux-familiaux",
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
  return <QcHomeListing locale="en" enabled={data.enabled} listing={data.listing} error={data.error} />;
}
