import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { RANKING_EVENT_NAMES, type RankingEventName } from "@/lib/ranking/names";

const NAMES = new Set<string>(RANKING_EVENT_NAMES);
const AGES = new Set(["any", "infant", "toddler", "preschool", "school-age", "unknown"]);
const SORTS = new Set(["distance", "price", "rating", "availability", "recommended", "match", "urgency"]);

export type RankingEventRow = {
  name: RankingEventName;
  city: string;
  ageGroup: string;
  filters: string;
  sort: string;
  resultCount: number | null;
  listingId: string;
  position: number | null;
  variant: "best_match" | "nearest";
};

function cleanEvent(input: unknown): RankingEventRow {
  if (!input || typeof input !== "object") throw new Error("bad event");
  const rec = input as Record<string, unknown>;
  const name = String(rec.name || "");
  if (!NAMES.has(name)) throw new Error("bad event");
  const age = String(rec.ageGroup || "any");
  const sort = String(rec.sort || "distance");
  const position = Number(rec.position);
  const resultCount = Number(rec.resultCount);
  return {
    name: name as RankingEventName,
    city: String(rec.city || "").trim().slice(0, 80),
    ageGroup: AGES.has(age) ? age : "any",
    filters: String(rec.filters || "").replace(/[^a-z0-9,_-]/gi, "").slice(0, 120),
    sort: SORTS.has(sort) ? sort : "distance",
    resultCount: Number.isFinite(resultCount) ? Math.max(0, Math.min(10000, Math.round(resultCount))) : null,
    listingId: String(rec.listingId || "").trim().slice(0, 80),
    position: Number.isFinite(position) ? Math.max(0, Math.min(500, Math.round(position))) : null,
    variant: rec.variant === "best_match" ? "best_match" : "nearest",
  };
}

/** Guest-safe. Stores city and listing id only — never a name, email, phone, or message. */
export const recordRankingEvent = createServerFn({ method: "POST" })
  .validator(cleanEvent)
  .handler(async ({ data }) => {
    try {
      const sql = await getSql();
      await sql`
        insert into ranking_events (
          id, name, city, age_group, filters, sort, result_count, listing_id, position, variant
        ) values (
          ${nid("re")},
          ${data.name},
          ${data.city},
          ${data.ageGroup},
          ${data.filters},
          ${data.sort},
          ${data.resultCount},
          ${data.listingId},
          ${data.position},
          ${data.variant}
        )
      `;
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  });
