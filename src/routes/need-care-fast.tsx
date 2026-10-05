import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { JsonLd } from "@/components/json-ld";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { needCareFastCopy } from "@/lib/need-care-fast-copy";
import { loadNeedCareFast, type NeedCareFastPage as NeedCareFastData } from "@/lib/server/need-care-fast";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";
import { SITEMAP_ORIGIN } from "@/lib/sitemap";

function parseSearch(search: Record<string, unknown>) {
  return { q: typeof search.q === "string" ? search.q.trim().slice(0, 80) : "" };
}

export const Route = createFileRoute("/need-care-fast")({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => loadNeedCareFast(deps.q),
  head: () =>
    pageSeoHead({
      title: "Need care fast · KidEase",
      description: "Licensed daycares that confirmed an open spot in the last 7 days, closest first.",
      path: "/need-care-fast",
    }),
  component: NeedCareFastPage,
});

export function NeedCareFastView({ data }: { data: NeedCareFastData }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { locale } = useCopy();
  const fr = locale === "fr" || pathname.startsWith("/fr");
  const copy = needCareFastCopy(fr ? "fr" : "en");
  const [q, setQ] = useState(data.q);
  const searchPath = fr ? "/fr/search" : "/search";
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: copy.title,
    itemListElement: data.hits.map((hit, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITEMAP_ORIGIN}/daycare/${hit.slug}`,
      name: hit.name,
    })),
  };

  return (
    <Shell>
      <JsonLd json={JSON.stringify(list)} />
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{copy.title}</h1>
        <p className="mt-4 text-lg text-muted">{copy.what}</p>
        <p className="mt-2 text-muted">{copy.why}</p>
        <p className="mt-2 text-muted">{copy.lead}</p>
        <form className="mt-6" method="get" action={fr ? "/fr/need-care-fast" : "/need-care-fast"}>
          <label className="block text-sm" htmlFor="need-care-fast-q">
            {copy.placeLabel}
            <input
              id="need-care-fast-q"
              name="q"
              className="ke-input mt-1 w-full"
              value={q}
              maxLength={80}
              autoComplete="address-level2"
              onChange={(event) => setQ(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
            />
          </label>
          <Button type="submit" className="mt-3">
            {copy.submit}
          </Button>
        </form>
        {!data.q ? <p className="mt-6 text-sm text-muted">{copy.emptyPlace}</p> : null}
        {data.unknownPlace ? (
          <div className="mt-6">
            <EmptyState title={copy.unknownPlace} action={copy.searchAgain} actionTo={searchPath} />
          </div>
        ) : null}
        {data.q && !data.unknownPlace && !data.hits.length ? (
          <div className="mt-6">
            <EmptyState title={copy.emptyResults} action={copy.searchAgain} actionTo={searchPath} />
          </div>
        ) : null}
        {data.hits.length ? (
          <ul className="mt-6 divide-y divide-border">
            {data.hits.map((hit) => (
              <li key={hit.id} className="py-4">
                <Link
                  to="/daycare/$slug"
                  params={{ slug: hit.slug }}
                  className="font-medium text-fg underline-offset-4 hover:underline"
                >
                  {hit.name}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {hit.city}
                  {hit.province ? `, ${hit.province}` : ""} · {hit.distanceLabel} {copy.away}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {hit.spots} {copy.spots} · {copy.confirmed}{" "}
                  {new Date(hit.confirmedAt).toLocaleDateString(fr ? "fr-CA" : "en-CA", { dateStyle: "medium" })}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </Shell>
  );
}

function NeedCareFastPage() {
  const data = Route.useLoaderData();
  return <NeedCareFastView data={data} />;
}
