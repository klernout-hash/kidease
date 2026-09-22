import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CityHubLinks } from "@/components/city-hub-links";
import { JsonLd } from "@/components/json-ld";
import { MARKETING_PAGE_SEO, organizationGraphJsonLdScript, pageSeoHead } from "@/lib/page-seo";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Camera, Lock, MapPin, MessageCircle, Search, ListChecks } from "lucide-react";
import { TrustBar } from "@/components/trust-bar";
import { Shell } from "@/components/shell";
import { BrandMark } from "@/components/brand-mark";
import { FacilityTypeRails } from "@/components/facility-type-rails";
import { ListingRail } from "@/components/listing-rail";
import { ParentDeskRails } from "@/components/parent-desk-rails";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { RoleEnrollChooser, RoleEnrollDialog } from "@/components/role-enroll";
import {
  FeelPhoto,
  HeroYard,
  HERO_LCP_AVIF_SRCSET,
  HERO_LCP_SIZES,
} from "@/components/building-photo";
import { ChipButton } from "@/components/chip";
import { HomePopularCities } from "@/components/home-popular-cities";
import { HERO_SIZES, STEP_SIZES } from "@/lib/photo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getFamily, getMyRole } from "@/lib/server/family";
import {
  consumeJustSignedOut,
  DESK_LANDED_KEY,
  homeLandPath,
  readRememberedRole,
  readStickyDesk,
  type AppRole,
} from "@/lib/desks";
import { featuredDaycares, searchDaycares } from "@/lib/server/daycares";
import { BootPending } from "@/components/boot-pending";
import { LOADER_SETTLE_MS, ORIGIN_BUDGET_MS, PAINT_BUDGET_MS, withPaintBudget, withTimeoutFallback } from "@/lib/timeout";
import { geocode, readSavedOrigin, reverseGeocode } from "@/lib/geo";
import { originFromDeviceFix, productHomeOrigin, readClientTimeZone, trustedSavedOrigin } from "@/lib/default-origin";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { resolveRequestSearchOrigin } from "@/lib/server/request-origin";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { uniqueById } from "@/lib/utils";
import { publicListings } from "@/lib/listing-visibility";
import { readRecent } from "@/lib/recent";
import { ExploreSearchBar } from "@/components/explore-search-bar";
import { resolveLocationQuery } from "@/components/place-search";
import { CITY_HUB_DEFS, cityHubChipLabel, cityHubSearchQuery } from "@/lib/city-hubs";
import { compactExploreSearch, guestHeroSearch } from "@/lib/explore-search";
import { popularHomeCities } from "@/lib/home-popular-cities";
import { EmptyState } from "@/components/empty-state";
import { LocationConsentCard } from "@/components/location-consent";
import { RateKidEasePrompt } from "@/components/rate-kidease";
import { ResumeVisitCard } from "@/components/resume-visit";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { displayDistance } from "@/lib/units";
import type { Booking, Child, DaycareCard as Card } from "@/lib/types";
import {
  honestVacancy,
  homeRailItems,
  isLiveLookingCard,
  liveLookingOnly,
  startWindowToDate,
  type SearchAge,
  type SearchStart,
} from "@/lib/now-loops";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => {
    const change = s.change === "1" || s.change === true;
    return change ? { change: "1" as const } : {};
  },
  loader: async () => {
    const origin = await withTimeoutFallback(resolveRequestSearchOrigin(), ORIGIN_BUDGET_MS, productHomeOrigin());
    const painted = await withPaintBudget(
      featuredDaycares({ data: { lat: origin.lat, lng: origin.lng, label: origin.label } }),
      PAINT_BUDGET_MS,
    );
    return { featured: painted.value ?? [], featuredReady: painted.ready, origin };
  },
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: BootPending,
  head: () => {
    const seo = pageSeoHead(MARKETING_PAGE_SEO.home);
    return {
      ...seo,
      links: [
        ...seo.links,
        {
          rel: "preload",
          as: "image",
          type: "image/avif",
          href: "/photos/hero-768-k2.avif?v=1",
          imageSrcSet: HERO_LCP_AVIF_SRCSET,
          imageSizes: HERO_LCP_SIZES,
          fetchPriority: "high",
        },
      ],
    };
  },
  component: Home,
});

