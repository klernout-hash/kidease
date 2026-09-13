import { createFileRoute } from "@tanstack/react-router";
import { JobsPost } from "@/routes/jobs_.post";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/jobs_/post")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.jobsPost),
  component: JobsPost,
});
