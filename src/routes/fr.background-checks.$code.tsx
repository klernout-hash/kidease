import { createFileRoute, notFound } from "@tanstack/react-router";
import { BackgroundCheckProvince } from "@/components/background-check-guide-page";
import { jurisdictionByCode } from "@/lib/background-check-guide";
import { backgroundCheckGuideEnabled } from "@/lib/features";
import { pageSeoHead } from "@/lib/page-seo";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";

export const Route = createFileRoute("/fr/background-checks/$code")({
  loader: ({ params }) => {
    const jurisdiction = jurisdictionByCode(params.code);
    if (!jurisdiction) throw notFound();
    return { enabled: backgroundCheckGuideEnabled(), code: jurisdiction.code };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Vérifications d’antécédents · KidEase" }, { name: "robots", content: "noindex" }] };
    }
    if (!loaderData.enabled) {
      return {
        meta: [
          { title: "Vérifications d’antécédents · KidEase" },
          { name: "robots", content: "noindex, nofollow" },
        ],
      };
    }
    const name = START_DAYCARE_PTS.find((row) => row.code === loaderData.code)?.nameFr ?? loaderData.code;
    return pageSeoHead({
      title: `Vérifications d’antécédents : ${name} · KidEase`,
      description: `Règles officielles de vérification pour les rôles en garderie : ${name}. KidEase ne fait pas ces vérifications et ne les confirme pas.`,
      path: `/fr/background-checks/${loaderData.code.toLowerCase()}`,
    });
  },
  component: Page,
  notFoundComponent: Missing,
});

function Page() {
  const data = Route.useLoaderData();
  const jurisdiction = jurisdictionByCode(data.code);
  return <BackgroundCheckProvince jurisdiction={jurisdiction} enabled={data.enabled} />;
}

function Missing() {
  return <BackgroundCheckProvince jurisdiction={null} enabled />;
}
