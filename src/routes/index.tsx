import { FEATURE_SPONSORED_LISTINGS } from "@/lib/sponsored-flag";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { JsonLd } from "@/components/json-ld";
import { MARKETING_PAGE_SEO, organizationGraphJsonLdScript, pageSeoHead } from "@/lib/page-seo";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Camera, Lock, MapPin, MessageCircle, Search, ListChecks } from "lucide-react";
import { HeroClaimStrip } from "@/components/hero-claim-strip";
const HomeHowVideo = lazy(() =>
  import("@/components/home-how-video").then((m) => ({ default: m.HomeHowVideo })),
);
import { TrustBar } from "@/components/trust-bar";
import { Shell } from "@/components/shell";
import { HomeDiscovery } from "@/components/home-discovery";
import { RecentlyViewedRow } from "@/components/recently-viewed-row";
import { Button } from "@/components/ui/button";
import {
  FeelPhoto,
} from "@/components/building-photo";
import { CARD_SIZES, CARD_WIDTHS, STEP_SIZES, photoSrcSet, photoUrl, listingThumb } from "@/lib/photo";
import { featuredDaycares } from "@/lib/server/daycares";
import { QUERY_STALE_MS, dedupedQuery } from "@/lib/fn-query";
import { BootPending } from "@/components/boot-pending";
import { HOME_PAINT_BUDGET_MS, ORIGIN_BUDGET_MS, withPaintBudget, withTimeoutFallback } from "@/lib/timeout";
import { readSavedOrigin } from "@/lib/geo";
import {
  coerceDirectoryOrigin,
  productHomeOrigin,
  readClientTimeZone,
  searchOriginOrWinnipeg,
  trustedSavedOrigin,
} from "@/lib/default-origin";
import { resolveRequestSearchOrigin } from "@/lib/server/request-origin";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { uniqueById } from "@/lib/utils";
import { publicListings } from "@/lib/listing-visibility";
import { isClaimVerified } from "@/lib/trust";
import { readRecent } from "@/lib/recent";
import { isSafeSitemapSlug } from "@/lib/sitemap";
import { MobileSearchHome } from "@/components/mobile-search-sheet";
import { SmartMatchEntry } from "@/components/smart-match";
import { compactExploreSearch, readLiveSearchFlag } from "@/lib/explore-search";
import { compactSearchRadius } from "@/lib/search-radius";
import { ResumeVisitCard } from "@/components/resume-visit";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { featuredHomeAgreement, homeLiveStrip } from "@/lib/home-live-strip";
import { homeGridItems } from "@/lib/now-loops";
import type { MobileSearchParams } from "@/lib/mobile-search-v2";
import { ChipButton } from "@/components/chip";
import type { DaycareCard as Card } from "@/lib/types";

const RoleEnrollChooser = lazy(() =>
  import("@/components/role-enroll").then((m) => ({ default: m.RoleEnrollChooser })),
);
const RoleEnrollDialog = lazy(() =>
  import("@/components/role-enroll").then((m) => ({ default: m.RoleEnrollDialog })),
);

export function homeValidateSearch(s: Record<string, unknown>) {
  const change = s.change === "1" || s.change === true;
  const live = readLiveSearchFlag(s.live);
  return {
    ...(change ? { change: "1" as const } : {}),
    ...(live ? { live: 1 as const } : {}),
  };
}

export async function loadProductHome() {
  const raw = await withTimeoutFallback(resolveRequestSearchOrigin(), ORIGIN_BUDGET_MS, productHomeOrigin());
  const origin = searchOriginOrWinnipeg(raw);
  try {
    const painted = await withPaintBudget(
      featuredDaycares({ data: { lat: origin.lat, lng: origin.lng, label: origin.label, radiusKm: 25 } }),
      HOME_PAINT_BUDGET_MS,
    );
    return {
      featured: Array.isArray(painted.value) ? painted.value : [],
      featuredReady: painted.ready,
      origin,
    };
  } catch {
    return {
      featured: [],
      featuredReady: true,
      origin,
    };
  }
}

export type ProductHomeBoot = Awaited<ReturnType<typeof loadProductHome>>;

/** Same photo the home grid marks priority. Preload that one, not a later card. */
function homeLcpPhoto(rows: Card[]): string | undefined {
  return homeGridItems(rows)
    .map((row) => listingThumb(row.photos))
    .find((photo) => Boolean(photo && !photo.includes("storefront-placeholder")));
}

