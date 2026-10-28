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

export function reviewDimensionBars(
  reviews: Array<{ dimensions?: Partial<Record<ReviewDimensionId, number>> | null }>,
): DimensionScore[] {
  return REVIEW_DIMENSIONS.map((dim) => {
    const scores = reviews
      .map((review) => clampScore(review.dimensions?.[dim.id]))
      .filter((score): score is number => score != null);
    if (!scores.length) return { id: dim.id, average: null, count: 0 };
    const average = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
    return { id: dim.id, average, count: scores.length };
  });
}
