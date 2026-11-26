import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ProfileHealthCard } from "@/components/profile-health-card";
import type { ProfileHealth } from "@/lib/profile-health";
import { loadMyListingHealth } from "@/lib/server/profile-health";
import { cn } from "@/lib/utils";

type Listing = { id: string; name: string };

/**
 * The daycare's profile health, read from the same row and the same scoring
 * function Admin uses on the approval card.
 */
export function MyListingHealth({
  listings,
  locale,
  activeId,
}: {
  listings: Listing[];
  locale: "en" | "fr";
  /** The centre the desk is on (?centre=). Health is per centre, so follow it instead of the first listing. */
  activeId?: string | null;
}) {
  // provider.tsx is mid-change in another PR, so read ?centre= here rather than threading a prop.
  const urlCentre = useRouterState({
    select: (state) => {
      const value = (state.location.search as Record<string, unknown> | undefined)?.centre;
      return typeof value === "string" ? value : null;
    },
  });
  const followId = activeId ?? urlCentre;
  const [picked, setPicked] = useState<string | null>(null);
  const [health, setHealth] = useState<{ id: string; health: ProfileHealth } | null>(null);
  const current =
    listings.find((row) => row.id === picked) ?? listings.find((row) => row.id === followId) ?? listings[0] ?? null;
  const currentId = current?.id ?? "";

  useEffect(() => {
    if (followId) setPicked(null);
  }, [followId]);

  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    void loadMyListingHealth({ data: { daycareId: currentId } })
      .then((res) => {
        if (!cancelled) setHealth(res.ok ? { id: currentId, health: res.health } : null);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  if (!current) return null;
  return (
    <div className="mb-6 space-y-2" data-ke="my-listing-health">
      {listings.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={locale === "fr" ? "Choisir une fiche" : "Choose a listing"}>
          {listings.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={row.id === current.id}
              onClick={() => setPicked(row.id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1 touch-manipulation",
                row.id === current.id ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-border",
              )}
            >
              {row.name}
            </button>
          ))}
        </div>
      ) : null}
      {listings.length > 1 ? (
        <p className="text-sm font-semibold" data-ke="my-listing-health-name">
          {current.name}
        </p>
      ) : null}
      {/* Never show one centre's licence or photos under another centre's name while switching. */}
      {health && health.id === current.id ? (
        <ProfileHealthCard health={health.health} locale={locale} />
      ) : (
        <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-border" aria-hidden="true" />
      )}
    </div>
  );
}
