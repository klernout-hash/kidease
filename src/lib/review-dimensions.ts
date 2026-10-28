/** Five parent-review categories. Bars use only scores that were actually saved. */

export const REVIEW_DIMENSIONS = [
  { id: "safety", en: "Safety and licensing", fr: "Sécurité et permis" },
  { id: "educators", en: "Educators and warmth", fr: "Éducateurs et accueil" },
  { id: "communication", en: "Communication", fr: "Communication" },
  { id: "cleanliness", en: "Cleanliness and facility", fr: "Propreté et locaux" },
  { id: "value", en: "Value and CWELCC", fr: "Rapport qualité-prix et AGJE" },
] as const;

export type ReviewDimensionId = (typeof REVIEW_DIMENSIONS)[number]["id"];

export type DimensionScore = { id: ReviewDimensionId; average: number | null; count: number };

function clampScore(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/** Untouched categories use the overall star rating. A missing score stays empty. */
export function scoreForDimension(
  review: { rating?: number | null; dimensions?: Partial<Record<ReviewDimensionId, number>> | null },
  id: ReviewDimensionId,
): number | null {
  const explicit = clampScore(review.dimensions?.[id]);
  if (explicit != null) return explicit;
  return clampScore(review.rating);
}

export function reviewDimensionBars(
  reviews: Array<{ rating?: number | null; dimensions?: Partial<Record<ReviewDimensionId, number>> | null }>,
): DimensionScore[] {
  return REVIEW_DIMENSIONS.map((dim) => {
    const scores = reviews
      .map((review) => scoreForDimension(review, dim.id))
      .filter((score): score is number => score != null);
    if (!scores.length) return { id: dim.id, average: null, count: 0 };
    const average = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
    return { id: dim.id, average, count: scores.length };
  });
}

export function parseStoredDimensions(raw: unknown): Partial<Record<ReviewDimensionId, number>> | null {
  if (!raw) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const out: Partial<Record<ReviewDimensionId, number>> = {};
  for (const dim of REVIEW_DIMENSIONS) {
    const score = clampScore((value as Record<string, unknown>)[dim.id]);
    if (score != null) out[dim.id] = score;
  }
  return Object.keys(out).length ? out : null;
}
