import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";
import { provincialGuideCopy } from "@/lib/provincial-guide-copy";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/guides")({
  head: ({ matches }) => {
    const leaf = matches[matches.length - 1]?.routeId;
    if (leaf && leaf !== "/fr/guides") return { meta: [] };
    return pageSeoHead({
      title: "Guides provinciaux de garde · KidEase",
      description: "Liens officiels pour les frais, les subventions, les listes d'attente et les permis.",
      path: "/fr/guides",
    });
  },
  component: FrGuidesIndex,
});

function FrGuidesIndex() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const copy = provincialGuideCopy("fr");
  if (pathname.startsWith("/fr/guides/") && pathname !== "/fr/guides") return <Outlet />;
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
                to="/fr/guides/$code"
                params={{ code: pt.code.toLowerCase() }}
                className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
              >
                {pt.nameFr}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}
