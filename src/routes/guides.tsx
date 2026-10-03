import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";
import { provincialGuideCopy } from "@/lib/provincial-guide-copy";
import { provincialGuidePath } from "@/lib/provincial-guides";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/guides")({
  head: () =>
    pageSeoHead({
      title: "Provincial child care guides · KidEase",
      description: "Official links for fees, subsidy, waitlists, and licensing in every province and territory.",
      path: "/guides",
    }),
  component: GuidesIndex,
});

function GuidesIndex() {
  const { locale } = useCopy();
  const copy = provincialGuideCopy(locale);
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.indexTitle}</h1>
        <p className="mt-4 text-lg text-muted">{copy.indexWhat}</p>
        <p className="mt-2 text-muted">{copy.indexWhy}</p>
        <p className="mt-2 text-muted">{copy.indexLead}</p>
        <ul className="mt-6 divide-y divide-border">
          {START_DAYCARE_PTS.map((pt) => (
            <li key={pt.code}>
              <Link
                to="/guides/$code"
                params={{ code: pt.code.toLowerCase() }}
                className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
              >
                {locale === "fr" ? pt.nameFr : pt.nameEn}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}
