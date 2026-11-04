# Ranking v2 gap report

Today's Best match sort already uses distance, fresh open spots, age fit, hours, subsidy, and a completeness check. It does not sell rank. This pass adds `FEATURE_RANKING_V2`, default off. With the flag off, Best match uses the same comparator as before.

## Critical

- Blocked pairs are not removed from search. V2 drops a card only when `blocked` is true, and only while the flag is on. The block list from #714 is not joined yet.
- A centre closed today can still appear. V2 drops `closedToday` only while the flag is on. The host calendar is not joined yet.

## High

- Spot confirmations older than 14 days get no extra nudge. V2 adds that nudge on a tie, using `spotsUpdatedAt`.
- Age-group spots are only a tie nudge. They do not override a closer centre.
- Unverified review volume (many listing reviews, no parent reviews, and a very high score) is dampened. This is not a fraud verdict.

## Medium

- Top Rated is a one-point tie nudge when the card already has `topRated`. The badge itself is a separate flag.
- A centre claimed in the last 30 days gets a small exploration nudge. No paid boost.

## Low

- Waitlist notify order is unchanged.
- No new Google API calls. Places and Street View stay off.
- Paid pins (`featuredCity`, priority) are not read by the v2 bonus.
