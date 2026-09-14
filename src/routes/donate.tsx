import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, HeartHandshake } from "lucide-react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { cchfDonateUrl, sickKidsDonateUrl } from "@/lib/donate";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/donate")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.donate),
  component: DonatePage,
});

export function DonatePage() {
  const { t, locale } = useCopy();

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-3xl pt-8 pb-16 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("donateToKids")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("donateTitle")}</h1>
        <p className="mt-4 text-lg text-muted">{t("donateLead")}</p>

        <section
          className="mt-5 rounded-xl bg-primary/10 p-4 ring-1 ring-primary/25 md:mt-8 md:p-6"
          aria-labelledby="donate-match"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
              <HeartHandshake className="size-5" aria-hidden />
            </span>
            <h2 id="donate-match" className="text-lg font-semibold text-fg md:text-2xl">
              {t("donateMatch")}
            </h2>
          </div>
        </section>

        <ul className="mt-5 grid gap-4 md:mt-8 md:grid-cols-2">
          <FoundationCard
            name={t("donateSickKidsName")}
            why={t("donateSickKidsWhy")}
            cta={t("donateSickKidsCta")}
            href={sickKidsDonateUrl(locale)}
          />
          <FoundationCard
            name={t("donateCchfName")}
            why={t("donateCchfWhy")}
            cta={t("donateCchfCta")}
            href={cchfDonateUrl(locale)}
          />
        </ul>

        <p className="mt-6 text-sm text-muted">{t("donateOptional")}</p>
        <p className="mt-2 text-sm text-muted">{t("donateExternalNote")}</p>
      </main>
    </Shell>
  );
}

function FoundationCard({
  name,
  why,
  cta,
  href,
}: {
  name: string;
  why: string;
  cta: string;
  href: string;
}) {
  return (
    <li className="flex h-full flex-col rounded-xl bg-surface p-5 shadow-card ring-1 ring-border md:p-6">
      <h2 className="text-2xl">{name}</h2>
      <Button asChild className="mt-4 w-full md:order-last md:mt-6">
        <a href={href} target="_blank" rel="noreferrer">
          {cta}
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </Button>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{why}</p>
    </li>
  );
}
