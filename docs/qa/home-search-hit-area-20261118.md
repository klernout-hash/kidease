# Home search compound-control follow-up — November 18, 2026

Base: `86a7ccc14ec167c36ba0cfaac8e46edbf484d172` (PR945). Isolated branch: `fix/home-search-hit-area-nov18`. This follow-up remains local for central coordination; it does not rerun or replace PR945 CI.

## Final PR945 evidence

GitHub CI run44366708252 and Store isolation44366708356 succeeded at exact86a7, including all eight E2E shards, signed-in, desktop and aggregate checks. A green nonblocking desktop job alone is not visual acceptance.

The verified desktop artifact14458567842 has SHA256 `ae4cb04eb242825458a5f8c1da96d0575b96b3990ab909ca2e9935bf9e443690`. Its140-row layout report contains0 overlap,0 overflow,0 text spill and40 small-input observations. The old624 overlap observations and32 radius/map-size observations disappeared. All140 navigations returned200 at the expected routes with no recorded error. This is consistent with the confirmed closed-disclosure detector correction and target-size fixes, without production footer-spacing changes.

All40 remaining observations are generic14px-high home input rectangles, split20 EN/20 FR and20 clean/20 classic across ten widths. They represent14 measurement signatures, not40 uniquely identified defects. The detector deduplicates generic input names and does not describe larger compound click targets. Desktop comparisons still mismatch76/76 old baselines, with no missing or size-mismatched images; no baseline was replaced or accepted automatically. Only report JSON was extracted for this pass, not raw catalogue images.

Shard1's synthetic checks passed but its artifact upload was skipped because the workflow uploaded only on failure. Therefore those CI screenshots were **not retained**. Existing private local captures remain evidence. This follow-up adds a separate always-run shard1 upload of only the two synthetic search-control after directories, retaining them7days; existing failure-only full-smoke uploads and test policies stay unchanged. No new GitHub run has been triggered for this local follow-up.

## Three reproduced ordinary usability issues

1. **Name padding:** eight baseline cases established that native label/input focus works and Where's larger wrapper forwards clicks, but two measured blank Name-background points do not focus its input. The prominent segment now forwards only noninteractive background clicks. Inputs, labels, links, buttons, selects, textareas and role-buttons retain their own behavior. Regular nonprominent bars gain no wrapper handler or tab stop.
2. **Stale blur close:** forwarding alone reproduced a failure at390px: the Name field regained focus, then the old120ms blur timer closed its suggestions after160ms. The timer now captures its exact input and closes only if focus actually remains elsewhere. The regression also checks genuine outside focus still closes suggestions without altering the typed query.
3. **Mobile Search obstruction:** a representative native hit test found the active Name container intercepted both center and inset points of the44×44 Search button. Name's active layer is30; Search was10. The mobile Search wrapper is now40, with desktop `lg:z-auto` and all dimensions/state handlers preserved. The test requires unobstructed hits and exactly one local submit while Name/age controls remain active.

The failed forwarding-only and active-submit checks were preserved privately before correction. No assertion was removed to make these issues pass.

## Synthetic acceptance and limits

The new harness mounts the **actual ExploreSearchBar and DaycareNameField**, with actual ChipButton/pure helpers, finished-build CSS and local fonts. EN/FR copy and the required date helpers are read as exact source declarations. Name lookup and navigation are synthetic; PlaceSearch is a structural native-input boundary. No real autocomplete, geocoding, application route, catalogue, server, auth, financial or provider implementation is imported by the fixture.

Eight contexts cover EN/FR × clean/classic ×390/1280. Before/after PNGs depict the same initial padding-click state. Checks cover background and native-label focus, existing Where forwarding, native Tab order, typed refocus beyond the blur timer, genuine outside blur, pointer/Enter suggestion activation, age-chip focus/callbacks and one submission in each tested active/reset scenario. Browser requests, WebSockets, transport attempts and page errors must remain zero. No full-page, real-data, routing, service or comprehensive accessibility acceptance is claimed.

Final local checks use a clean environment and the unchanged private outbound guard: eight home contexts, eight existing radius/map contexts, nine native-disclosure cases, full typecheck/lint, direct Vite compilation and SSR/locale/client-DB bundle guards. No aggregate local suite, payment import/test or real provider operation is included. Generated route-tree ordering from the build is preserved privately and restored to the exact base file.

## Remaining gates

PR945 Vercel still fails the previously verified eight-file Preview migration gate after successful compilation/bundle guards. Preview-to-Neon branch mapping and specific read-only schema/history permission remain unresolved; no database access, backup, migration/ledger write or deployment occurred. The new local candidate has not yet had exact-head GitHub CI or full-app acceptance.

The old pixel-baseline attribution, Help media and login-provider row remain open. Raw input-size findings are not hidden or exempted by this change. App subscriptions stay off; Email Bot and CRM Bot stay paused. No flags, authentication/provider settings or unrelated backend lanes are changed.
