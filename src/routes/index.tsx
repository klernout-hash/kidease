import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LocateFixed,
  MapPin,
  MessageCircle,
  Search,
  ListChecks,
} from "lucide-react";
import { TrustBar } from "@/components/trust-bar";
import { Shell } from "@/components/shell";
import { BrandMark } from "@/components/brand-mark";
import { ListingRail } from "@/components/listing-rail";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { CompareBar } from "@/components/compare-bar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyRole } from "@/lib/server/family";
import { searchDaycares } from "@/lib/server/daycares";
import { geocode, reverseGeocode, WINNIPEG } from "@/lib/geo";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { readRecent } from "@/lib/recent";
import type { DaycareCard as Card } from "@/lib/types";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => {
    const change = s.change === "1" || s.change === true;
    return change ? { change: "1" as const } : {};
  },
  component: Home,
});

const CITY_CHIPS = [
  { q: "Winnipeg", label: "Winnipeg" },
  { q: "Toronto", label: "Toronto" },
  { q: "Montreal", label: "Montreal" },
  { q: "Vancouver", label: "Vancouver" },
  { q: "Calgary", label: "Calgary" },
  { q: "Ottawa", label: "Ottawa" },
];

function Home() {
  const { t } = useCopy();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const origin = useAppStore((s) => s.origin);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const liveOnly = useAppStore((s) => s.liveOnly);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const setQuery = useAppStore((s) => s.setQuery);
  const [role, setRole] = useState<"parent" | "provider" | null>(null);
  const [q, setQ] = useState("");
  const [place, setPlace] = useState(origin.label);
  const [manual, setManual] = useState(Boolean(search.change));
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [featured, setFeatured] = useState<Card[]>([]);
  const [recent, setRecent] = useState<Card[]>([]);

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
    const loc = origin.lat ? origin : WINNIPEG;
    setPlace(origin.label);
    void searchDaycares({
      data: { lat: loc.lat, lng: loc.lng, radiusKm, sort: "distance", ageGroup: "any" },
    })
      .then(setFeatured)
      .catch(() => setFeatured([]));
  }, [origin.lat, origin.lng, origin.label, radiusKm]);

  function goSearch(label?: string) {
    void navigate({ to: "/search", search: label ? { q: label } : {} });
  }

  function applyCity(raw: string) {
    const hit = geocode(raw);
    if (hit) setOrigin(hit);
    goSearch(hit?.label ?? raw);
  }

  function applyPlace(raw: string) {
    const hit = geocode(raw);
    if (hit) {
      setOrigin(hit);
      setPlace(hit.label);
      setQuery(hit.label);
    } else if (raw.trim()) {
      setQuery(raw.trim());
    }
  }

  async function pinLocation() {
    setBusy(true);
    const pos = await getDeviceLocation();
    setBusy(false);
    if (pos) {
      const label = reverseGeocode(pos.lat, pos.lng);
      setOrigin({ lat: pos.lat, lng: pos.lng, label });
      setPlace(label);
      void hapticLight();
    }
  }

  useEffect(() => {
    function sync() {
      setRecent(readRecent());
    }
    sync();
    window.addEventListener("kidease-recent", sync);
    return () => window.removeEventListener("kidease-recent", sync);
  }, []);
  const liveCount = useMemo(() => featured.filter((r) => r.live).length, [featured]);
  const shown = useMemo(
    () => (liveOnly ? featured.filter((r) => r.live) : featured),
    [featured, liveOnly],
  );
  const availableNow = useMemo(() => {
    const open = shown.filter((r) => (r.live || r.availabilityKnown) && r.spotsTotal > 0);
    return (open.length ? open : shown).slice(0, 18);
  }, [shown]);
  const availableNextMonth = useMemo(() => {
    const top = new Set(availableNow.slice(0, 6).map((r) => r.id));
    const rest = shown.filter((r) => !top.has(r.id));
    return (rest.length ? rest : shown.slice(6)).slice(0, 18);
  }, [shown, availableNow]);

  async function useLocation() {
    setBusy(true);
    const pos = await getDeviceLocation();
    setBusy(false);
    if (pos) {
      setOrigin({ lat: pos.lat, lng: pos.lng, label: reverseGeocode(pos.lat, pos.lng) });
      void hapticLight();
      goSearch();
      return;
    }
    setDenied(true);
    setManual(true);
  }

  if (isPending || (user && !role)) {
    return (
      <Shell bare>
        <main className="grid min-h-[70dvh] place-items-center px-4">
          <p className="text-sm text-muted">{t("loading")}</p>
        </main>
      </Shell>
    );
  }

  if (user && role === "provider") return <Navigate to="/provider" />;

  return (
    <Shell bare>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#eef2fb] via-bg to-bg">
        <div className="ke-gutter mx-auto grid max-w-6xl items-center gap-10 py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:py-20 xl:py-24">
          <div>
            <BrandMark size="md" align="start" />
            <h1 className="mt-8 max-w-xl text-[clamp(2rem,6vw,3.25rem)] text-fg">{t("tagline")}</h1>
            <p className="mt-4 max-w-lg text-base text-muted md:text-lg">{t("heroSub")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" className="min-h-12 w-full sm:w-auto" onClick={() => void useLocation()} disabled={busy}>
                <Search className="size-5" />
                {busy ? t("loading") : t("heroCta")}
              </Button>
              <Button size="lg" variant="secondary" className="min-h-12 w-full sm:w-auto" asChild>
                <a href="#how">{t("howItWorksCta")}</a>
              </Button>
            </div>
            {manual ? (
              <form className="mt-5 max-w-md" onSubmit={(e) => { e.preventDefault(); if (q.trim()) applyCity(q); }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("locationPh")} className="ke-input" />
                <Button type="submit" variant="secondary" className="mt-2 w-full" disabled={!q.trim()}>{t("search")}</Button>
                {denied ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {CITY_CHIPS.map((c) => (
                      <button key={c.q} type="button" onClick={() => applyCity(c.q)} className="rounded-full bg-surface px-3 py-1.5 text-sm text-muted ring-1 ring-border hover:text-fg">{c.label}</button>
                    ))}
                  </div>
                ) : null}
              </form>
            ) : (
              <button type="button" className="mt-5 text-sm text-muted underline-offset-4 hover:text-fg hover:underline" onClick={() => setManual(true)}>
                {t("orEnterCity")}
              </button>
            )}
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-xl shadow-lift ring-1 ring-border">
              <img src="/photos/playroom.jpg" alt="" className="aspect-[4/3] w-full object-cover" />
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
          <Step icon={MapPin} title={t("how1t")} body={t("how1")} />
          <Step icon={ListChecks} title={t("how2t")} body={t("how2")} />
          <Step icon={MessageCircle} title={t("how3t")} body={t("how3")} />
        </div>
      </section>

      <section id="featured" className="bg-surface">
        <div className="ke-gutter mx-auto max-w-6xl py-16">
          <h2 className="text-[clamp(1.75rem,4vw,2.25rem)]">{t("featured")}</h2>
          <form className="mt-8 flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); applyPlace(place); }}>
            <div className="flex min-h-12 flex-1 items-center gap-2 rounded-full bg-bg px-4 shadow-card ring-1 ring-border">
              <MapPin className="size-4 shrink-0 text-primary" />
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("locationPh")} className="h-11 flex-1 bg-transparent text-sm outline-none" aria-label={t("locationPh")} />
              <button type="button" onClick={() => void pinLocation()} className="grid size-11 place-items-center text-muted hover:text-fg" aria-label={t("useLocation")}>
                <LocateFixed className="size-5" />
              </button>
            </div>
            <Button type="submit" className="min-h-11 w-full lg:w-auto">{t("search")}</Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setLiveOnly(true)} className={cn("rounded-full px-4 py-2 text-sm font-medium ring-1", liveOnly ? "bg-primary text-primary-fg ring-primary" : "bg-bg text-fg ring-border")}>
              {t("liveOnly")} {liveCount}
            </button>
            <button type="button" onClick={() => setLiveOnly(false)} className={cn("rounded-full px-4 py-2 text-sm font-medium ring-1", !liveOnly ? "bg-fg text-bg ring-fg" : "bg-bg text-fg ring-border")}>
              {t("showAll")} {featured.length}
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">{origin.label.split(",")[0]} {radiusKm} {t("km")}</p>
          <ListingRail title={t("recentlyViewed")} items={recent} />
          <ListingRail title={t("availableNow")} items={availableNow} />
          <ListingRail title={t("availableNextMonth")} items={availableNextMonth} />
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

      <section className="bg-primary text-primary-fg">
        <div className="ke-gutter mx-auto max-w-3xl py-16 text-center">
          <h2 className="text-3xl text-primary-fg md:text-4xl">{t("finalCtaTitle")}</h2>
          <Button size="lg" variant="secondary" className="mt-8" onClick={() => void useLocation()} disabled={busy}>
            <Search className="size-5" />
            {t("heroCta")}
          </Button>
        </div>
      </section>

      <SiteFooter />
      <CompareBar />
    </Shell>
  );
}

function Step({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof MapPin;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl bg-surface p-6 shadow-card ring-1 ring-border">
      <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}
