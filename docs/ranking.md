# Ranking groundwork

Rules-based only. No machine learning. Paid plans never change Best match.

## Weights

All Best match weights live in `src/lib/ranking/weights.ts`. Missing facts score 0. A stale or unknown opening is neutral, never a penalty. Unclaimed listings stay in the results.

## Best match experiment

PostHog flag: `best-match-sort` (boolean). Set the rollout to 50% in PostHog.

- Flag on for that person: Best match is the sort, next to Nearest.
- Flag off: Nearest only. Best match is hidden.
- Flag not created yet: the app puts half of browser sessions on Best match and logs which half.
- If scoring throws, the list falls back to Nearest.

Each search logs `search_performed` with `variant` (`best_match` or `nearest`), the city, age group, filters, sort, and result count. Listing events include `listing_id`, `position`, and `sort`.

Events fire only after analytics consent. They do not include child names, birthdates, emails, phones, or message text.

The public listing does not show a centre website button, so `website_clicked` is ready but not attached to a control. The inbox call button fires `phone_clicked`.

## Nightly table

Inngest function `demand-supply-nightly` runs at 2:15 America/Winnipeg. It writes `demand_supply_daily` for the previous Winnipeg day: searches, saves, and spot requests against listings and confirmed openings, by city and age group.

Staff view: `/admin-demand`. CSV download has the same columns and no personal data. Rebuild on that page runs the same job.

`FEATURE_PUSH` and `FEATURE_SMS` stay off.
