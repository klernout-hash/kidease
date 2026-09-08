import { createFileRoute, Link } from "@tanstack/react-router";
import { FeelBanner } from "@/components/building-photo";
import { JsonLd } from "@/components/json-ld";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { FAQ_ITEM_KEYS } from "@/lib/faq-items";
import { faqPageJsonLdScript, MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/faq")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.faq),
  component: FaqPage,
});

function FaqPage() {
  const { t } = useCopy();
  const items = FAQ_ITEM_KEYS.map(([q, a]) => ({ q: t(q), a: t(a) }));
  const jsonLd = faqPageJsonLdScript(items);
  return (
    <Shell bare>
      <JsonLd json={jsonLd} />
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">FAQ</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("faqTitle")}</h1>
        <p className="mt-6 text-lg text-muted">{t("faqLead")}</p>
        <FeelBanner src="/photos/infant.jpg" className="mt-8" />
        <ul className="mt-10 space-y-6">
          {items.map((item) => (
            <li key={item.q} className="rounded-xl bg-surface p-5 ring-1 ring-border">
              <h2 className="text-lg font-semibold">{item.q}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{item.a}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm">
          <Link to="/help" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("helpTitle")}
          </Link>
          {" · "}
          <Link to="/tour-checklist" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("tourChecklist")}
          </Link>
          {" · "}
          <Link to="/benefits" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("benefitsShort")}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
