import { createFileRoute, notFound } from "@tanstack/react-router";
import { BackgroundCheckProvince } from "@/components/background-check-guide-page";
import { jurisdictionByCode } from "@/lib/background-check-guide";
import { backgroundCheckGuideEnabled } from "@/lib/features";
import { pageSeoHead } from "@/lib/page-seo";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";

export const Route = createFileRoute("/background-checks/$code")({
  loader: ({ params }) => {
    const jurisdiction = jurisdictionByCode(params.code);
    if (!jurisdiction) throw notFound();
    return { enabled: backgroundCheckGuideEnabled(), code: jurisdiction.code };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Background checks · KidEase" }, { name: "robots", content: "noindex" }] };
    if (!loaderData.enabled) {
      return {
        meta: [
          { title: "Background checks · KidEase" },
          { name: "robots", content: "noindex, nofollow" },
        ],
      };
    }
    const name = START_DAYCARE_PTS.find((row) => row.code === loaderData.code)?.nameEn ?? loaderData.code;
    return pageSeoHead({
      title: `${name} background checks · KidEase`,
      description: `Official background-check rules for daycare roles in ${name}. KidEase does not run or verify the checks.`,
      path: `/background-checks/${loaderData.code.toLowerCase()}`,
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
