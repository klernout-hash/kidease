import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Camera,
  LocateFixed,
  Lock,
  MapPin,
  MessageCircle,
  Search,
  ListChecks,
} from "lucide-react";
import { TrustBar } from "@/components/trust-bar";
import { Shell } from "@/components/shell";
import { BrandMark } from "@/components/brand-mark";
import { ListingRail } from "@/components/listing-rail";
import { DaycareCard } from "@/components/daycare-card";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { RoleEnrollChooser, RoleEnrollDialog } from "@/components/role-enroll";
import { HeroPlayroom } from "@/components/building-photo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyRole } from "@/lib/server/family";
import type { AppRole } from "@/lib/desks";
import { featuredDaycares } from "@/lib/server/daycares";
import { geocode, reverseGeocode, WINNIPEG } from "@/lib/geo";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn, uniqueById } from "@/lib/utils";
import { readRecent } from "@/lib/recent";
import { PlaceSearch, resolveLocationQuery } from "@/components/place-search";
import { LocationConsentCard } from "@/components/location-consent";
import { displayDistance } from "@/lib/units";
import type { DaycareCard as Card } from "@/lib/types";

const CompareBar = lazy(() => import("@/components/compare-bar").then((m) => ({ default: m.CompareBar })));

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => {
    const change = s.change === "1" || s.change === true;
    return change ? { change: "1" as const } : {};
  },
  loader: async () => {
    const featured = await featuredDaycares({ data: { lat: WINNIPEG.lat, lng: WINNIPEG.lng } }).catch(() => [] as Card[]);
    return { featured };
  },
  component: Home,
});

const CITY_CHIPS = [
  { q: "Winnipeg", label: "Winnipeg" },
  { q: "Toronto", label: "Toronto" },
  { q: "Montréal", label: "Montréal" },
  { q: "Vancouver", label: "Vancouver" },
  { q: "Calgary", label: "Calgary" },
  { q: "Ottawa", label: "Ottawa" },
];

