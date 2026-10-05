import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";
import { provincialGuideCopy } from "@/lib/provincial-guide-copy";
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/guides")({
  head: ({ matches }) => {
    const leaf = matches[matches.length - 1]?.routeId;
    if (leaf && leaf !== "/guides") return { meta: [] };
    return pageSeoHead({
      title: "Provincial child care guides · KidEase",
      description: "Official links for fees, subsidy, waitlists, and licensing in every province and territory.",
      path: "/guides",
    });
  },
  component: GuidesIndex,
});

export function GuidesIndex() {
  const { locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const copy = provincialGuideCopy(locale);
  const bare = stripLocalePrefix(pathname);
  if (bare.startsWith("/guides/") && bare !== "/guides") return <Outlet />;
  return (
    <Shell>
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
                to={localePath(`/guides/${pt.code.toLowerCase()}`, locale)}
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
