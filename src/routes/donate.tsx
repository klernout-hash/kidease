import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, HeartHandshake } from "lucide-react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { SICKKIDS_DONATE_URL, cchfDonateUrl } from "@/lib/donate-kids";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/donate")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.donate),
  component: DonatePage,
});

const FOUNDATIONS: {
  key: string;
  name: CopyKey;
  body: CopyKey;
  href: (locale: string) => string;
}[] = [
  {
    key: "sickkids",
    name: "donateSickKidsName",
    body: "donateSickKidsBody",
    href: () => SICKKIDS_DONATE_URL,
  },
  {
    key: "cchf",
    name: "donateCchfName",
    body: "donateCchfBody",
    href: (locale) => cchfDonateUrl(locale),
  },
];

export function DonatePage() {
  const { t, locale } = useCopy();
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("donateToKids")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("donateHeadline")}</h1>
        <p className="mt-6 text-lg text-muted">{t("donateLead")}</p>

        <ul className="mt-10 grid gap-5 md:grid-cols-2">
          {FOUNDATIONS.map((foundation) => (
            <li key={foundation.key}>
              <article className="flex h-full flex-col rounded-xl bg-surface p-6 ring-1 ring-border md:p-7">
                <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                  <HeartHandshake className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <h2 className="mt-4 text-2xl">{t(foundation.name)}</h2>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{t(foundation.body)}</p>
                <a
                  href={foundation.href(locale)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
                >
                  {t("donateCta")}
                  <ArrowUpRight className="size-4" aria-hidden />
                </a>
              </article>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm text-subtle">{t("donateNote")}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
