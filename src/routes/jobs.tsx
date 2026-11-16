import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { JobsInterestForm } from "@/components/jobs-interest-form";
import { EceJobBoard } from "@/components/ece-job-board";
import { eceJobsEnabled } from "@/lib/features";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { localePath } from "@/lib/locale-path";
import { publicEceJobRows } from "@/lib/server/ece-jobs";
import { useCopy } from "@/lib/use-copy";

export type JobsPageData = {
  enabled: boolean;
  jobs: Awaited<ReturnType<typeof publicEceJobRows>>;
};

export async function loadJobsPage(): Promise<JobsPageData> {
  const enabled = eceJobsEnabled();
  if (!enabled) return { enabled: false, jobs: [] };
  const jobs = await publicEceJobRows().catch(() => []);
  return { enabled: true, jobs };
}

const LIVE_JOBS_DESCRIPTION = "Open roles posted by licensed centres in Canada. KidEase does not invent openings.";

export const Route = createFileRoute("/jobs")({
  loader: () => loadJobsPage(),
  head: ({ loaderData }) =>
    pageSeoHead({
      ...MARKETING_PAGE_SEO.jobs,
      description: loaderData?.enabled ? LIVE_JOBS_DESCRIPTION : MARKETING_PAGE_SEO.jobs.description,
    }),
  component: JobsRoute,
});

function JobsRoute() {
  const data = Route.useLoaderData();
  return <Jobs enabled={data.enabled} jobs={data.jobs} />;
}

export function Jobs({ enabled, jobs }: JobsPageData) {
  const { t, locale } = useCopy();
  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg py-12 md:py-16" data-ke="jobs" data-ece-jobs={enabled ? "on" : "off"}>
        <p className="text-sm font-semibold tracking-wide text-primary">{t("jobsKicker")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("jobsTitle")}</h1>
        <p className="mt-6 text-muted">{enabled ? t("jobsLeadLive") : t("jobsLead")}</p>
        <p className="mt-4 text-muted">{enabled ? t("jobsHonestyLive") : t("jobsHonesty")}</p>
        {enabled ? (
          <p className="mt-4 text-muted">
            {locale === "fr"
              ? "Un centre qui publie un poste EPE ou GAE affiche un badge sur sa fiche."
              : "A centre that posts an ECE or CCA role shows a badge on its listing."}
          </p>
        ) : null}
        {enabled ? <EceJobBoard initialEnabled initialJobs={jobs} /> : null}
        {!enabled || jobs.length === 0 ? <JobsInterestForm variant="caregiver" /> : null}
        <p className="mt-8 text-sm">
          <Link to={localePath("/jobs/post", locale)} className="font-medium text-primary hover:underline">
            {t("jobsCentresCta")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
