# Guest search and enrollment fixes

Baseline: `03263fb515e71131d6ecc8be53f72907f5b7e001`. Synthetic local QA reproduced radius loss on reload, claim lookup failures shown as no match, duplicate approval effects, small filter/centre targets, missing claim labels, misleading photo copy and ambiguous tour summaries.

## Resulting behavior

- Radius is canonical URL state (`km`), including the first server read, home entry, reload and history. Older `radius` and `radiusKm` links remain readable; a bare search retains the 25 km default.
- Failed or stalled claim lookups offer retry. Only a successful empty lookup shows no match. Lookups pass cancellation to the transport, release abandoned requests, and avoid consuming the shared retry budget while the browser is known to be offline. The input has a persistent label and a 44 px minimum target.
- A locked status transition claims each actual request change once. Repeating the same status skips capacity, timestamps, lead, tour and notification effects. Authorization and completeness checks stay before the transition.
- Child edits show an unsaved note and ask before discarding on reload or navigation. Health details remain in memory; browser storage is not introduced. Saved/reverted forms can leave without a warning.
- A completed child edit consumes its form deep link and returns to the saved child. The health summary refreshes after a completed profile mutation.
- Filter controls and saved-centre labels have explicit 44 px hit regions. Missing-photo cards retain their branded fallback without “Photo pending.” Tour summary labels explicitly describe visits; calculations are unchanged.
- Filter dialogs use the existing Radix modal pattern above mobile navigation, with reachable Apply/Clear/Cancel controls and focus return. Applying or clearing a filter group preserves unrelated language and search filters.

## Verification

Run typecheck and lint, then these explicit nonpayment test files:

```sh
node --experimental-strip-types --test --test-concurrency=2 \
  scripts/search-radius-url.test.mjs \
  scripts/claim-lookup.test.mjs \
  scripts/claim-lookup-transport.test.mjs \
  scripts/child-profile-unsaved.test.mjs \
  scripts/request-status-idempotency.test.mjs \
  scripts/search-controls-state.test.mjs \
  scripts/search-map-state.test.mjs \
  scripts/search-result-parity.test.mjs \
  scripts/search-page.test.mjs \
  scripts/search-radius-viewport.test.mjs \
  scripts/claim-city.test.mjs \
  scripts/qa-interim-2026-11-16.test.mjs \
  scripts/child-request-columns.test.mjs \
  scripts/child-health-access.test.mjs \
  scripts/provider-child-routes.test.mjs \
  scripts/request-sent.test.mjs
```

Use a credential-free environment and disposable synthetic data. The aggregate test and E2E runners include payment paths or mocks and are excluded from this task. Connected local HTTP/browser verification uses an isolated archive, synthetic catalogue, private local sessions, memory PGlite and outbound denial. Retest EN/FR at 375, 390 and 1280 pixels, including URL/history, offline retry, stale responses, unsaved navigation choices and simultaneous/sequential approvals. Mobile web viewports do not establish native-device behavior.

## Scope and remaining choices

No production access, real delivery, payments, feature activation or deployment is part of these changes. Central coordination owns integration and release gates. The status claim preserves the existing downstream crash/partial-delivery window; it is not a durable outbox guarantee. Persistent child-draft autosave and combined tour/enrollment metrics would require separate data-retention and product-scope decisions; this change uses discard warnings and explicit tour labels instead.
