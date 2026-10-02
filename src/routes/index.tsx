import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { JsonLd } from "@/components/json-ld";
import { MARKETING_PAGE_SEO, organizationGraphJsonLdScript, pageSeoHead } from "@/lib/page-seo";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Camera, Lock, MapPin, MessageCircle, Search, ListChecks } from "lucide-react";
import { TrustBar } from "@/components/trust-bar";
import { Shell } from "@/components/shell";
import { FacilityTypeRails, type BrowseDaycareType } from "@/components/facility-type-rails";
import { getHomeCareType, setHomeCareType, subscribeHomeCareType } from "@/lib/home-care-selection";
import { ListingRail } from "@/components/listing-rail";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import {
  FeelPhoto,
} from "@/components/building-photo";
import { ChipButton } from "@/components/chip";
import { STEP_SIZES } from "@/lib/photo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyRole } from "@/lib/server/family";
import {
  consumeJustSignedOut,
  DESK_LANDED_KEY,
  homeLandPath,
  readRememberedRole,
  readStickyDesk,
  type AppRole,
} from "@/lib/desks";
import { featuredDaycares } from "@/lib/server/daycares";
import { QUERY_STALE_MS, dedupedQuery } from "@/lib/fn-query";
import { BootPending } from "@/components/boot-pending";
import { HOME_PAINT_BUDGET_MS, ORIGIN_BUDGET_MS, withPaintBudget, withTimeoutFallback } from "@/lib/timeout";
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
import { SmartMatchEntry } from "@/components/smart-match";
import { resolveLocationQuery } from "@/components/place-search";
import { compactExploreSearch } from "@/lib/explore-search";
import { EmptyState } from "@/components/empty-state";
import { LocationConsentCard } from "@/components/location-consent";
import { ResumeVisitCard } from "@/components/resume-visit";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { featuredHomeAgreement, homeLiveStrip } from "@/lib/home-live-strip";
import type { DaycareCard as Card } from "@/lib/types";
import {
  honestVacancy,
  homeRailItems,
  isLiveLookingCard,
  liveLookingOnly,
  type SearchAge,
  type SearchStart,
} from "@/lib/now-loops";

const RoleEnrollChooser = lazy(() =>
  import("@/components/role-enroll").then((m) => ({ default: m.RoleEnrollChooser })),
);
const RoleEnrollDialog = lazy(() =>
  import("@/components/role-enroll").then((m) => ({ default: m.RoleEnrollDialog })),
);

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => {
    const change = s.change === "1" || s.change === true;
    return change ? { change: "1" as const } : {};
  },
  loader: async () => {
    const origin = await withTimeoutFallback(resolveRequestSearchOrigin(), ORIGIN_BUDGET_MS, productHomeOrigin());
    const painted = await withPaintBudget(
      featuredDaycares({ data: { lat: origin.lat, lng: origin.lng, label: origin.label, radiusKm: 25 } }),
      HOME_PAINT_BUDGET_MS,
    );
    return {
      featured: painted.value ?? [],
      featuredReady: painted.ready,
      origin,
    };
  },
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: BootPending,
  head: () => pageSeoHead(MARKETING_PAGE_SEO.home),
  component: Home,
});

