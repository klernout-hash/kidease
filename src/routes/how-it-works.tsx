import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, MapPin, MessageCircle } from "lucide-react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/how-it-works")({
  head: () =>
    pageSeoHead({
      title: "How it works · KidEase",
      description: "Search licensed daycare, compare a shortlist, then ask the centre. Three steps on KidEase.",
      path: "/how-it-works",
    }),
  component: HowItWorksPage,
});

export function HowItWorksPage() {
  const { t, locale } = useCopy();
  const steps = [
    { n: "1", icon: MapPin, title: t("how1t"), body: t("how1") },
    { n: "2", icon: ListChecks, title: t("how2t"), body: t("how2") },
    { n: "3", icon: MessageCircle, title: t("how3t"), body: t("how3") },
  ] as const;
  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-3xl py-12 md:py-16">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("howItWorksCta")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("howStressFree")}</h1>
        <ol className="mt-10 grid gap-4">
          {steps.map((step) => (
            <li key={step.n} className="rounded-xl bg-surface p-5 ring-1 ring-border">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{step.n}</p>
              <h2 className="mt-2 flex items-center gap-2 text-xl">
                <step.icon className="size-5 text-primary" aria-hidden="true" />
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to={localePath("/search", locale)}>{t("search")}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/claim">{t("claimFindTitle")}</Link>
          </Button>
        </div>
      </main>
    </Shell>
  );
}
