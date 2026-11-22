import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { JobsInterestForm } from "@/components/jobs-interest-form";
import { StaffHiringDesk } from "@/components/staff-hiring-desk";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";
import { staffJobBoardFlag } from "@/lib/server/staff-jobs";

/** FEATURE_STAFF_JOB_BOARD. Off keeps the page exactly as before. */
export async function loadJobsPostPage(): Promise<{ staffBoard: boolean }> {
  const staffBoard = await staffJobBoardFlag().catch(() => false);
  return { staffBoard: staffBoard === true };
}

export const Route = createFileRoute("/jobs_/post")({
  loader: () => loadJobsPostPage(),
  head: () => pageSeoHead(MARKETING_PAGE_SEO.jobsPost),
  component: JobsPostRoute,
});

function JobsPostRoute() {
  const data = Route.useLoaderData();
  return <JobsPost staffBoard={data.staffBoard} />;
}

export function JobsPost({ staffBoard = false }: { staffBoard?: boolean } = {}) {
  const { t, locale } = useCopy();
  const nativeShell = useInNativeShell();
  if (staffBoard) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-2xl py-12 md:py-16" data-ke="jobs-post" data-staff-board="on">
          <StaffHiringDesk />
        </main>
      </Shell>
    );
  }
  return (
    <Shell>
      <main
        className="ke-gutter mx-auto max-w-lg py-12 md:py-16"
        data-ke="jobs-post"
        data-commerce={nativeShell ? "hidden" : "web"}
      >
        <p className="text-sm font-semibold tracking-wide text-primary">{t("jobsPostKicker")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("jobsPostTitle")}</h1>
        <p className="mt-6 text-muted">{t("jobsPostLead")}</p>
        <p className="mt-4 text-muted">{t("jobsPostHonesty")}</p>
        <JobsInterestForm variant="centre" />
        <p className="mt-8 text-sm">
          <Link to={localePath("/jobs", locale)} className="font-medium text-primary hover:underline">
            {t("jobsCaregiversCta")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