function Home() {
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const boot = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  const origin = useAppStore((s) => s.origin);
  const originSource = useAppStore((s) => s.originSource);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const setRadiusKm = useAppStore((s) => s.setRadiusKm);
  const setQuery = useAppStore((s) => s.setQuery);
  const locationConsent = useAppStore((s) => s.locationConsent);
  const setLocationConsent = useAppStore((s) => s.setLocationConsent);
  const [role, setRole] = useState<AppRole | null>(null);
  const [place, setPlace] = useState(() =>
    boot.origin.source === "manual" ? boot.origin.label : t("nearMe"),
  );
  const [homeName, setHomeName] = useState("");
  const [homeType, setHomeType] = useState<BrowseDaycareType | undefined>(() => getHomeCareType());
  useEffect(() => subscribeHomeCareType(setHomeType), []);
  const [homeFrom, setHomeFrom] = useState("");
  const [homeTo, setHomeTo] = useState("");
  const [homeStart, setHomeStart] = useState<SearchStart | "">("");
  const [askLocation, setAskLocation] = useState(false);
  const [, setBusy] = useState(false);
  const [featured, setFeatured] = useState<Card[]>(publicListings(boot.featured ?? []));
  const [featuredReady, setFeaturedReady] = useState(boot.featuredReady !== false);
  const [recent, setRecent] = useState<Card[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);

  useEffect(() => {
    if (!featured.length) return;
    captureMarketplaceFunnel({ step: "explore", source: "home", dest_path: "/search" });
  }, [featured.length]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setRole(null);
      return;
    }
    void dedupedQuery(`home-role:${uid}`, QUERY_STALE_MS, () => getMyRole())
      .then((r) => setRole(r.role))
      .catch(() => setRole("parent"));
  }, [user?.id]);

  useEffect(() => {
    if (trustedSavedOrigin(readSavedOrigin(), { timeZone: readClientTimeZone() })) return;
    const source = useAppStore.getState().originSource;
    if (source === "gps" || source === "manual") return;
    setOrigin(
      { lat: boot.origin.lat, lng: boot.origin.lng, label: boot.origin.label },
      boot.origin.source,
    );
    setPlace(boot.origin.source === "manual" ? boot.origin.label : t("nearMe"));
  }, [boot.origin.lat, boot.origin.lng, boot.origin.label, boot.origin.source, setOrigin]);

  useEffect(() => {
    const loc = originSource ? origin : boot.origin;
    const source = originSource || boot.origin.source;
    setPlace((current) => {
      const near = t("nearMe");
      const nearby = t("whereNearby");
      const untouched = !current.trim() || current === near || current === nearby || current === loc.label;
      if (!untouched && source !== "manual") return current;
      return source === "manual" ? loc.label : near;
    });
  }, [origin.label, originSource, boot.origin.label, boot.origin.source, locale]);

  useEffect(() => {
    const loc = originSource ? origin : boot.origin;
    let cancelled = false;
    const loadFeatured = () => {
      void dedupedQuery(
        `home-featured:${loc.lat},${loc.lng},${radiusKm},${loc.label ?? ""}`,
        QUERY_STALE_MS,
        () => featuredDaycares({ data: { lat: loc.lat, lng: loc.lng, label: loc.label, radiusKm } }),
        { cacheIf: (rows) => rows.length > 0 },
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
      setPlace(resolved.source === "manual" ? label : t("nearMe"));
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
  const strip = homeLiveStrip(liveCount, publicFeatured.length);
  const featuredAgreement = featuredHomeAgreement(publicFeatured.length);
  const shown = useMemo(
    () => uniqueById(liveOnly ? publicFeatured.filter((r) => r.live) : publicFeatured),
    [publicFeatured, liveOnly],
  );
  const liveLookingRail = useMemo(
    () => homeRailItems(liveLookingOnly(publicFeatured), { city: origin.label, label: origin.label }),
    [publicFeatured, origin.label],
  );
  const availableNow = useMemo(() => {
    return uniqueById(liveLookingRail.filter((r) => honestVacancy(r).kind === "open")).slice(0, 18);
  }, [liveLookingRail]);
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
        className="mx-auto mt-1 max-w-[60rem]"
        prominent
        compactSubmit
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
          if (!start) {
            setHomeFrom("");
            setHomeTo("");
          }
        }}
        startCollapsed={false}
        radiusKm={radiusKm}
        onRadiusChange={setRadiusKm}
        onLocate={() => void pinLocation()}
        onSubmit={() => {
          const typed = place.trim();
          const nearMe = typed === t("nearMe") || typed === t("whereNearby");
          if (!typed || nearMe) {
            goSearch(origin.label, {
              name: homeName,
              from: homeFrom,
              to: homeTo,
              start: homeStart || undefined,
            });
            return;
          }
          void applyPlace(typed).then((hit) => {
            goSearch(hit?.label || typed || origin.label, {
              name: homeName,
              from: homeFrom,
              to: homeTo,
              start: homeStart || undefined,
            });
          });
        }}
      />
      <SmartMatchEntry />

      {featuredReady && strip.liveCount > 0 ? (
        <div className="mt-4 flex min-h-11 flex-wrap gap-2" data-ke="home-live-strip">
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
    </>
  );

  return (
    <Shell bare>
      <JsonLd json={organizationGraphJsonLdScript()} />
      <div className="ke-home w-full min-w-0">
      <h1 className="ke-gutter mx-auto w-full pt-4 text-[clamp(1.6rem,4.2vw,2.75rem)] leading-tight tracking-[-0.03em]">
        {t("tagline")}
      </h1>
      <div className="ke-home-web ke-web-only w-full [[data-channel=app]_&]:hidden">
        <section className="from-soft border-b border-border bg-bg">
          <div className="ke-gutter mx-auto w-full pb-4 pt-1">
            {featuredSearch}
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="ke-gutter mx-auto w-full py-6">
            <TrustBar />
          </div>
        </section>

        {!featuredReady || featuredAgreement.showSection ? (
        <section id="featured" className="ke-gutter mx-auto w-full py-8 md:py-12">
          <h2 className="text-xl tracking-[-0.03em] md:text-2xl">{t(strip.featuredTitleKey)}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">{t("featuredBody")}</p>
          <ResumeVisitCard />
          <HomeDiscovery
            ready={featuredReady}
            shown={shown}
            availableNow={availableNow}
            availableNextMonth={availableNextMonth}
            recent={recentLooking}
            liveOnly={liveOnly}
            hasPublic={publicFeatured.length > 0}
            onShowAll={() => setLiveOnly(false)}
            careType={homeType}
            onCareType={(type) => setHomeCareType(type)}
            city={origin.label}
          />
          <div className="mt-6">
            <Button size="md" variant="secondary" className="rounded-[14px]" onClick={() => goSearch(origin.label)}>
              <Search className="size-5" />
              {t("heroCta")}
            </Button>
          </div>
        </section>
        ) : null}

        <section id="how" className="ke-gutter mx-auto w-full py-16">
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

        <SiteFooter />
      </div>

      <div className="ke-home-app ke-app-only hidden w-full [[data-channel=app]_&]:block">
        <section className="border-b border-border bg-bg">
          <div className="ke-gutter mx-auto w-full pb-4 pt-2">
            {featuredSearch}
          </div>
        </section>
        <section className="ke-gutter mx-auto w-full py-6">
          <h2 className="text-xl tracking-[-0.03em]">{t(strip.featuredTitleKey)}</h2>
          <ResumeVisitCard />
          <HomeDiscovery
            ready={featuredReady}
            shown={shown}
            availableNow={availableNow}
            availableNextMonth={availableNextMonth}
            recent={recentLooking}
            liveOnly={liveOnly}
            hasPublic={publicFeatured.length > 0}
            onShowAll={() => setLiveOnly(false)}
            careType={homeType}
            onCareType={(type) => setHomeCareType(type)}
            city={origin.label}
          />
          <div className="mt-6">
            <Button size="md" variant="secondary" className="w-full rounded-[14px]" onClick={() => goSearch(origin.label)}>
              <Search className="size-5" />
              {t("heroCta")}
            </Button>
          </div>
        </section>
      </div>
      </div>

      <Suspense fallback={null}>
        <RoleEnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} />
      </Suspense>
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
  careType,
  onCareType,
  city,
}: {
  ready: boolean;
  shown: Card[];
  availableNow: Card[];
  availableNextMonth: Card[];
  recent: Card[];
  liveOnly: boolean;
  hasPublic: boolean;
  onShowAll: () => void;
  careType?: BrowseDaycareType;
  onCareType?: (type?: BrowseDaycareType) => void;
  city?: string;
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
      <FacilityTypeRails items={shown} visual skipLiveLooking menu={!onCareType} selected={careType} onSelect={onCareType} city={city} />
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
      <footer className="mt-4 text-xs font-medium text-muted">{by}</footer>
    </blockquote>
  );
}
