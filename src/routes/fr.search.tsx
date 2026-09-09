import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CityHubLinks } from "@/components/city-hub-links";
import { DaycareCard } from "@/components/daycare-card";
import { EmptyState } from "@/components/empty-state";
import { ExploreSearchBar } from "@/components/explore-search-bar";
import { resolveLocationQuery } from "@/components/place-search";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { compactExploreSearch, parseExploreSearchFields } from "@/lib/explore-search";
import { geocode } from "@/lib/geo";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { featuredDaycares, searchDaycares } from "@/lib/server/daycares";
import { resolveRequestSearchOrigin } from "@/lib/server/request-origin";
import { useAppStore } from "@/lib/store";
import { LOADER_SETTLE_MS, withTimeoutFallback } from "@/lib/timeout";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { uniqueById } from "@/lib/utils";

export const Route = createFileRoute("/fr/search")({
  validateSearch: (s: Record<string, unknown>) => parseExploreSearchFields(s),
  loader: async () => {
    const origin = await resolveRequestSearchOrigin();
    const items = await withTimeoutFallback(
      searchDaycares({
        data: {
          lat: origin.lat,
          lng: origin.lng,
          radiusKm: 25,
          sort: "distance",
          ageGroup: "any",
        },
      }),
      LOADER_SETTLE_MS,
      [] as Card[],
    );
    const featured = await withTimeoutFallback(
      featuredDaycares({ data: { lat: origin.lat, lng: origin.lng } }),
      LOADER_SETTLE_MS,
      [] as Card[],
    );
    return { items, featured, origin };
  },
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.search),
  component: FrExplore,
});

function FrExplore() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const incoming = Route.useSearch();
  const boot = Route.useLoaderData();
  const origin = useAppStore((s) => s.origin);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setQuery = useAppStore((s) => s.setQuery);
  const [place, setPlace] = useState(incoming.q || origin.label || boot.origin.label);
  const [name, setName] = useState(incoming.name || "");
  const [from, setFrom] = useState(incoming.from || "");
  const [to, setTo] = useState(incoming.to || "");
  const shown = useMemo(() => {
    const rows: Card[] = (boot.items?.length ? boot.items : boot.featured) ?? [];
    return uniqueById(rows).slice(0, 12);
  }, [boot.featured, boot.items]);

  function goFullMap(label?: string) {
    const fields = compactExploreSearch({
      q: label || place,
      name,
      from,
      to,
    });
    void navigate({
      to: "/search",
      search: {
        q: fields.q,
        name: fields.name,
        from: fields.from,
        to: fields.to,
      },
    });
  }

  async function applyPlace(raw: string) {
    const hit = (await resolveLocationQuery(raw)) ?? geocode(raw);
    if (hit) {
      setOrigin(hit);
      setPlace(hit.label);
      setQuery(hit.label);
      return hit;
    }
    if (raw.trim()) setQuery(raw.trim());
    return null;
  }

  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-6xl py-10 md:py-14">
        <p className="text-sm font-semibold tracking-wide text-primary">{t("explore")}</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{t("tagline")}</h1>
        <p className="mt-4 max-w-2xl text-muted">{t("heroSub")}</p>
        <p className="mt-3 max-w-2xl text-sm text-muted">{t("listingCopyEnNote")}</p>

        <ExploreSearchBar
          className="mt-8"
          values={{ where: place, name, from, to }}
          origin={origin}
          onWhereChange={setPlace}
          onWhereResolved={(hit) => {
            setOrigin(hit);
            setPlace(hit.label);
            setQuery(hit.label);
          }}
          onNameChange={setName}
          onDatesChange={(next) => {
            setFrom(next.from);
            setTo(next.to);
          }}
          onSubmit={() => {
            void applyPlace(place).then((hit) => {
              goFullMap(hit?.label || place.trim() || origin.label);
            });
          }}
        />

        <CityHubLinks className="mt-6" />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => goFullMap(place || origin.label)}>
            <Search className="size-5" />
            {t("fullMapExplore")}
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/fr/help">{t("helpTitle")}</Link>
          </Button>
        </div>

        <h2 className="mt-12 text-2xl">{t("featured")}</h2>
        {shown.length ? (
          <div className="ke-web-grid mt-6 grid gap-x-3 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((item) => (
              <DaycareCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl bg-bg ring-1 ring-border">
            <EmptyState title={t("noResults")} body={t("noResultsLead")} action={t("changeLocation")} />
          </div>
        )}
      </main>
      <SiteFooter />
    </Shell>
  );
}
