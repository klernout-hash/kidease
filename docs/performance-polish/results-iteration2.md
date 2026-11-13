# Iteration 2 performance and control follow-up — recorded final evidence

The same [draft PR #841](https://github.com/klernout-hash/kidease/pull/841) contains the targeted performance and control fixes. No merge or manual deployment was performed. The full requested product sweep and performance targets remain incomplete; passing a local check does not establish production or field compliance.

**Final timing-state caveat:** actual final Lighthouse search frames show 426 licensed centres versus 425 before. The first 96 original SSR and settled listing slugs match, but full totals differ. Supplemental parent request cards differ EN 2→1 / FR 1→2. Cause is unknown; no DB edit, rerun or retouched image removed the differences. These are route/protocol observations, not identical-full-fixture or pure causal comparisons. Earlier genuine viewport/matrix 425/425 captures keep their own capture-specific proof.

## Source and publication provenance

| Role | Exact source |
| --- | --- |
| Verified original default `main` | `75cf0cd3cc1dc993b6eb920fe17139306f00cb80` |
| Preserved iteration-2 before | `729002b216e220d6a2d78699ea2095d16ec496c7` |
| Before runtime | `2f7a2ee1762ebd4d02fd14b063bbb7b4a9cddf4b` — intervening changes are audit/documentation and test assertions |
| Final local app build | `865e4710399d7a0ed6281d18ffa9b4bf4e04e4df` |
| Published app commit | `f68193a0a0990df63656992838175538de3a9297` |
| Identical local/published tree | `14c37c69a26cbe2773e8b2de5e7833417de40c8b` |

The remote app commit was fetched and its tree verified against the local source. Earlier `407ccd0a`, `6012f205` and `7e1905f4` evidence retains its actual source. The `6012f205` measurements are intermediate, not final results. A later documentation-only commit must preserve runtime identity and receive its own exact-head CI check.

## Exact final before → after measurements

<!-- KIDEASE_ITERATION2_FINAL_METRICS_BEGIN -->
Measured before `729002b216e220d6a2d78699ea2095d16ec496c7` → final `865e4710399d7a0ed6281d18ffa9b4bf4e04e4df`. Three reviewed samples per phase/route/language; ranges retain all samples.

| Page / locale | Reviewed samples before / after | LCP median ms | LCP range before / after | CLS median | TBT median ms | Script gzip bytes |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| home EN | 3 / 3 | 3,609.399 → 3,608.381 | 3,608.975–3,609.461 / 3,608.367–3,609.053 | 0 → 0 | 241 → 157 | 693,431 → 690,880 |
| home FR | 3 / 3 | 3,193.741 → 3,193.346 | 3,191.55–3,196.93 / 3,191.969–3,193.872 | 0 → 0 | 318 → 226 | 762,565 → 760,018 |
| search EN | 3 / 3 | 4,546.483 → 5,890.519 | 4,545.836–4,612.635 / 5,878.808–5,892.447 | 0 → 0 | 582.918 → 564.602 | 735,373 → 733,423 |
| search FR | 3 / 3 | 4,546.364 → 5,740.816 | 4,546.23–4,620.712 / 5,590.211–5,875.804 | 0 → 0 | 657.841 → 698 | 805,303 → 803,356 |
| daycare EN | 3 / 3 | 11,277.276 → 11,275.677 | 11,136.514–11,283.63 / 11,126.584–11,286.611 | 0.170109 → 0 | 13 → 12 | 842,917 → 840,231 |
| daycare FR | 3 / 3 | 11,760.464 → 11,768.412 | 11,463.373–11,775.499 / 11,470.604–11,786.335 | 0.170109 → 0 | 33 → 33 | 912,216 → 909,527 |

After priority aggregates missing targets: LCP 6/6; script gzip 6/6; CLS 0/6. INP is unavailable; TBT is separate. Search simulated LCP regressions remain visible. Shared-host and candidate-change limitations prevent a strict isolated-cause claim.

**Final frame data caveat:** search totals 425→426 although the original SSR/settled first 96 slugs match. Parent n1 request cards EN 2→1 and FR 1→2. No complete-fixture data identity or causal speedup is claimed; cause is unknown. Earlier canonical viewport/matrix 425/425 captures retain their own scoped proof. No DB edits, reruns or retouched images removed these differences.

### Supplemental n1 observations

One paired observation per page/language, not a stable median or variance estimate.

| Page / locale | Samples before / after | LCP ms | CLS | Script gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| listing EN | 1 / 1 | 1,241.511 → 1,217.969 | 0 → 0 | 732,452 → 729,815 |
| listing FR | 1 / 1 | 1,243.237 → 1,218.544 | 0 → 0 | 801,765 → 799,128 |
| login EN | 1 / 1 | 1,066.196 → 1,082.963 | 0 → 0 | 649,678 → 647,047 |
| login FR | 1 / 1 | 1,066.599 → 1,066.583 | 0 → 0 | 718,731 → 716,102 |
| parent EN | 1 / 1 | 10,721.785 → 10,582.522 | 0.0385 → 0.0385 | 818,021 → 815,399 |
| parent FR | 1 / 1 | 11,181.884 → 11,328.938 | 0.0385 → 0.0385 | 887,040 → 884,416 |
| admin EN | 1 / 1 | 9,968.104 → 10,016.384 | 0 → 0 | 692,276 → 689,613 |
| admin FR | 1 / 1 | 10,029.65 → 10,147.586 | 0 → 0 | 692,276 → 689,613 |
<!-- KIDEASE_ITERATION2_FINAL_METRICS_END -->

Supplemental listing/login/parent/admin EN/FR observations use one paired sample per route/language. They stay separate from the six priority three-sample aggregates; n 1 is not a stable median or variance estimate. Unavailable or wrong-state desk samples are not passed.

## Confirmed changes and sampled proof

| Finding | Sampled page / width | Recorded result |
| --- | --- | --- |
| Caller utilities defeated the physical Button floor | Home/parent EN/FR, 48 width/text/reflow profiles | 194 under-44px occurrences → 0; includes a clone of an actual rendered Button for the caller-override invariant |
| Cookie panel escaped short viewports | Same 48 profiles | 18 offscreen panels → 0; policy/choice controls remain scroll-reachable |
| Cookie/Help shared hit areas | Same 48 profiles | 14 observed overlaps → 0; measured clearance applies in app and website channels |
| Seven search controls measured 38.5px | Search EN/FR, 320/390/768/1280 | 56/56 sampled final target occurrences meet 44px |
| Larger actions forced an extra filter row in the intermediate build | Search EN/FR, 412×823 | Final compiled bar 50.984px versus intermediate 101.984px; 8px gaps, 44px actions and existing 66.5px Help parking space retained. First title y 806.578–841.578; geometry is not an LCP result |
| Anonymous provider spacer caused CLS | Daycare EN/FR, 412×823 | Baseline 140px spacer accounts for 0.170109 shift; equivalent padding reserves clearance. Six unthrottled `407ccd0a` diagnostic runs record CLS 0; final Lighthouse is separate |
| Heavy chat body loaded before use | SmartMatch delayed-chunk EN/FR 390/1440; appearances 390/1280 | Load on activation; immediate focus/Escape/Tab/opener restoration and matching pending geometry. Matching/search/save logic retained |
| Intentional abort entered retry gate | Native-fetch/local-HTTP helper tests | No abort retry/backoff; later read succeeds; genuine 429 behavior retained |
| Preview schema code and CSP guard affected startup graph | Standalone page / eligible embedded preview | Bridge loads only inside an eligible frame; Zod CSP initialization remains in the built startup path; no entry hint adopted |

Independent root/home reads start concurrently, known root flags are reused, settled timeout timers clear, and identical identity-specific AI flag reads share only their in-flight promise. Browser Sentry imports behind the unchanged DSN/consent gate; eligible visits still await SDK initialization.

Document overflow, Help outside the viewport and cookie/app-tab overlap are zero in both matching control phases; absent baseline bugs are not claimed as fixes. Counts are sampled occurrences, not distinct bugs or full-product acceptance. Earlier strict search on `6012f205` recorded 390px findings 8→0 and 1280px 7→0 with 425 centres and the same 96 slugs. Seven were small targets; the eighth 390px finding was a partial photo/Help hit candidate with an independently reachable photo link. Final content-v 3 evidence is separate.

## Final responsive and native browser zoom coverage

<!-- KIDEASE_ITERATION2_FINAL_COVERAGE_BEGIN -->
The same content-v3 matrix recorded 828 decisions per phase: nine selected page/desk homes × EN/FR × 46 width/orientation/text/appearance/reflow profiles. Before recorded 144 zero-finding states, 494 flagged states and 190 blocked/gated decisions; final after recorded 172 zero-finding states, 430 flagged states and 226 blocked/gated decisions. Availability changed: before blocked 184 feature-off profiles and 6 missing admin-FR states; after blocked 168 feature-off profiles, 16 missing staff-FR markers and 42 missing admin-EN markers. The missing-marker cause is unknown; no JavaScript errors explain it in these captures. Do not compare aggregate counts as improvement across those different cohorts. These are first-viewport loaded-state resize checks, not all-public/full-scroll/populated feature-off desk certification. Canonical PNG counts are 192/198 before and 185/198 final; missing intended-state captures remain unavailable.

Among 596 healthy common profiles, every paired content fingerprint matches. Before has 452 flagged / 144 zero-finding states; final has 424 flagged / 172 zero-finding states. Repeated heuristic occurrences are under-44px 1,959→1,366, overlap 492→491, occluded 63→62 and clipped text 147→140. These are observed sampled geometry differences, not distinct repaired bugs, a broad accessibility pass, or evidence about unavailable cohorts.

Native browser 200% zoom is a separate completed 40-case final-source run. `chrome.tabs.setZoom(2)` automatic/per-tab and full CDP physical render-surface capture are proved 40/40. Baseline emulated widths 320/1200 become effective CSS widths 160/600; DPR 1→2, CSS zoom 1 and visualViewport scale 1. Chrome outer-window minimum remains 500px, so 320 is an emulated render viewport, not a physical 320px device/browser window. Captures are CDP render surfaces, not browser-chrome UI screenshots.

Of 28 available functional cases, 26 have raw flags and 2 have zero findings;12 cases are gated/nonfunctional, including four government redirects to public home. The 120 layout samples cover top/middle/bottom only. Raw overlay/occlusion/truncation flags require context and do not prove permanent unreachability. Before-zoom PNGs were cropped and are **uncertified for visual comparison**; their DOM/API observations remain valid.

Verified remaining clipping at effective 160CSS includes authenticated avatar right 167px, Menu tab right 176px, parent area-waitlist input right 197.2px, and listing directions right 206.6px EN / 234.2px FR. Additional under-44px listing/daycare/admin controls remain at 600CSS. Full 220-case actual-zoom coverage across all widths/orientations/looks/themes was bounded out; no all-screen 200% compliance claim.
<!-- KIDEASE_ITERATION2_FINAL_COVERAGE_END -->

## Startup evidence and rejected alternative

<!-- KIDEASE_ITERATION2_FINAL_STARTUP_BEGIN -->
First activation is at DCL+1second, not a fixed time since navigation. Absolute click times are shown. A diagnostic retry never converts a failed first activation to a pass. These instrumented desktop traces are not field INP.

| Page / locale | Before first activation | Before click ms | After first activation | After click ms |
| --- | --- | ---: | --- | ---: |
| home EN | failed/unavailable | 4,752.2 | failed/unavailable | 4,758.9 |
| home FR | failed/unavailable | 4,876.6 | failed/unavailable | 4,877.6 |
| search EN | opened | 24,973.2 | opened | 25,312.1 |
| search FR | opened | 25,232.3 | opened | 25,571.3 |
| daycare EN | opened | 26,457.9 | opened | 26,540.8 |
| daycare FR | opened | 26,670.1 | opened | 26,681.4 |
<!-- KIDEASE_ITERATION2_FINAL_STARTUP_END -->

An n 1 EN/FR normal HTTP-proxy experiment on `7e1905f4` retained only the actual bootstrap entry hint/nonce without moving `<Scripts>` or restoring the graph. Entry completion advanced about 1.8s, but HTML transfer took about 0.63s longer and paint was 28ms EN / 92ms FR later. Both first and diagnostic activations failed. A 30s EN follow-up observed the handler at 25.10s control /24.42s prototype; both activations had already failed. The hint was **rejected and is absent from final source**. Earlier route.fulfill experiments did not reproduce normal document throttling and retain that limitation.

The large static route graph and startup delay remain unresolved and need a separate reviewed architectural pass. No unsupported startup timer removal or acceptable INP/early-interaction claim is made.

The retained 30s trace identifies the next engineering action: 164 critical static modules finish through the last `founding-period` dependency at 21.538s, main entry evaluation at 21.541s, matched-route module at 24.679s and Menu handler at 25.101s. No JavaScript/CSP exception or hidden launch hold explains the path. A separate follow-up should inventory that request dependency graph, consolidate fragmented automatic shared-chunk waves, and separate lightweight route validators/telemetry helpers from province/AI schema payloads. Recheck first activation and LCP with production-like compressed HTML and the same EN/FR/auth fixtures. This does not propose another preload or feature-flag change.

The final search LCP candidate changes from the first-listing heading to the branded fallback-photo logo in the same simulated viewport. The title partly below the viewport is a possible contributor, not a proved sole cause. All final search samples preserve 96 rendered unique listings, one search data request and one in-flight-deduplicated AI-flag request. The slower simulated LCP remains a regression; removing the intermediate 51px filter row does not establish that regression was fixed. Observed Lighthouse insight breakdowns are distinct from the simulated LCP total and must not be presented as its decomposition.

## Methodology and evidence validity

Lighthouse uses a fresh profile and exactly one document-only warmup per sample, simulated Moto G Power 412×823, Slow 4G 150ms/1638.4Kbit/s and 4×CPU. Warmup uses fixed mobile Chrome 136 while Lighthouse uses host Chrome 157 in its mobile UA; both phases retain this pairing, so exact UA identity is not claimed. Agent test/build/layout jobs stop during timing; existing user browser activity remains visible. This is shared-host lab evidence, not a physical-device or exclusively idle-host causal benchmark.

Local transport: the entry is 578,395 decoded /136,360 encoded bytes including headers, so JS is compressed. Home HTML is 453,328 decoded /455,073 encoded, effectively uncompressed. Nitro preview compresses static files; SSR HTML bypasses that compressor. Absolute CDP 4G delay may differ from compressed production HTML; production/CDN encoding was not verified.

External photos, tiles and analytics are blocked; branded photo placeholders are expected local state, not production-media proof. Disposable PGLite supplies signed-in fixtures; no production accounts/data, messages or payments. No public Sentry DSN or consent is present, so observations do not establish the consented production Sentry path. **INP is unavailable**; TBT and menu activation are separate diagnostics.

Original after-search EN 360/390/768 screenshots were confirmed loaders. Another 141 search rows lack settled-state proof and remain unverified, not confirmed loaders. The old 275 passed-profile count is historical heuristic output, not loaded-state certification. Original raw reports remain in [results.md](results.md). Changed classifiers prevent comparing original/final aggregate findings as improvement.

Final genuine viewport pairs cover home/search/listing/login/daycare EN/FR 390×844 with source/readiness sidecars; they are distinct from full-page captures or crops. All 10 pairs preserve identical content fingerprints; all 20 PNGs are source-checked. Listing EN records minified React error #418 on both sources before recovery to stable loaded data; those screenshots are valid loaded captures, not error-free certification. The error remains unresolved. Final Lighthouse frames require separate visual review. State, counts and appearance must match; loader/empty/error screen substitutions are not presented as improvement.

## Validation, delivery and remaining limits

<!-- KIDEASE_ITERATION2_FINAL_VALIDATION_BEGIN -->
Source: 865e4710399d7a0ed6281d18ffa9b4bf4e04e4df; Typecheck: passed; Tests: 2,864 passed; 0 failed; 0 skipped; Lint: 0 errors; 130 existing warnings; Build: npx vite build passed with an environment cleared of production credentials; migration-bearing npm run build not used; Bundle guards: SSR bundle, locale chunks, client database checks passed

Exact recorded CI head `f68193a0a0990df63656992838175538de3a9297`, checked 2026-11-12 14:53:41 UTC: 16 successful checks; 1 skipped; 0 pending. Overall terminal state: True. Recorded failures: []. Automatic preview: success. This applies only to the named head; a later docs-only head needs separate verification.
<!-- KIDEASE_ITERATION2_FINAL_VALIDATION_END -->

Library report version 2 preserves the intermediate 6012 evidence. The final report is prepared to replace the **same identity** as version 3; the actual upload/version result is recorded in the artifact handoff. The original 457MB archive is historical-only. A separate final iteration 2 package preserves source/manifests/valid screenshots and rejected/provisional evidence with labels.

The all-public/all-populated-desk responsive/full-scroll sweep remains incomplete. Org/staff flags remain OFF and government access gated; disabled/redirect surfaces are not functional desk coverage. Startup delay, native-zoom clipping, dense/composite controls and French admin copy need review. Confirmed remaining targets include listing tabs 38.5px, daycare enquiry controls 38.5px, and admin-FR stats 35px/fields 38.5px. Physical phones, field INP, complete screen-reader/contrast checks, production media/tiles/CDN/private-cache behavior remain unverified.

The remaining layout follow-up should first isolate the 160CSS authenticated header/avatar/Menu, parent waitlist and listing-directions cases with safe role fixtures, then repair wrapping while retaining 44px targets. Dense listing/daycare/admin controls need the full requested route/width/native-zoom fixture sweep. None of those cases is declared fixed by this draft.

App subscriptions stay OFF. Parent-to-daycare Stripe/payment code and configuration are untouched. No additional speculative app change is proposed during bounded finalization.
