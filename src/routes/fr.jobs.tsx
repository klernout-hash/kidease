import { createFileRoute } from "@tanstack/react-router";
import { Jobs, loadJobsPage } from "@/routes/jobs";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

const LIVE_JOBS_DESCRIPTION_FR =
  "Postes ouverts publiés par des centres autorisés au Canada. KidEase n’invente pas de postes.";

export const Route = createFileRoute("/fr/jobs")({
  loader: () => loadJobsPage(),
  head: ({ loaderData }) =>
    pageSeoHead({
      ...MARKETING_PAGE_SEO_FR.jobs,
      description: loaderData?.enabled || loaderData?.staffBoard ? LIVE_JOBS_DESCRIPTION_FR : MARKETING_PAGE_SEO_FR.jobs.description,
    }),
  component: FrJobs,
});

function FrJobs() {
  const data = Route.useLoaderData();
  return <Jobs {...data} />;
}
