# Parent Match, Urgency, and centre demand

KidEase ranks centres from **real signals**. Missing prefs or samples add **zero**. Paid Pro / Network, featured-city, and promote pins **never** inflate Match or Urgency.

This composes with the centre quality score (PR #65 / `docs/quality-score.md`). It does not replace it.

## Parent Match (0–100)

`src/lib/parent-match.ts`. How well a listing fits the parent's **current search prefs**.

| Slice | Max | What counts |
| --- | ---: | --- |
| Distance | 25 | Decay from a **measured** origin (`distanceKnown`). No origin → 0. Never substitutes Winnipeg. |
| Ages | 20 | Requested age band overlaps confirmed ages. Unknown ages → 0. |
| Vacancy | 20 | Confirmed spots for that age. No confirm timestamp → 0. Stale confirm is worth less than fresh. |
| Trust | 20 | Quality claim / licence slice, scaled. Expired or suspended licence adds 0 for the licence part. |
| Quality | 15 | Completeness + gated reviews + reply/tour rates from `qualityBreakdown` (not the paid pin). |

Sort **Best match** ignores priority and featured-city pins.

## Parent Urgency (0–100)

`src/lib/parent-urgency.ts`. How soon the centre can meet a need.

| Slice | Max | What counts |
| --- | ---: | --- |
| Start date | 40 | Days until the parent's need-by / booking start. No date → 0. |
| Open spots | 35 | Confirmed vacancy for the age band. Unknown vacancy → 0. |
| Reply speed | 25 | Median first-reply hours after **5** parent threads. Thinner samples stay 0. |

Sort **Need soon** also ignores paid pins.

## Centre demand heat + fill-risk

`src/lib/demand-heat.ts`, loaded in `src/lib/server/rank.ts`. Centre-desk only.

- **Demand heat** (28-day real inquiries + tours + requests): unknown if the query did not run; quiet / warm / hot from the count. Zero is quiet, not invented warmth.
- **Fill-risk**: unknown without a vacancy confirm. Open seats that go stale (14d+) are high. Paid 7- vs 90-day analytics windows do **not** change the band.
- **Reply SLA**: hidden until 5 first-replies exist. Pending tours over 48h and unreplied threads are shown only when those rows exist.

## Where it shows

- Search cards + Best match / Need soon sorts + optional need-by date
- Compare, listing detail, parent saved list (Match / Urgency)
- Signed-in parent home + Family desk **For you** rails (Match, Need soon, Guest Favorites, age, care type)
- Centre desk listings (demand heat / fill-risk / SLA) and action nudges

Search always recomputes. Paid pins never enter Match, Urgency, or Guest Favorites. Photo freshness is a separate listing-health / quality cue (migration `0032`).
