# Quality score and Guest Favorites

KidEase ranks centres from **real signals** and shows a **Guest favorite** badge only when a metro has enough data. The product never invents star ratings, vacancy times, or a badge.

This is not a safety grade or inspection score. Never claim KidEase police-checks staff.

## Score (0–100)

Computed server-side in `src/lib/quality.ts`. Missing signals add **zero**. Incomplete listings stay searchable (soft demotion only).

| Component | Max | What counts |
| --- | ---: | --- |
| Claim / licence trust | 25 | +15 claim verified, +10 licence matched to a registry record. Expired or suspended licence scores 0 for the licence slice. |
| Listing completeness | 25 | Fees or fee program, ages, hours, real licence number, real building photo (`listingCompleteness`). |
| Vacancy freshness | 15 | 15 if a provider confirm is under 14 days old. 4 if that timestamp is stale. 0 if no confirm exists (unknown is not treated as stale). |
| Gated parent reviews | 20 | Published reviews from enrolment / attendance / admin grant only (PR #64). Needs **at least 3** reviews. Uses average × volume (`count / 8`, capped). Google ratings are **not** used. |
| Reply / tour rates | 15 | Tour accept rate after **5** accepted or declined tours (up to 8 pts). Reply rate after **5** parent threads (up to 7 pts). Hidden until those samples exist. |

Paid priority placement is a separate pin. It does **not** inflate the quality score.

## Guest Favorites

A listing may show **Guest favorite** only when **all** of these are true:

1. Claim verified, listing complete, vacancy fresh, licence not expired/suspended.
2. At least 3 published gated parent reviews with a real average.
3. Quality score ≥ 60.
4. Same metro (`city|province`) has **at least 8** listings that also meet 1–3.
5. The listing is in the **top 10%** of that eligible metro set (at least one when the set clears the floor).

If the metro sample is too thin, **nobody** in that city gets the badge.

## Where it shows

- Search cards, map preview, compare, and listing detail — badge only when the thresholds above are met.
- Recommended sort = `qualityScore / 100 × distanceDecay` (quality × proximity). Distance sort still prefers closeness.
- Centre desk (`QualityIssuesPanel`) shows the 0–100 score, demotion reasons, and CTAs (edit facts, confirm spots, licence desk, claim, inbox). Issues **downrank** only.

## Persistence

Migration `0031_quality_guest_favorites.sql` adds `quality_score`, `quality_scored_at`, and `guest_favorite` on `daycares`. Listing detail may write the last computed values. Search always recomputes from current signals.

## Out of scope

Photo authenticity ML, licence OCR, auto-removal, Stripe, Facebook.
