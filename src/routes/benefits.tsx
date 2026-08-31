import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

export const Route = createFileRoute("/benefits")({ component: BenefitsPage });

const PROGRAMS: { key: string; title: CopyKey; body: CopyKey; href: string }[] = [
  {
    key: "ab",
    title: "benefitsAbT",
    body: "benefitsAb",
    href: "https://www.alberta.ca/child-care-subsidy",
  },
  {
    key: "bc",
    title: "benefitsBcT",
    body: "benefitsBc",
    href: "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/child-care-funding/child-care-benefit",
  },
  {
    key: "fed",
    title: "benefitsFedT",
    body: "benefitsFed",
    href: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit.html",
  },
  {
    key: "mb",
    title: "benefitsMbT",
    body: "benefitsMb",
    href: "https://www.gov.mb.ca/education/childcare/families/childcare_subsidies.html",
  },
  {
    key: "nb",
    title: "benefitsNbT",
    body: "benefitsNb",
    href: "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html",
  },
  {
    key: "nl",
    title: "benefitsNlT",
    body: "benefitsNl",
    href: "https://www.gov.nl.ca/education/childcare/childcaresubsidy/",
  },
  {
    key: "nt",
    title: "benefitsNtT",
    body: "benefitsNt",
    href: "https://www.ece.gov.nt.ca/en/average-10-day-child-care",
  },
  {
    key: "ns",
    title: "benefitsNsT",
    body: "benefitsNs",
    href: "https://childcarenovascotia.ca/families/child-care-subsidy",
  },
  {
    key: "nu",
    title: "benefitsNuT",
    body: "benefitsNu",
    href: "https://www.gov.nu.ca/en/education-and-schools/10_day-child-care",
  },
  {
    key: "on",
    title: "benefitsOnT",
    body: "benefitsOn",
    href: "https://www.ontario.ca/page/child-care-subsidies",
  },
  {
    key: "pe",
    title: "benefitsPeT",
    body: "benefitsPe",
    href: "https://www.princeedwardisland.ca/en/information/social-development-and-seniors/help-for-child-care-expenses",
  },
  {
    key: "qc",
    title: "benefitsQcT",
    body: "benefitsQc",
    href: "https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/",
  },
  {
    key: "sk",
    title: "benefitsSkT",
    body: "benefitsSk",
    href: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care",
  },
  {
    key: "yt",
    title: "benefitsYtT",
    body: "benefitsYt",
    href: "https://yukon.ca/en/universal-child-care",
  },
];

function BenefitsPage() {
  const { t } = useCopy();
  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-3xl py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("benefitsShort")}</p>
        <h1 className="mt-2 text-4xl">{t("benefitsTitle")}</h1>
        <p className="mt-4 max-w-2xl text-muted">{t("benefitsLead")}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {PROGRAMS.map((p) => (
            <li key={p.key}>
              <a
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="flex h-full flex-col rounded-xl bg-surface p-5 shadow-card ring-1 ring-border transition-shadow hover:shadow-lift"
              >
                <h2 className="text-2xl">{t(p.title)}</h2>
                <p className="mt-2 flex-1 text-sm text-muted">{t(p.body)}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t("benefitsApply")}
                  <ArrowUpRight className="size-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-subtle">{t("benefitsNote")}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
