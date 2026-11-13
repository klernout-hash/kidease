# Redesign blocker corrections — 13 November 2026

Application/test corrections are in `960da0f4d0aedaf195d2e714f3b10264baad383c`, following reviewed layout `c27a475d954b5cd1f29d81c173f112f1b0c3d821`. The [current release review](redesign-release-review-20261113.md) is the canonical checklist and acceptance record.

## Detail hydration and retry

The client route transform makes the detail error component lazy. TanStack Router then inferred an additional client Suspense boundary absent from server markup. The mismatch also reproduced on untouched main `9d9838ec` at 390px and 1280px in Classic and Clean.

Both detail routes now set `wrapInSuspense: true`. This aligns boundaries while preserving the actual SSR listing heading and content. Before/after and built checks covered EN/FR × 390/1280 × Classic/Clean; all eight cases had no page errors after correction. Compiler/Router regressions cover error and missing states.

The detail error action now calls `router.invalidate()` so **Try again** reruns a failed loader. Synthetic HTTP 503 checks recovered through the real EN/FR retry panel after the existing network cooldown.

## Map worker initialization

The desktop scenario's four `e.endsWith` errors originated in MapLibre's worker-URL handling: configuration received the worker module's implementation class instead of a script URL. The correction supplies a literal asset URL that Vite rewrites during build. Worker asset bytes, dependencies, CSP and provider settings are unchanged.

Actual worker rendering and built search-map open/close checks completed six cycles each across both widths without worker/page errors. The built-map test used a synthetic inline GeoJSON basemap and blocked external requests. It proves initialization, not live external tiles, Google availability or deployed CSP.

## Availability enrichment and fallback exclusions

General search previously enriched only the first 192 candidates with claimed availability; the tail retained old/default facts. A search-only reader now retains candidate order and reads claimed facts in sequential 192-ID batches, up to the existing 2,500-ID catalogue cap, within a two-second wait budget per reader. Existing mapping, merge rules and parameterized reads remain. The 192-candidate limit remains for expensive review/quality/ranking overlays.

Successful empty reads remain complete. Failed, timed-out, malformed or cap-limited enrichment is marked unverified, with truthful counts and retry behavior. Completed batches publish atomically; late results cannot mutate returned arrays. Observed nonpublic IDs survive source unions as internal exclusions, preventing stale fallback from reintroducing known records. Exclusion IDs are not exposed publicly.

A 350-candidate handler fixture verifies 125 qualifying matches beyond the former cutoff, pagination of 96+29, card/count/map parity, price ordering, freshness, hidden/test/inactive exclusions, failure recovery and forced refresh. Legacy overlay callers are unchanged.

## Validation and limits

- Full local suite: **3,057 passed, 0 failed, 0 skipped**; typecheck passed; ESLint **0 errors, 128 warnings**.
- Credential-free `build:dev` passed without migrations. Bundle guards passed: 71 server modules, eight lazy extra locales and 726 client files without database schema.
- Local guest e2e shard **1/8: 34/34 passed**. Other seven shards and signed-in remote CI were not run in this pass.
- Development and built hydration checks, EN/FR synthetic 503 recovery, two-width search coverage and worker/map cycles passed within their stated fixture scope.

The two-second budget bounds waiting, not SQL execution, driver retries or total endpoint latency. A timed-out query may continue, with one outstanding chunk per reader and possible primary/live reader overlap. Cap-limited/stale fallback remains unverified. Exclusions protect observed nonpublic records only; capped review/quality enrichment does not establish exhaustive favorite/rating matching.

These tests are not complete security, accessibility or production-performance acceptance. Physical/native devices, production accounts/schema/settings, live payments, external tiles/Google and external bot state remain unverified. Resolution Centre, PR #841 performance work and PR #847 tour-read changes are separate.
