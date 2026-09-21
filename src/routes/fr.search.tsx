import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CityHubLinks } from "@/components/city-hub-links";
import { DaycareCard } from "@/components/daycare-card";
import { EmptyState } from "@/components/empty-state";
import { ExploreSearchBar } from "@/components/explore-search-bar";
import { resolveLocationQuery } from "@/components/place-search";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { compactExploreSearch, parseExploreSearchFields } from "@/lib/explore-search";
import { productHomeOrigin } from "@/lib/default-origin";
import { geocode } from "@/lib/geo";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { featuredDaycares, searchDaycares } from "@/lib/server/daycares";
import { resolveRequestSearchOrigin } from "@/lib/server/request-origin";
import { useAppStore } from "@/lib/store";
import {
  ORIGIN_BUDGET_MS,
  PAINT_BUDGET_MS,
  withPaintBudget,
  withTimeoutFallback,
} from "@/lib/timeout";
import type { DaycareCard as Card } from "@/lib/types";
import { useCopy } from "@/lib/use-copy";
import { uniqueById } from "@/lib/utils";
import {
  isSearchAge,
  isSearchStart,
  liveLookingOnly,
  startWindowToDate,
  type SearchAge,
  type SearchStart,
} from "@/lib/now-loops";

export const Route = createFileRoute("/fr/search")({
  validateSearch: (s: Record<string, unknown>) => {
    const fields = parseExploreSearchFields(s);
    const out: typeof fields & { age?: SearchAge; start?: SearchStart } = { ...fields };
    if (typeof s.age === "string" && isSearchAge(s.age)) out.age = s.age;
    if (typeof s.start === "string" && isSearchStart(s.start)) out.start = s.start;
    return out;
  },
  loader: async () => {
    const origin = await withTimeoutFallback(
      resolveRequestSearchOrigin(),
      ORIGIN_BUDGET_MS,
      productHomeOrigin(),
    );
    const [searched, featured] = await Promise.all([
      withPaintBudget(
        searchDaycares({
          data: {
            lat: origin.lat,
            lng: origin.lng,
            radiusKm: 25,
            sort: "distance",
            ageGroup: "any",
            label: origin.label,
            q: origin.label,
          },
        }),
        PAINT_BUDGET_MS,
      ),
      withPaintBudget(
        featuredDaycares({ data: { lat: origin.lat, lng: origin.lng, label: origin.label } }),
        PAINT_BUDGET_MS,
      ),
    ]);
    return {
      items: searched.value ?? [],
      featured: featured.value ?? [],
      catalogueReady: searched.ready || featured.ready,
      origin,
    };
  },
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.search),
  component: FrExplore,
});

function FrExplore() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const incoming = Route.useSearch();
  const boot = Route.useLoaderData();
  const origin = useAppStore((s) => s.origin);
  const [rows, setRows] = useState<Card[] | null>(
    boot.catalogueReady === false
      ? null
      : ((boot.items?.length ? boot.items : boot.featured) ?? []),
  );
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setQuery = useAppStore((s) => s.setQuery);
  const [place, setPlace] = useState(incoming.q || origin.label || boot.origin.label);
  const [name, setName] = useState(incoming.name || "");
  const [from, setFrom] = useState(incoming.from || "");
  const [to, setTo] = useState(incoming.to || "");
  const [start, setStart] = useState<SearchStart | "">(incoming.start || "");
  useEffect(() => {
    if (boot.catalogueReady !== false) return;
    let live = true;
    void searchDaycares({
      data: {
        lat: boot.origin.lat,
        lng: boot.origin.lng,
        radiusKm: 25,
        sort: "distance",
        ageGroup: "any",
        label: boot.origin.label,
        q: boot.origin.label,
      },
    })
      .then((items) => {
        if (live) setRows(items);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [boot.catalogueReady, boot.origin.lat, boot.origin.lng, boot.origin.label]);

  const shown = useMemo(() => {
    const source = rows ?? (boot.items?.length ? boot.items : boot.featured) ?? [];
    return liveLookingOnly(uniqueById(source)).slice(0, 12);
  }, [boot.featured, boot.items, rows]);

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
        start: start || undefined,
      },
    });
  }

  async function applyPlace(raw: string) {
    const hit = (await resolveLocationQuery(raw)) ?? geocode(raw);
    if (hit) {
      setOrigin({ ...hit, explicit: true }, "manual");
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
          start={start}
          onWhereChange={setPlace}
          onWhereResolved={(hit) => {
            setOrigin({ ...hit, explicit: true }, "manual");
            setPlace(hit.label);
            setQuery(hit.label);
          }}
          onNameChange={setName}
          onDatesChange={(next) => {
            setFrom(next.from);
            setTo(next.to);
          }}
          onStartChange={(next) => {
            setStart(next);
            if (next) {
              setFrom(startWindowToDate(next));
              setTo("");
            } else {
              setFrom("");
              setTo("");
            }
          }}
          onSubmit={() => {
            void applyPlace(place).then((hit) => {
              goFullMap(hit?.label || place.trim() || origin.label);
            });
          }}
        />

        {place.trim() ? null : <CityHubLinks className="mt-6" />}

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
        {rows === null ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2" aria-hidden="true">
                <div className="ke-skel aspect-[4/3] w-full" />
                <div className="ke-skel h-4 w-3/4" />
                <div className="ke-skel h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : shown.length ? (
          <div className="ke-web-grid mt-6 grid gap-x-3 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((item) => (
              <DaycareCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-bg ring-1 ring-border">
              <EmptyState title={t("noResults")} body={t("noResultsLead")} action={t("changeLocation")} />
            </div>
            <CityHubLinks headingKey="otherCities" />
          </div>
        )}
      </main>
      <SiteFooter />
    </Shell>
  );
}
