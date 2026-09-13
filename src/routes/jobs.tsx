import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { JobsInterestForm } from "@/components/jobs-interest-form";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/jobs")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.jobs),
  component: Jobs,
});

export function Jobs() {
  const { t, locale } = useCopy();
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-lg py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("jobsKicker")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("jobsTitle")}</h1>
        <p className="mt-6 text-muted">{t("jobsLead")}</p>
        <p className="mt-4 text-muted">{t("jobsHonesty")}</p>
        <JobsInterestForm variant="caregiver" />
        <p className="mt-8 text-sm">
          <Link to={localePath("/jobs/post", locale)} className="font-medium text-primary hover:underline">
            {t("jobsCentresCta")}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
