import { useEffect, type ReactNode } from "react";
import { GovHelp } from "@/components/gov/gov-help";
import { signOut } from "@/lib/auth/client";
import { govCopy, govPath } from "@/lib/gov/copy";
import { GOV_MENU, govMenuHref, govMenuLabel, type GovSection } from "@/lib/gov/menu";
import { regionLabel } from "@/lib/gov/places";
import type { GovLocale } from "@/lib/gov/aggregate";

function withSearch(path: string, province: string, region: string, city: string) {
  const query = new URLSearchParams();
  if (province) query.set("province", province);
  if (region && region !== "ALL") query.set("region", region);
  if (city && city !== "ALL") query.set("city", city);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export function scrollGovMain() {
  if (typeof document === "undefined") return;
  document.getElementById("gov-main")?.scrollIntoView({ block: "start" });
}

export function GovFrame({
  locale,
  section,
  province,
  region,
  city,
  regions,
  cities,
  asOf,
  orgName,
  onFilter,
  onSearch,
  search,
  children,
}: {
  locale: GovLocale;
  section: GovSection;
  province: string;
  region: string;
  city: string;
  regions: string[];
  cities: string[];
  asOf: string;
  orgName: string;
  search: string;
  onSearch: (value: string) => void;
  onFilter: (next: { region?: string; city?: string }) => void;
  children: ReactNode;
}) {
  const copy = govCopy(locale);
  const fr = locale === "fr";
  const other: GovLocale = fr ? "en" : "fr";
  const title = govMenuLabel(section, locale);
  useEffect(() => {
    document.title = title;
    scrollGovMain();
  }, [title, section]);

  return (
    <div className="w-full min-h-dvh overflow-x-hidden bg-bg text-fg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <a href="#gov-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-surface focus:px-3 focus:py-2">
        {title}
      </a>
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4" data-ke="gov-header">
        <p className="font-display text-lg">KidEase</p>
        <div className="flex flex-wrap items-center gap-2">
          <GovHelp locale={locale} />
          <a
            href={withSearch(govMenuHref(other, section), province, region, city)}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium underline-offset-4 hover:underline"
          >
            {copy.language}
          </a>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium touch-manipulation"
            onClick={() => void signOut(govPath(locale, "login"))}
          >
            {copy.signOut}
          </button>
        </div>
      </header>
      <nav
        className="sticky top-0 z-30 border-b border-border bg-bg"
        data-ke="gov-menu"
        aria-label={fr ? "Pages du bureau" : "Government desk pages"}
      >
        <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 py-2">
          {GOV_MENU.map((item) => {
            const current = item.id === section;
            return (
              <a
                key={item.id}
                href={withSearch(govMenuHref(locale, item.id), province, region, city)}
                data-ke="gov-task"
                data-view={item.id}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "inline-flex min-h-11 shrink-0 items-center rounded-full bg-surface px-3 text-sm font-semibold ring-1 ring-border touch-manipulation"
                    : "inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-muted touch-manipulation"
                }
                onClick={() => scrollGovMain()}
              >
                {fr ? item.fr : item.en}
              </a>
            );
          })}
        </div>
      </nav>
      <main id="gov-main" className="mx-auto w-full max-w-5xl px-4 pb-16" data-ke="gov-dashboard">
        <h1 className="font-display text-3xl" data-ke="gov-heading">{title}</h1>
        <p className="mt-2 text-sm text-muted">{copy.org}: {orgName}</p>
        <p className="mt-1 text-base" data-ke="gov-as-of">{copy.asOf} {asOf}</p>
        <div className="sticky top-14 z-20 -mx-4 mt-4 border-b border-border bg-bg px-4 py-3" data-ke="gov-filters">
          <label className="block text-sm font-medium" htmlFor="gov-search">
            {fr ? "Chercher un centre, un permis ou une ville" : "Search a centre, licence, or town"}
            <input
              id="gov-search"
              className="ke-input mt-1 w-full"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              data-ke="gov-search"
            />
          </label>
          <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={(event) => event.preventDefault()}>
            <label className="block text-sm font-medium">
              {copy.province}
              <select className="ke-input mt-1 w-full" value={province} disabled data-ke="gov-province-lock">
                <option value={province}>{province}</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              {copy.region}
              <select
                className="ke-input mt-1 w-full"
                value={region}
                onChange={(event) => onFilter({ region: event.target.value, city: "ALL" })}
              >
                {regions.map((item) => (
                  <option key={item} value={item}>
                    {item === "ALL" ? (fr ? "Toutes les régions" : "All regions") : regionLabel(item, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {copy.city}
              <select className="ke-input mt-1 w-full" value={city} onChange={(event) => onFilter({ city: event.target.value })}>
                {cities.map((item) => (
                  <option key={item} value={item}>
                    {item === "ALL" ? (fr ? "Toutes les villes" : "All cities") : item}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <div className="relative mt-3" data-ke="gov-pills">
            <div className="flex min-w-0 gap-2 overflow-x-auto pr-10">
              <a className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-primary" href={fr ? "/fr/search" : "/search"} data-ke="gov-browse-public">
                {fr ? "Voir les fiches publiques" : "Browse public listings"}
              </a>
              {region !== "ALL" ? (
                <button type="button" className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-surface px-3 text-sm ring-1 ring-border" onClick={() => onFilter({ region: "ALL", city: "ALL" })}>
                  {regionLabel(region, locale)}
                </button>
              ) : null}
              {city !== "ALL" ? (
                <button type="button" className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-surface px-3 text-sm ring-1 ring-border" onClick={() => onFilter({ city: "ALL" })}>
                  {city}
                </button>
              ) : null}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" data-ke="gov-pill-fade" aria-hidden="true" />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
