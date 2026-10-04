import { createFileRoute, notFound } from "@tanstack/react-router";
import { GuideView } from "@/routes/guides.$code";
import { provincialGuideByCode, provincialGuidePath } from "@/lib/provincial-guides";
import { provinceLocativeFr } from "@/lib/province-phrase";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/guides/$code")({
  loader: ({ params }) => {
    const pt = provincialGuideByCode(params.code);
    if (!pt) throw notFound();
    return pt;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Guide · KidEase" }] };
    return pageSeoHead({
      title: `Guide de garde : ${loaderData.nameFr} · KidEase`,
      description: `Liens officiels pour les frais, les subventions, les listes d'attente et les permis ${provinceLocativeFr(loaderData.code)}.`,
      path: `/fr${provincialGuidePath(loaderData.code)}`,
    });
  },
  component: FrGuidePage,
});

function FrGuidePage() {
  const pt = Route.useLoaderData();
  return <GuideView pt={pt} />;
}
