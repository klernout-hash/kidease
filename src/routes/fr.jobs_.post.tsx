import { createFileRoute } from "@tanstack/react-router";
import { JobsPost, loadJobsPostPage } from "@/routes/jobs_.post";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/jobs_/post")({
  loader: () => loadJobsPostPage(),
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.jobsPost),
  component: FrJobsPost,
});

function FrJobsPost() {
  const data = Route.useLoaderData();
  return <JobsPost staffBoard={data.staffBoard} />;
}
