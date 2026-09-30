/** Last search, so a later save or tour can log position and sort. No personal data. */

const KEY = "kidease-rank-ctx";

type RankContext = {
  sort: string;
  variant: "best_match" | "nearest";
  positions: Record<string, number>;
};

export function rememberRankContext(ctx: RankContext) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const positions: Record<string, number> = {};
    for (const [id, pos] of Object.entries(ctx.positions)) {
      if (Object.keys(positions).length >= 80) break;
      if (id && typeof pos === "number") positions[id.slice(0, 80)] = pos;
    }
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ sort: ctx.sort, variant: ctx.variant, positions }),
    );
  } catch {
    /* private mode */
  }
}

export function rankListingContext(listingId: string): {
  sort: string;
  position: number | null;
  variant: "best_match" | "nearest";
} {
  const empty = { sort: "distance", position: null as number | null, variant: "nearest" as const };
  if (typeof sessionStorage === "undefined") return empty;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return empty;
    const ctx = JSON.parse(raw) as RankContext;
    const pos = ctx.positions?.[listingId];
    return {
      sort: typeof ctx.sort === "string" && ctx.sort ? ctx.sort : "distance",
      position: typeof pos === "number" ? pos : null,
      variant: ctx.variant === "best_match" ? "best_match" : "nearest",
    };
  } catch {
    return empty;
  }
}
