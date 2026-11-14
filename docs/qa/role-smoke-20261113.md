# Role smoke regression follow-up — 13 November 2026

This test-only follow-up to published snapshot `995b2337` changes `scripts/e2e-smoke.mjs`. No application source, authorization rule, route, feature flag, payment setting or catalogue data changed.

- Guest drawer Plans is found by its `/plans` destination rather than its former marker. Drawer/footer parity, labels, page navigation and subscription-flag checks remain.
- Live-filter counts are checked against actual coverage state. Complete counts retain exact licensed-centre wording; partial/unverified counts require the appropriate truthful wording, a visible explanation and the seeded live card. Live URL serialization and city-directory destination checks remain.
- Listing discovery still requires a visible public listing and retains guest-sign-in, other-provider denial and owner-edit assertions. When the page visibly offers search recovery after incomplete/error results, the harness may use that Retry once. Continued failure stays a failure. Diagnostics record count/coverage/card state and up to 12 same-origin server-function response paths, methods and status codes, without queries or request bodies; listeners are removed afterward.

## Validation

Targeted unit tests passed 33/33. Eleven count positive/negative cases, six bounded recovery cases, status-record limits and listener cleanup passed. Syntax checking passed; targeted lint had zero errors and one existing unused-helper warning.

A credential-free local built preview with in-memory PGlite, original repository JSON files staged beside the server, and external server/browser requests blocked verified:

- Plans drawer/footer links, label and navigation to the Plans page. Subscription-on behavior was a local test fixture only.
- Winnipeg search returned a public detail link and 421 available listings, without Retry.
- Live search retained `live=1`, its Winnipeg query/directory destination, one available listing, the incomplete-coverage warning and the seeded centre.
- Zero browser errors.

An earlier local search probe lacked those JSON fixtures; its external fallback was correctly blocked by the network guard. This explains that local failure, not the original intermittent CI failure. No network guard was bypassed. Catalogue files were staged only in ignored local build output; no repository data changed.

The full slow role fixture was not rerun locally. The original CI search intermittence remains unexplained; the bounded recovery/diagnostics do not claim an application fix. Exact published-head CI remains required. Previous icon/header evidence still applies to unchanged application code, with its empty-recommendation fixture limitation clarified in provenance.

## Visible-listing discovery correction

After safe-build integration, CI head `0d0aea21` failed listing discovery in both automatic attempts. Its captured state showed 421 available listings and 96 rendered cards before discovery returned no link; a later snapshot showed loading. Recorded search responses were HTTP 200. This does not establish an empty database or a network failure. The build gate and application source were not responsible for any demonstrated catalogue-staging change: the former no-database migrator exited without staging files.

A controlled actual-app reproduction found a specific selector defect. With the existing mobile-search variant enabled in an isolated test process at 1280px, hidden mobile cards precede visible desktop cards in the DOM. Taking the first matching link before testing visibility selects a 0×0 hidden copy and fails despite 96 visible cards. Selecting visible matches before taking the first opens a real public detail page. Default controls and the 390px variant pass; all-hidden and no-card cases still fail. Scrolling does not repair a selector that remains pinned to the hidden first copy. The original CI artifact did not record the failing page's variant; its later live-filter screenshots show the ordinary layout. This reproduction therefore does not prove every detail of that failed run.

The corrected harness requires a visible public listing, captures its href in the same bounded lookup before collecting diagnostics, and retains the original guest/provider/owner assertions and one explicit visible Retry limit. It does not substitute fixture URLs into the actual role test. Diagnostics now distinguish loading from complete coverage and record viewport, variant presence, candidate counts and first-link geometry, without query strings or request bodies. Application code, data, flags, build safety and product behavior are unchanged.

Seven permanent role-shard regression cases exercise responsive copies at 390/1280, rejection of all-hidden, empty and loading-only states, waiting for a delayed visible result, and a refresh between diagnostic capture and the former href read. That refresh case retains only a URL already captured while visible; it never accepts a hidden-only result. Fresh exact-head role and aggregate checks remain required; no blind rerun or assertion suppression is used.