export const Route = createFileRoute("/")({
  validateSearch: homeValidateSearch,
  loader: loadProductHome,
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: BootPending,
  head: ({ loaderData }) => {
    const seo = pageSeoHead(MARKETING_PAGE_SEO.home);
    const rows = publicListings(Array.isArray(loaderData?.featured) ? loaderData.featured : []);
    const src = homeLcpPhoto(rows);
    if (!src) return seo;
    return {
      ...seo,
      links: [
        ...seo.links,
        {
          rel: "preload" as const,
          as: "image" as const,
          href: photoUrl(src, 480),
          imageSrcSet: photoSrcSet(src, CARD_WIDTHS),
          imageSizes: CARD_SIZES,
          fetchPriority: "high" as const,
        },
      ],
    };
  },
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  return <HomePage boot={Route.useLoaderData()} liveClaimed={search.live === 1} changeLocation={search.change === "1"} />;
}

export function HomePage({ boot, liveClaimed = false, changeLocation = false }: { boot: ProductHomeBoot; liveClaimed?: boolean; changeLocation?: boolean }) {
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const origin = useAppStore((s) => s.origin);
  const originSource = useAppStore((s) => s.originSource);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const [featured, setFeatured] = useState<Card[]>(publicListings(boot.featured ?? []));
  const [featuredReady, setFeaturedReady] = useState(boot.featuredReady !== false);
  const [recent, setRecent] = useState<Card[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);

  useEffect(() => {
    if (!featured.length) return;
    captureMarketplaceFunnel({ step: "explore", source: "home", dest_path: "/search" });
  }, [featured.length]);

  useEffect(() => {
    const timeZone = readClientTimeZone();
    if (trustedSavedOrigin(readSavedOrigin(), { timeZone })) return;
    const source = useAppStore.getState().originSource;
    if (source === "gps" || source === "manual") return;
    const next = coerceDirectoryOrigin(
      { lat: boot.origin.lat, lng: boot.origin.lng, label: boot.origin.label, source: boot.origin.source },
      timeZone,
    );
    setOrigin({ lat: next.lat, lng: next.lng, label: next.label }, next.source);
  }, [boot.origin.lat, boot.origin.lng, boot.origin.label, boot.origin.source, setOrigin]);

  useEffect(() => {
    const loc = originSource ? origin : boot.origin;
    let cancelled = false;
    const loadFeatured = () => {
      if (!(loc.label || "").trim()) {
        setFeatured([]);
        setFeaturedReady(true);
        return;
      }
      void dedupedQuery(
        `home-featured:${loc.lat},${loc.lng},${radiusKm},${loc.label ?? ""}`,
        QUERY_STALE_MS,
        () => featuredDaycares({ data: { lat: loc.lat, lng: loc.lng, label: loc.label, radiusKm } }),
        { cacheIf: (rows) => Array.isArray(rows) && rows.length > 0 },
      )
        .then((rows) => {
          if (cancelled) return;
          const next = publicListings(uniqueById(rows));
          setFeatured(next);
          setFeaturedReady(true);
        })
        .catch(() => {
          if (cancelled) return;
          setFeatured([]);
          setFeaturedReady(true);
        });
    };
    // Catalogue XHR waits until the hero request is already in flight.
    const featuredWait = boot.featuredReady;
    const ric = typeof requestIdleCallback === "function" ? requestIdleCallback : null;
    const featuredId = featuredWait
      ? ric
        ? ric(loadFeatured, { timeout: 1500 })
        : window.setTimeout(loadFeatured, 400)
      : null;
    if (!featuredWait) loadFeatured();
    return () => {
      cancelled = true;
      if (featuredId != null) {
        if (ric) cancelIdleCallback(featuredId);
        else window.clearTimeout(featuredId);
      }
    };
  }, [origin, originSource, radiusKm, boot.origin, boot.featuredReady]);

  /** One way to /search: the pill's Where/When/Who answers, the chosen radius (km), EN or FR. */
  function goSearch(label?: string, params: MobileSearchParams = {}) {
    const search = {
      ...params,
      ...compactSearchRadius({ km: radiusKm }),
      q: compactExploreSearch({ q: label ?? params.q }).q,
    };
    if (locale === "fr") void navigate({ to: "/fr/search", search });
    else void navigate({ to: "/search", search });
  }

  useEffect(() => {
    function sync() {
      setRecent(readRecent());
    }
    sync();
    window.addEventListener("kidease-recent", sync);
    return () => window.removeEventListener("kidease-recent", sync);
  }, []);
  const publicFeatured = useMemo(() => publicListings(featured), [featured]);
  const claimedLive = useMemo(
    () => publicFeatured.filter((row) => isClaimVerified(row)),
    [publicFeatured],
  );
  const liveCount = useMemo(() => publicFeatured.filter((r) => r.live).length, [publicFeatured]);
  const strip = homeLiveStrip(liveCount, publicFeatured.length);
  const featuredAgreement = featuredHomeAgreement(publicFeatured.length);
  const shown = useMemo(
    () => uniqueById(liveOnly ? publicFeatured.filter((r) => r.live) : publicFeatured),
    [publicFeatured, liveOnly],
  );
  const recentPublic = useMemo(
    () => publicListings(recent).filter((row) => isSafeSitemapSlug(row.slug)),
    [recent],
  );

  const featuredSearch = (
    <MobileSearchHome
      key={changeLocation ? "change-location" : "explore"}
      origin={originSource ? origin : boot.origin}
      initiallyOpen={changeLocation}
      onCommit={(params) => goSearch(params.q, params)}
    />
  );

  // Promos and the trust note sit under the listings, so cards are the first thing a parent sees.
  const belowResults = (
    <div data-ke="home-below-results" className="ke-gutter mx-auto w-full space-y-4 pb-8">
      <p className="max-w-2xl text-sm text-muted">{t(FEATURE_SPONSORED_LISTINGS ? "featuredBody" : "featuredBodyPlain")}</p>
      <SmartMatchEntry card />
      <div data-ke="home-hero-pills" className="flex min-h-11 w-full flex-wrap items-center gap-x-2.5">
        <ResumeVisitCard quiet />
      </div>
      <HeroClaimStrip lower />
      <TrustBar />
      <RecentlyViewedRow items={recentPublic} cards />
    </div>
  );

  return (
    <Shell>
      <main className="w-full min-w-0">
      <div data-ke="launch-shell" role="status" aria-live="polite" className="w-full text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">KidEase</p>
        <p className="mt-3 text-base font-medium text-fg">
          {locale === "fr" ? "Ouverture de votre espace" : "Opening your space"}
        </p>
      </div>
      <JsonLd json={organizationGraphJsonLdScript(locale === "fr" ? "fr" : "en")} />
      <div className="w-full min-w-0" data-ke="home-discovery-surface">
      <h1 className="ke-gutter mx-auto w-full pt-3 text-center text-[clamp(1.25rem,3.4vw,2rem)] leading-tight tracking-[-0.03em]">
        {t("tagline")}
      </h1>
        <section data-ke="home-search" className="bg-bg">
          <div className="ke-gutter mx-auto w-full pb-1 pt-2">
            {featuredSearch}
            {featuredReady && strip.liveCount > 0 ? (
              <div className="mx-auto mt-1 flex min-h-11 w-full max-w-[60rem] flex-wrap gap-2" data-ke="home-live-strip">
                <ChipButton on={liveOnly} onClick={() => setLiveOnly(true)}>
                  {t(strip.liveLabelKey).replace("{n}", String(strip.liveCount))}
                </ChipButton>
                {featuredAgreement.showChip ? (
                  <ChipButton on={!liveOnly} onClick={() => setLiveOnly(false)}>
                    {t(strip.secondaryLabelKey).replace("{n}", String(strip.secondaryCount))}
                  </ChipButton>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section id="featured" className="ke-gutter mx-auto w-full pb-8 pt-1 md:pb-12">
          {!featuredReady || featuredAgreement.showSection ? (
            <h2 className="scroll-mb-32 text-xl tracking-[-0.03em] max-lg:sr-only md:text-2xl">{t(strip.featuredTitleKey)}</h2>
          ) : null}
          <HomeDiscovery
            ready={featuredReady}
            shown={liveClaimed ? claimedLive : shown}
            liveOnly={liveOnly}
            hasPublic={publicFeatured.length > 0}
            onShowAll={() => setLiveOnly(false)}
            city={origin.label}
          />
          <div className="mt-6">
            <Button size="md" variant="secondary" className="rounded-[14px]" onClick={() => goSearch(origin.label)}>
              <Search className="size-5" />
              {t("heroCta")}
            </Button>
          </div>
        </section>

        {belowResults}

      <div className="ke-web-only w-full [[data-channel=app]_&]:hidden">
        <section id="how" aria-labelledby="how-kidease-heading" className="ke-gutter mx-auto w-full py-10 md:py-16">
          <h2 id="how-kidease-heading" className="text-center text-xl tracking-[-0.03em] text-fg md:text-2xl">
            {t("howVideoTitle")}
          </h2>
          <Suspense fallback={null}>
            <HomeHowVideo />
          </Suspense>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Step
              n="1"
              icon={MapPin}
              title={t("how1t")}
              body={t("how1")}
              photo="/photos/cottage.jpg"
            />
            <Step
              n="2"
              icon={ListChecks}
              title={t("how2t")}
              body={t("how2")}
              photo="/photos/playroom.jpg"
            />
            <Step
              n="3"
              icon={MessageCircle}
              title={t("how3t")}
              body={t("how3")}
              photo="/photos/kitchen.jpg"
            />
          </div>
        </section>

        <section className="bg-surface">
          <div className="ke-gutter mx-auto w-full py-16">
            <div id="enroll">
              <Suspense fallback={<div className="min-h-64" aria-hidden="true" />}>
                <RoleEnrollChooser
                  heading="h2"
                  className="rounded-xl bg-bg p-5 ring-1 ring-border sm:p-8"
                />
              </Suspense>
            </div>

          </div>
        </section>

        <section className="ke-gutter mx-auto w-full py-16">
          <h2 className="text-3xl md:text-4xl">{t("trustWhyTitle")}</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            <Why icon={BadgeCheck} text={t("trustWhy1")} />
            <Why icon={Camera} text={t("trustWhy2")} />
            <Why icon={ListChecks} text={t("trustWhy3")} />
            <Why icon={Lock} text={t("trustWhy4")} />
          </ul>
          <p className="mt-8 max-w-2xl text-muted">{t("trustWhyLocal")}</p>
        </section>

        <section className="bg-surface">
          <div className="ke-gutter mx-auto w-full py-16">
            <h2 className="text-3xl md:text-4xl">{t("quotesTitle")}</h2>
            <p className="mt-4 max-w-2xl text-muted">{t("quotesLead")}</p>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <Quote body={t("quote1")} by={t("quote1By")} />
              <Quote body={t("quote2")} by={t("quote2By")} />
              <Quote body={t("quote3")} by={t("quote3By")} />
            </div>
          </div>
        </section>

        <section className="bg-primary text-primary-fg">
          <div className="ke-gutter mx-auto max-w-3xl py-16 text-center">
            <h2 className="text-3xl text-primary-fg md:text-4xl">{t("finalCtaTitle")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-fg/90">{t("finalCtaBody")}</p>
            <Button
              size="lg"
              variant="secondary"
              className="mt-8 h-14 min-h-14 px-7 text-base"
              onClick={() => {
                setEnrollOpen(true);
                document
                  .getElementById("enroll")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {t("enrollNow")}
            </Button>
          </div>
        </section>

      </div>

      </div>
      </main>

      <Suspense fallback={null}>
        <RoleEnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} />
      </Suspense>
    </Shell>
  );
}

function Step({
  n: _n,
  icon: Icon,
  title,
  body,
  photo,
}: {
  n: string;
  icon: typeof MapPin;
  title: string;
  body: string;
  photo: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border">
      <FeelPhoto src={photo} sizes={STEP_SIZES} className="aspect-[16/9] w-full object-cover" />
      <div className="p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
        </div>
        <h3 className="mt-4 text-xl">{title}</h3>
        <p className="mt-2 text-sm text-muted">{body}</p>
      </div>
    </div>
  );
}

function Why({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <li className="flex gap-3 rounded-xl bg-surface p-4 ring-1 ring-border">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <p className="text-sm leading-6 text-fg">{text}</p>
    </li>
  );
}

function Quote({ body, by }: { body: string; by: string }) {
  return (
    <blockquote className="rounded-xl bg-bg p-6 shadow-card ring-1 ring-border">
      <p className="text-sm leading-6 text-fg">“{body}”</p>
      <footer className="mt-4 text-xs font-medium text-muted">{by}</footer>
    </blockquote>
  );
}
