# Quality score and Guest Favorites

KidEase ranks centres from **real signals** and shows a **Guest favorite** badge only when a metro has enough data. The product never invents star ratings, vacancy times, or a badge.

This is not a safety grade or inspection score. Never claim KidEase police-checks staff.

## Score (0–100)

Computed server-side in `src/lib/quality.ts`. Missing signals add **zero**. Incomplete listings stay searchable (soft demotion only). Home rails and “best match / need soon / guest favorites” only show **live-looking** cards via `isLiveLookingCard()` in `src/lib/now-loops.ts`: confirmed ages, a listed fee or a per-centre CWELCC amenity (never a province-wide $10-a-day guess), and a real storefront photo. Hollow cards name the exact gap and stay off those rails.

| Component | Max | What counts |
| --- | ---: | --- |
| Claim / licence trust | 25 | +15 claim verified, +10 licence matched to a registry record. Expired or suspended licence scores 0 for the licence slice. |
| Listing completeness | 25 | Fees or fee program, ages, hours, real licence number, real building photo (`listingCompleteness`). |
| Freshness | 15 | Vacancy confirm (up to 10): 10 if under 14 days, 4 if stale, 0 if unknown. Photo timestamp (up to 5): 5 if a real upload is under 90 days, 2 if that timestamp is stale. Missing photo dates stay unknown and add zero — KidEase never invents a photo date. A known-stale storefront also blocks Guest Favorites. |
| Gated parent reviews | 20 | Published reviews from enrolment / attendance / admin grant only (PR #64). Needs **at least 3** reviews. Uses average × volume (`count / 8`, capped). Google ratings are **not** used. |
| Reply / tour rates | 15 | Tour accept rate after **5** accepted or declined tours (up to 8 pts). Reply rate after **5** parent threads (up to 7 pts). Hidden until those samples exist. |

Paid priority placement, daycare Pro / Network, and featured-city pins are separate. They do **not** inflate the quality score, Guest Favorites, or the legacy `listingQualityScore` helper. Free trust signals (claim, licence, vacancy, listing completeness, photo freshness) stay on every plan.

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

Parent **Match** and **Urgency** (and centre demand heat) compose with this score — see `docs/parent-rank.md`. Paid pins still do not enter quality.

## Out of scope

Photo authenticity ML, licence OCR, auto-removal, Stripe, Facebook.
