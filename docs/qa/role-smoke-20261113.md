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
