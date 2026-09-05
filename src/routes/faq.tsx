import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/faq")({ component: FaqPage });

function FaqPage() {
  const { t } = useCopy();
  const items = [
    { q: t("faqQ1"), a: t("faqA1") },
    { q: t("faqQ2"), a: t("faqA2") },
    { q: t("faqQ3"), a: t("faqA3") },
    { q: t("faqQ4"), a: t("faqA4") },
  ];
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">FAQ</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("faqTitle")}</h1>
        <p className="mt-6 text-lg text-muted">{t("faqLead")}</p>
        <ul className="mt-10 space-y-6">
          {items.map((item) => (
            <li key={item.q} className="rounded-xl bg-surface p-5 ring-1 ring-border">
              <h2 className="text-lg font-semibold">{item.q}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{item.a}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm">
          <Link to="/support" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("support")}
          </Link>
          {" · "}
          <Link to="/tour-checklist" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("tourChecklist")}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
