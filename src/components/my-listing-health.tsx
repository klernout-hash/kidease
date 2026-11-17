import { useEffect, useState } from "react";
import { ProfileHealthCard } from "@/components/profile-health-card";
import type { ProfileHealth } from "@/lib/profile-health";
import { loadMyListingHealth } from "@/lib/server/profile-health";
import { cn } from "@/lib/utils";

type Listing = { id: string; name: string };

/**
 * The daycare's profile health, read from the same row and the same scoring
 * function Admin uses on the approval card.
 */
export function MyListingHealth({ listings, locale }: { listings: Listing[]; locale: "en" | "fr" }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [health, setHealth] = useState<ProfileHealth | null>(null);
  const current = listings.find((row) => row.id === picked) ?? listings[0] ?? null;
  const currentId = current?.id ?? "";

  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    void loadMyListingHealth({ data: { daycareId: currentId } })
      .then((res) => {
        if (!cancelled) setHealth(res.ok ? res.health : null);
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
      {health ? (
        <ProfileHealthCard health={health} locale={locale} />
      ) : (
        <div className="h-40 animate-pulse rounded-2xl bg-surface ring-1 ring-border" aria-hidden="true" />
      )}
    </div>
  );
}