function Home() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const boot = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  const origin = useAppStore((s) => s.origin);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const setQuery = useAppStore((s) => s.setQuery);
  const distanceUnit = useAppStore((s) => s.distanceUnit);
  const locationConsent = useAppStore((s) => s.locationConsent);
  const setLocationConsent = useAppStore((s) => s.setLocationConsent);
  const [role, setRole] = useState<AppRole | null>(null);
  const [q, setQ] = useState("");
  const [place, setPlace] = useState(origin.label);
  const [manual, setManual] = useState(Boolean(search.change) || locationConsent === "denied");
  const [denied, setDenied] = useState(locationConsent === "denied");
  const [askLocation, setAskLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [featured, setFeatured] = useState<Card[]>(boot.featured ?? []);
  const [recent, setRecent] = useState<Card[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    void getMyRole()
      .then((r) => setRole(r.role))
      .catch(() => setRole("parent"));
  }, [user]);

  useEffect(() => {
    if (locationConsent === "denied") {
      setDenied(true);
      setManual(true);
    }
  }, [locationConsent]);

  useEffect(() => {
    const loc = origin.lat ? origin : WINNIPEG;
    setPlace(origin.label);
    void featuredDaycares({ data: { lat: loc.lat, lng: loc.lng } })
      .then((rows) => setFeatured(uniqueById(rows)))
      .catch(() => setFeatured([]));
  }, [origin.lat, origin.lng, origin.label]);

  function goSearch(label?: string) {
    void navigate({ to: "/search", search: label ? { q: label } : {} });
  }

  async function applyCity(raw: string) {
    const hit = (await resolveLocationQuery(raw)) ?? geocode(raw);
    if (hit) setOrigin(hit);
    goSearch(hit?.label ?? raw);
  }

  async function applyPlace(raw: string) {
    const hit = (await resolveLocationQuery(raw)) ?? geocode(raw);
    if (hit) {
      setOrigin(hit);
      setPlace(hit.label);
      setQuery(hit.label);
    } else if (raw.trim()) {
      setQuery(raw.trim());
    }
  }

  async function pinHere() {
    setBusy(true);
    const pos = await getDeviceLocation({ precise: true });
    setBusy(false);
    if (pos) {
      setLocationConsent("granted");
      const label = reverseGeocode(pos.lat, pos.lng);
      setOrigin({ lat: pos.lat, lng: pos.lng, label }, "gps");
      setPlace(label);
      void hapticLight();
      return true;
    }
    setLocationConsent("denied");
    setDenied(true);
    setManual(true);
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
  const shown = useMemo(
    () => uniqueById(liveOnly ? featured.filter((r) => r.live) : featured),
    [featured, liveOnly],
  );
  const availableNow = useMemo(() => {
    const open = shown.filter((r) => (r.live || r.availabilityKnown) && r.spotsTotal > 0);
    return uniqueById(open.length ? open : shown).slice(0, 18);
  }, [shown]);
  const availableNextMonth = useMemo(() => {
    const top = new Set(availableNow.slice(0, 6).map((r) => r.id));
    return shown.filter((r) => !top.has(r.id)).slice(0, 18);
  }, [shown, availableNow]);

  async function useLocation() {
    const ok = await pinHere();
    if (ok) {
      goSearch();
      return;
    }
    setDenied(true);
    setManual(true);
  }

  useEffect(() => {
    if (isPending) return;
    if (user && role === "admin") {
      void navigate({ to: "/admin" });
    } else if (user && role === "provider") {
      void navigate({ to: "/provider" });
    }
  }, [isPending, user, role, navigate]);

  const cityChips = (
    <div className="mt-4 flex flex-wrap gap-2">
      {CITY_CHIPS.map((c) => (
        <button
          key={c.q}
          type="button"
          onClick={() => applyCity(c.q)}
          className="min-h-11 rounded-full bg-surface px-3 py-1.5 text-sm text-muted ring-1 ring-border hover:text-fg"
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  const locationForm = (
    <>
      {manual ? (
        <form
          className="mt-5 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) void applyCity(q);
          }}
        >
          {denied ? (
            <p className="mb-2 text-sm text-muted">
              Location is off. Enter a city or postal code to find licensed centres nearby.
            </p>
          ) : null}
          <PlaceSearch
            value={q}
            onChange={setQ}
            onResolved={(hit) => {
              setOrigin(hit);
              setQ(hit.label);
              goSearch(hit.label);
            }}
            placeholder={t("locationPh")}
            origin={origin}
            inputClassName="ke-input w-full min-h-12"
          />
          <Button type="submit" variant="secondary" className="mt-2 min-h-12 w-full" disabled={!q.trim()}>
            {t("search")}
          </Button>
          {cityChips}
        </form>
      ) : (
        <button
          type="button"
          className="mt-5 text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          onClick={() => setManual(true)}
        >
          {t("orEnterCity")}
        </button>
      )}
    </>
  );

  const featuredSearch = (
    <>
      <form
        className="mt-8 flex flex-col gap-2 lg:flex-row lg:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void applyPlace(place);
        }}
      >
        <div className="flex min-h-12 flex-1 items-center gap-2 rounded-full bg-bg px-4 shadow-card ring-1 ring-border">
          <MapPin className="size-4 shrink-0 text-primary" />
          <PlaceSearch
            value={place}
            onChange={setPlace}
            onResolved={(hit) => {
              setOrigin(hit);
              setPlace(hit.label);
              setQuery(hit.label);
            }}
            placeholder={t("locationPh")}
            origin={origin}
            inputClassName="h-11 w-full bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void pinLocation()}
            className="grid size-11 place-items-center text-muted hover:text-fg"
            aria-label={t("useLocation")}
          >
            <LocateFixed className="size-5" />
          </button>
        </div>
        <Button type="submit" className="min-h-12 w-full lg:w-auto">
          {t("search")}
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLiveOnly(true)}
          className={cn(
            "min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1",
            liveOnly ? "bg-primary text-primary-fg ring-primary" : "bg-bg text-fg ring-border",
          )}
        >
          {t("liveOnly")}
        </button>
        <button
          type="button"
          onClick={() => setLiveOnly(false)}
          className={cn(
            "min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1",
            !liveOnly ? "bg-fg text-bg ring-fg" : "bg-bg text-fg ring-border",
          )}
        >
          {t("showAll")} · {shown.length}
        </button>
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
              setManual(true);
            }}
          />
        </div>
      ) : null}
      <p className="mt-3 text-sm text-muted">
        {origin.label.split(",")[0]} · {displayDistance(radiusKm, distanceUnit)} {distanceUnit === "mi" ? t("mi") : t("km")}
      </p>
    </>
  );

  return (
    <Shell bare>
      <div className="[[data-channel=app]_&]:hidden">
        <section className="relative overflow-hidden bg-gradient-to-b from-[#eef2fb] via-bg to-bg">
          <div className="ke-gutter mx-auto grid max-w-6xl items-center gap-10 py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:py-20 xl:py-24">
            <div>
              <BrandMark size="md" align="start" />
              <h1 className="mt-8 max-w-xl text-[clamp(2rem,6vw,3.25rem)] text-fg">{t("tagline")}</h1>
              <p className="mt-4 max-w-lg text-base text-muted md:text-lg">{t("heroSub")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <Button
                  size="lg"
                  className="h-14 min-h-14 w-full px-7 text-base sm:w-auto"
                  onClick={() => void useLocation()}
                  disabled={busy}
                >
                  <Search className="size-5" />
                  {busy ? t("loading") : t("heroCta")}
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-14 min-h-14 w-full px-7 text-base sm:w-auto"
                  onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  {t("howItWorksCta")}
                </Button>
              </div>
              {locationForm}
              <p className="mt-6 text-xs font-medium text-muted">{t("heroTrust")}</p>
            </div>
            <div className="relative">
              <div className="overflow-hidden rounded-xl shadow-lift ring-1 ring-border">
                <HeroPlayroom />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="ke-gutter mx-auto max-w-6xl py-6">
            <TrustBar />
          </div>
        </section>

        <section id="how" className="ke-gutter mx-auto max-w-6xl py-16">
          <h2 className="max-w-2xl text-[clamp(1.75rem,4vw,2.25rem)]">{t("howStressFree")}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Step n="1" icon={MapPin} title={t("how1t")} body={t("how1")} />
            <Step n="2" icon={ListChecks} title={t("how2t")} body={t("how2")} />
            <Step n="3" icon={MessageCircle} title={t("how3t")} body={t("how3")} />
          </div>
        </section>

        <section id="featured" className="bg-surface">
          <div className="ke-gutter mx-auto max-w-6xl py-16">
            <div id="enroll">
              <RoleEnrollChooser heading="h2" className="rounded-xl bg-bg p-5 ring-1 ring-border sm:p-8" />
            </div>

            <h2 className="mt-12 text-[clamp(1.75rem,4vw,2.25rem)]">{t("featured")}</h2>
            <p className="mt-3 max-w-2xl text-muted">{t("featuredBody")}</p>
            {featuredSearch}
            <div className="ke-web-grid mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {shown.slice(0, 9).map((item, i) => (
                <DaycareCard key={item.id} item={item} eager={i < 3} />
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="mt-6 rounded-xl bg-bg p-8 text-center text-muted ring-1 ring-border">
                {liveOnly && featured.length > 0 ? t("noLiveResults") : t("noResults")}
              </p>
            ) : null}
            <div className="mt-8">
              <Button size="lg" onClick={() => goSearch(origin.label)}>
                <Search className="size-5" />
                {t("heroCta")}
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
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
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-3xl md:text-4xl">{t("quotesTitle")}</h2>
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
                document.getElementById("enroll")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {t("enrollNow")}
            </Button>
          </div>
        </section>

        <SiteFooter />
      </div>

      <div className="hidden [[data-channel=app]_&]:block">
        <section className="ke-gutter mx-auto max-w-6xl pb-6 pt-5">
          <h1 className="font-display text-[1.65rem] leading-tight tracking-[-0.03em]">{t("tagline")}</h1>
          <div className="mt-4 flex flex-col gap-2">
            <Button size="lg" className="min-h-12 w-full" onClick={() => void useLocation()} disabled={busy}>
              <Search className="size-5" />
              {busy ? t("loading") : t("useLocation")}
            </Button>
            {locationForm}
          </div>
          {featuredSearch}
          <ListingRail title={t("recentlyViewed")} items={recent} />
          <ListingRail title={t("availableNow")} items={availableNow} />
          <ListingRail title={t("availableNextMonth")} items={availableNextMonth} />
          {shown.length === 0 ? (
            <p className="mt-6 rounded-xl bg-bg p-8 text-center text-muted ring-1 ring-border">
              {liveOnly && featured.length > 0 ? t("noLiveResults") : t("noResults")}
            </p>
          ) : null}
          <div className="mt-8">
            <Button size="lg" className="w-full" onClick={() => goSearch(origin.label)}>
              <Search className="size-5" />
              {t("heroCta")}
            </Button>
          </div>
        </section>
      </div>

      <Suspense fallback={null}>
        <CompareBar />
      </Suspense>
      <RoleEnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} />
    </Shell>
  );
}

function Step({
  n: _n,
  icon: Icon,
  title,
  body,
}: {
  n: string;
  icon: typeof MapPin;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl bg-surface p-6 shadow-card ring-1 ring-border">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
      </div>
      <h3 className="mt-4 text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
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
