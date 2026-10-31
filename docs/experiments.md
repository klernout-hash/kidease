# Experiments and analytics

`FEATURE_EXPERIMENTS` defaults **off**. While it is off, signup and search stay on the current copy and distance order. No exposure event is sent.

## Flags

| Key | Default | What changes when on |
| --- | --- | --- |
| `exp-signup-headline` | off until `FEATURE_EXPERIMENTS=1` | 50/50 headline on the parent signup path |
| `exp-search-order` | off until `FEATURE_EXPERIMENTS=1` | 50/50 distance (control) or name (treatment). Does not replace Best match. |

Assignment is a stable hash of the distinct id. It is not a PostHog percent rollout until Kyle creates those two flags **disabled** in PostHog and then turns `FEATURE_EXPERIMENTS` on.

## Funnels

Signup: `signup_viewed` → `account_created`

Search: `search_viewed` → `listing_opened` → `tour_requested`

## Retention

Cohort start: `account_created`. Return event: `listing_opened`. Weeks 1 and 4.

## Insight IDs

Checked the KidEase PostHog project (594559) on 31 Oct 2026. The only active event in the last 30 days is `$pageview`. The product steps below are not in the taxonomy yet, so no insight was saved and no id is invented.

| Name | PostHog id | Steps |
| --- | --- | --- |
| Signup funnel | not created | `signup_viewed` → `account_created` |
| Search funnel | not created | `search_viewed` → `listing_opened` → `tour_requested` |
| Retention, weeks 1 and 4 | not created | cohort `account_created`, return `listing_opened` |

`EXPERIMENT_INSIGHTS` in `src/lib/experiments.ts` stays blank until those insights exist. Kyle can paste the short ids there after PostHog has the events.

## GHL

Do not mirror experiment variants into GoHighLevel.