function Home() {
  const { t, locale } = useCopy();
  const CITY_CHIPS = CITY_HUB_DEFS.map((hub) => ({
    slug: hub.slug,
    q: cityHubSearchQuery(hub),
    label: cityHubChipLabel(hub, locale),
  }));
  const navigate = useNavigate();
  const boot = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  const origin = useAppStore((s) => s.origin);
  const originSource = useAppStore((s) => s.originSource);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const setQuery = useAppStore((s) => s.setQuery);
  const distanceUnit = useAppStore((s) => s.distanceUnit);
  const locationConsent = useAppStore((s) => s.locationConsent);
  const setLocationConsent = useAppStore((s) => s.setLocationConsent);
  const popularCities = useMemo(
    () =>
      popularHomeCities(
        {
          lat: originSource ? origin.lat : boot.origin.lat,
          lng: originSource ? origin.lng : boot.origin.lng,
          label: originSource ? origin.label : boot.origin.label,
          source: originSource ?? boot.origin.source,
          timeZone: readClientTimeZone(),
        },
        locale,
      ),
    [
      boot.origin.lat,
      boot.origin.lng,
      boot.origin.label,
      boot.origin.source,
      locale,
      origin.lat,
      origin.label,
      origin.lng,
      originSource,
    ],
  );
  const [role, setRole] = useState<AppRole | null>(null);
  const [place, setPlace] = useState(origin.label);
  const [homeName, setHomeName] = useState("");
  const [homeFrom, setHomeFrom] = useState("");
  const [homeTo, setHomeTo] = useState("");
  const [homeStart, setHomeStart] = useState<SearchStart | "">("");
  const [askLocation, setAskLocation] = useState(false);
  const [, setBusy] = useState(false);
  const [featured, setFeatured] = useState<Card[]>(publicListings(boot.featured ?? []));
  const [featuredReady, setFeaturedReady] = useState(boot.featuredReady !== false);
  const [recent, setRecent] = useState<Card[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [familyKids, setFamilyKids] = useState<Child[]>([]);
  const [familyBookings, setFamilyBookings] = useState<Booking[]>([]);
  const [explore, setExplore] = useState<Card[]>(publicListings(boot.featured ?? []));

  useEffect(() => {
    if (!featured.length) return;
    captureMarketplaceFunnel({ step: "explore", source: "home", dest_path: "/search" });
  }, [featured.length]);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setFamilyKids([]);
      setFamilyBookings([]);
      return;
    }
    void getMyRole()
      .then((r) => setRole(r.role))
      .catch(() => setRole("parent"));
    void getFamily()
      .then((f) => {
        setFamilyKids(f.children);
        setFamilyBookings(f.bookings);
      })
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    if (trustedSavedOrigin(readSavedOrigin(), { timeZone: readClientTimeZone() })) return;
    const source = useAppStore.getState().originSource;
    if (source === "gps" || source === "manual") return;
    setOrigin(
      { lat: boot.origin.lat, lng: boot.origin.lng, label: boot.origin.label },
      boot.origin.source,
    );
    setPlace(boot.origin.label);
  }, [boot.origin.lat, boot.origin.lng, boot.origin.label, boot.origin.source, setOrigin]);

  useEffect(() => {
    const loc = origin.lat ? origin : boot.origin;
    setPlace(origin.label);
    void featuredDaycares({ data: { lat: loc.lat, lng: loc.lng, label: loc.label } })
      .then((rows) => {
        const next = publicListings(uniqueById(rows));
        setFeatured(next);
        setFeaturedReady(true);
        setExplore((cur) => (cur.length ? cur : next));
      })
      .catch(() => {
        setFeatured([]);
        setFeaturedReady(true);
      });
    void withTimeoutFallback(
      searchDaycares({
        data: {
          lat: loc.lat,
          lng: loc.lng,
          radiusKm,
          sort: "match",
          ageGroup: "any",
          label: loc.label,
          q: loc.label,
        },
      }),
      LOADER_SETTLE_MS,
      [] as Card[],
    )
      .then((rows) => {
        if (rows.length) setExplore(publicListings(uniqueById(rows)));
      })
      .catch(() => undefined);
  }, [origin.lat, origin.lng, origin.label, radiusKm, boot.origin]);

  function goSearch(label?: string, extra?: { name?: string; from?: string; to?: string; age?: SearchAge; start?: SearchStart }) {
    const fields = compactExploreSearch({
      q: label,
      name: extra?.name,
      from: extra?.from,
      to: extra?.to,
    });
    const age = extra?.age || undefined;
    const start = extra?.start || homeStart || undefined;
    void navigate({
      to: "/search",
      search: {
        q: fields.q,
        name: fields.name,
        from: fields.from,
        to: fields.to,
        age: age || undefined,
        start: start || undefined,
      },
    });
  }

  async function applyCity(raw: string) {
    const hit = (await resolveLocationQuery(raw)) ?? geocode(raw);
    if (hit) setOrigin({ ...hit, explicit: true }, "manual");
    const fields = guestHeroSearch(raw, hit);
    goSearch(fields.q, { name: fields.name });
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

  async function pinHere() {
    setBusy(true);
    const pos = await getDeviceLocation({ precise: true });
    setBusy(false);
    if (pos) {
      setLocationConsent("granted");
      const resolved = originFromDeviceFix(pos, boot.origin, { timeZone: readClientTimeZone() });
      const label = resolved.source === "gps" ? reverseGeocode(pos.lat, pos.lng) : resolved.label;
      setOrigin({ lat: resolved.lat, lng: resolved.lng, label, explicit: resolved.source === "gps" }, resolved.source);
      setPlace(label);
      void hapticLight();
      return true;
    }
    setLocationConsent("denied");
    return false;
  }

  async function pinLocation() {
    if (locationConsent !== "granted") {
      setAskLocation(true);
      return;
    }
    await pinHere();
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
  const liveCount = useMemo(() => publicFeatured.filter((r) => r.live).length, [publicFeatured]);
  const shown = useMemo(
    () =>
      homeRailItems(liveLookingOnly(uniqueById(liveOnly ? publicFeatured.filter((r) => r.live) : publicFeatured)), {
        city: origin.label,
        label: origin.label,
      }),
    [publicFeatured, liveOnly, origin.label],
  );
  const availableNow = useMemo(() => {
    return uniqueById(shown.filter((r) => honestVacancy(r).kind === "open")).slice(0, 18);
  }, [shown]);
  const availableNextMonth = useMemo(() => {
    const top = new Set(availableNow.slice(0, 6).map((r) => r.id));
    return shown.filter((r) => honestVacancy(r).kind === "open" && !top.has(r.id)).slice(0, 18);
  }, [shown, availableNow]);
  const recentLooking = useMemo(() => recent.filter((r) => isLiveLookingCard(r)), [recent]);

  useEffect(() => {
    if (isPending) return;
    try {
      if (sessionStorage.getItem(DESK_LANDED_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    if (consumeJustSignedOut()) return;
    if (!user) return;
    const dest = homeLandPath({ role, sticky: readStickyDesk(), remembered: readRememberedRole() });
    if (!dest) return;
    try {
      sessionStorage.setItem(DESK_LANDED_KEY, "1");
    } catch {
      /* ignore */
    }
    void navigate({ to: dest });
  }, [isPending, user, role, navigate]);

  const featuredSearch = (
    <>
      <ExploreSearchBar
        className="mt-5 lg:mt-8"
        values={{ where: place, name: homeName, from: homeFrom, to: homeTo }}
        origin={origin}
        start={homeStart}
        onWhereChange={setPlace}
        onWhereResolved={(hit) => {
          setOrigin({ ...hit, explicit: true }, "manual");
          setPlace(hit.label);
          setQuery(hit.label);
        }}
        onNameChange={setHomeName}
        onDatesChange={({ from, to }) => {
          setHomeFrom(from);
          setHomeTo(to);
        }}
        onStartChange={(start) => {
          setHomeStart(start);
          if (start) {
            setHomeFrom(startWindowToDate(start));
            setHomeTo("");
          } else {
            setHomeFrom("");
            setHomeTo("");
          }
        }}
        startCollapsed
        onLocate={() => void pinLocation()}
        onSubmit={() => {
          void applyPlace(place).then((hit) => {
            goSearch(hit?.label || place.trim() || origin.label, {
              name: homeName,
              from: homeStart ? startWindowToDate(homeStart) : homeFrom,
              to: homeTo,
              start: homeStart || undefined,
            });
          });
        }}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <ChipButton on={liveOnly} onClick={() => setLiveOnly(true)}>
          {liveCount > 0 ? t("liveToggleCount").replace("{n}", String(liveCount)) : t("liveOnly")}
        </ChipButton>
        <ChipButton on={!liveOnly} onClick={() => setLiveOnly(false)}>
          {t("allToggleCount").replace("{n}", String(publicFeatured.length))}
        </ChipButton>
      </div>

      {askLocation ? (
        <div className="mt-3">
          <LocationConsentCard
            onAllow={() => {
              setAskLocation(false);
              void pinHere();
            }}
            onLater={() => {
              setAskLocation(false);
            }}
          />
        </div>
      ) : null}
      <p className="mt-3 text-sm text-muted">
        {origin.label.split(",")[0]} · {displayDistance(radiusKm, distanceUnit)}{" "}
        {distanceUnit === "mi" ? t("mi") : t("km")}
      </p>
    </>
  );

  return (
    <Shell bare>
      <JsonLd json={organizationGraphJsonLdScript()} />
      <div className="ke-web-only [[data-channel=app]_&]:hidden">
        <section className="relative overflow-hidden bg-gradient-to-b from-soft via-bg to-bg">
          <div className="ke-gutter mx-auto grid max-w-6xl items-center gap-10 py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:py-20 xl:py-24">
            <div>
              <BrandMark size="md" align="start" />
              <h1 className="mt-8 max-w-xl text-[clamp(2rem,6vw,3.25rem)] text-fg">
                {t("tagline")}
              </h1>
              <p className="mt-4 max-w-lg text-base text-muted md:text-lg">{t("heroSub")}</p>
              {featuredSearch}
              <HomePopularCities
                cities={popularCities}
                label={t("heroPopular")}
                onSelect={(query) => void applyCity(query)}
              />
              <CityHubLinks className="mt-5" />
              <p className="mt-6 text-xs font-medium text-muted">{t("heroTrust")}</p>
            </div>
            <div className="relative">
              <div className="overflow-hidden rounded-[14px] shadow-card ring-1 ring-border">
                <HeroYard />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="ke-gutter mx-auto max-w-6xl py-6">
            <TrustBar />
          </div>
        </section>

        <section id="featured" className="ke-gutter mx-auto max-w-6xl py-8 md:py-12">
          <h2 className="text-xl tracking-[-0.03em] md:text-2xl">{t("featured")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">{t("featuredBody")}</p>
          <ResumeVisitCard />
          {user && role !== "admin" && role !== "provider" ? (
            <ParentDeskRails
              items={explore.length ? explore : shown}
              children={familyKids}
              bookings={familyBookings}
            />
          ) : (
            <HomeDiscovery
              ready={featuredReady}
              shown={shown}
              availableNow={availableNow}
              availableNextMonth={availableNextMonth}
              recent={recentLooking}
              liveOnly={liveOnly}
              hasPublic={publicFeatured.length > 0}
              onShowAll={() => setLiveOnly(false)}
            />
          )}
          <div className="mt-6">
            <Button size="md" variant="secondary" className="rounded-[14px]" onClick={() => goSearch(origin.label)}>
              <Search className="size-5" />
              {t("heroCta")}
            </Button>
          </div>
        </section>

        <section id="how" className="ke-gutter mx-auto max-w-6xl py-16">
          <h2 className="max-w-2xl text-[clamp(1.75rem,4vw,2.25rem)]">{t("howStressFree")}</h2>
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
          <div className="ke-gutter mx-auto max-w-6xl py-16">
            <div id="enroll">
              <RoleEnrollChooser
                heading="h2"
                className="rounded-xl bg-bg p-5 ring-1 ring-border sm:p-8"
              />
            </div>

          </div>
        </section>

        <section className="ke-defer-paint ke-gutter mx-auto max-w-6xl py-16">
          <h2 className="text-3xl md:text-4xl">{t("trustWhyTitle")}</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            <Why icon={BadgeCheck} text={t("trustWhy1")} />
            <Why icon={Camera} text={t("trustWhy2")} />
            <Why icon={ListChecks} text={t("trustWhy3")} />
            <Why icon={Lock} text={t("trustWhy4")} />
          </ul>
          <p className="mt-8 max-w-2xl text-muted">{t("trustWhyLocal")}</p>
        </section>

        <section className="ke-defer-paint bg-surface">
          <div className="ke-gutter mx-auto max-w-6xl py-16">
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

        {!user ? (
          <section className="border-t border-border bg-bg" aria-label={t("rateKidEase")}>
            {/*
              Guest www homepage (logged-out): Rate KidEase is intentionally public,
              not Account-only. Same prompt as /account. Web → rateKidEaseFromMenu → /get-app.
              No live App Store / Play calls. Cookie consent banner stays on the root layout.
            */}
            <div className="ke-gutter mx-auto max-w-lg py-12">
              <RateKidEasePrompt />
            </div>
          </section>
        ) : null}

        <SiteFooter />
      </div>

      <div className="ke-app-only hidden [[data-channel=app]_&]:block">
        <section className="ke-gutter mx-auto max-w-6xl pb-6 pt-5">
          <div className="overflow-hidden rounded-xl shadow-card ring-1 ring-border">
            <FeelPhoto src="/photos/hero.jpg" eager sizes={HERO_SIZES} className="aspect-[16/9] w-full object-cover" />
          </div>
          <h1 className="mt-4 font-display text-[1.65rem] leading-tight tracking-[-0.03em]">
            {t("tagline")}
          </h1>
          {featuredSearch}
          <ResumeVisitCard />
          <div className="mt-4 flex flex-wrap gap-2">
            {CITY_CHIPS.map((c) => (
              <ChipButton key={c.slug} className="whitespace-nowrap" onClick={() => void applyPlace(c.q)}>
                {c.label}
              </ChipButton>
            ))}
          </div>
          {user ? (
            <ParentDeskRails
              items={explore.length ? explore : shown}
              children={familyKids}
              bookings={familyBookings}
            />
          ) : (
            <>
              <ListingRail title={t("recentlyViewed")} items={recentLooking} eagerThumbs={false} visual />
              <ListingRail title={t("availableNow")} items={availableNow} eagerThumbs={false} visual />
              <ListingRail title={t("availableNextMonth")} items={availableNextMonth} eagerThumbs={false} visual />
              <FacilityTypeRails items={shown} visual />
              {!featuredReady && shown.length === 0 ? (
                <HomeCardSkeleton />
              ) : shown.length === 0 ? (
                <div className="mt-6 rounded-xl bg-bg ring-1 ring-border">
                    <EmptyState
                      title={liveOnly && publicFeatured.length > 0 ? t("noLiveResults") : t("noResults")}
                      body={liveOnly && publicFeatured.length > 0 ? t("noLiveResultsLead") : t("noResultsLead")}
                      action={liveOnly && publicFeatured.length > 0 ? t("showAll") : t("changeLocation")}
                      onAction={liveOnly && publicFeatured.length > 0 ? () => setLiveOnly(false) : undefined}
                      actionTo={liveOnly && publicFeatured.length > 0 ? undefined : "/?change=1"}
                      secondary={liveOnly && publicFeatured.length > 0 ? t("noLiveResultsClaim") : undefined}
                      secondaryTo={liveOnly && publicFeatured.length > 0 ? "/claim" : undefined}
                    />
                </div>
              ) : null}
            </>
          )}
          <div className="mt-8">
            <Button size="md" variant="secondary" className="w-full rounded-[14px]" onClick={() => goSearch(origin.label)}>
              <Search className="size-5" />
              {t("heroCta")}
            </Button>
          </div>
        </section>
      </div>

      <RoleEnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} />
    </Shell>
  );
}

function HomeDiscovery({
  ready,
  shown,
  availableNow,
  availableNextMonth,
  recent,
  liveOnly,
  hasPublic,
  onShowAll,
}: {
  ready: boolean;
  shown: Card[];
  availableNow: Card[];
  availableNextMonth: Card[];
  recent: Card[];
  liveOnly: boolean;
  hasPublic: boolean;
  onShowAll: () => void;
}) {
  const { t } = useCopy();
  if (!ready && shown.length === 0) return <HomeCardSkeleton />;
  if (shown.length === 0) {
    return (
      <div className="mt-6 rounded-xl bg-bg ring-1 ring-border">
        <EmptyState
          title={liveOnly && hasPublic ? t("noLiveResults") : t("noResults")}
          body={liveOnly && hasPublic ? t("noLiveResultsLead") : t("noResultsLead")}
          action={liveOnly && hasPublic ? t("showAll") : t("changeLocation")}
          onAction={liveOnly && hasPublic ? onShowAll : undefined}
          actionTo={liveOnly && hasPublic ? undefined : "/?change=1"}
          secondary={liveOnly && hasPublic ? t("noLiveResultsClaim") : undefined}
          secondaryTo={liveOnly && hasPublic ? "/claim" : undefined}
        />
      </div>
    );
  }
  return (
    <>
      <ListingRail title={t("recentlyViewed")} items={recent} eagerThumbs={false} visual />
      <ListingRail title={t("availableNow")} items={availableNow} eagerThumbs={false} visual />
      <ListingRail title={t("availableNextMonth")} items={availableNextMonth} eagerThumbs={false} visual />
      <FacilityTypeRails items={shown} visual />
    </>
  );
}

function HomeCardSkeleton() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2" aria-hidden="true">
          <div className="ke-skel aspect-[4/3] w-full" />
          <div className="ke-skel h-4 w-3/4" />
          <div className="ke-skel h-3 w-1/2" />
        </div>
      ))}
    </div>
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
      <footer className="mt-4 text-xs font-medium text-muted">— {by}</footer>
    </blockquote>
  );
}
