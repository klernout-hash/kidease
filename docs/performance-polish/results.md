# Performance and shared-control polish — draft evidence

Draft PR: https://github.com/klernout-hash/kidease/pull/841. No merge or manual deployment was performed. The repository independently queues its Vercel preview check.

This is a coherent implementation with documented remaining work, not certification that the full requested product matrix or performance budgets pass. The app was measured at `2f7a2ee1762ebd4d02fd14b063bbb7b4a9cddf4b`, based on verified default `main` at `75cf0cd3cc1dc993b6eb920fe17139306f00cb80`. Connector-published commit `6d3d4c982de817d856e9649912e3a8fa390e209f` has tree `a78834c37765155ec66526abf5a8e2a0f336e8d6`, identical to reviewed local commit `fc4e517f94dd3a9bba09926f017750b97d5eba16`. Its runtime files are identical to the measured app; three test assertions differ.

## Changes and checks

- Deferred 17 daycare components across 16 modules, with the existing desk skeleton and navigation preserved.
- Map initialization waits for an onscreen host. Pin/bounds reads are serialized, latest camera changes coalesce, pending keys clear, and transport aborts after 12 seconds or teardown. MapLibre image concurrency is six; Google/vector tile concurrency remains provider-controlled.
- Public listing links preload on intent. No global authenticated-route prefetch was added because loaders can have effects.
- Shared buttons, chips, fields, header, desk navigation, listing controls and footer use physical touch minima, wrapping and clean-look tokens. Existing caller overrides still leave some targets undersized; see limits below.
- Drawer focus returns to the opener, tab boundaries use visible controls, and the entire panel scrolls in short landscape layouts.
- Existing responsive images, self-hosted subset fonts, lazy locale packs and public-only catalogue cache were retained. No dependency removal was justified by demonstrated non-use.

The final local full suite passes **2,824 tests**. Typecheck, lint (0 errors, 130 existing warnings), production `npx vite build`, SSR/locale/client-database bundle guards and repository phone smoke shard **4/8** pass. Other smoke shards are not claimed. The measurement build did not run the migration-bearing `npm run build` command. No `/api/health` call was made by these local checks. Local fixture notifications had no configured delivery providers; no messages were sent.

## Confirmed fixes and measured widths

| Bug | Pages / checked widths | Before → after |
| --- | --- | --- |
| Brand link was too small | Home/login/shared header; EN/FR 320, 390, 1280 | 38.19×39.5 → 44×44 CSS px |
| Rem-based live chip was too short | Home; EN/FR 320, 390, 1280 | 38.5 → 44 px high |
| Login fields and visibility toggle were too small | Login; EN/FR 320, 390, 1280 | Fields 38.5→44 px; toggle 38.5²→44² |
| Desktop menu was 42px | Shared header at 1280 | 42² → 44² |
| Listing rail arrows were 38.5px | Home at 1280 | 38.5² → 44² |
| Escape did not restore focus | Drawer; EN/FR, 1280×800 and 1280×320, both looks/themes | Baseline failed 16/16; final 15 opened cases passed; one opening timeout passed a separate retry |
| Footer settings could not be reached in short drawer | Drawer 1280×320, 125% application text | Baseline failed 8/8; final eight short cases passed |
| Desk imports loaded unselected editors/reports | Daycare home | First loaded EN scripts 896,074→842,917 gzip bytes (−53,157; −5.93%) |
| Map camera changes could overlap reads or strand pending tiles | Search/map helper behavior | Serialized queue, unconditional cleanup, tested cancellation and timeout recovery; real external tiles unavailable locally |

Manual final review contains **36 settled page captures**: 36 HTTP 200, no document horizontal overflow and no JavaScript errors in those selected cases. Eight focused short-landscape drawer checks passed. These are selected samples, not full product-wide certification.

## Remaining limits and design decisions

- All 14 measured route/locale JavaScript budgets fail; 10 LCP and two CLS aggregates fail. English search median LCP regressed from 4,630.410 to 5,116.313 ms. No overall speedup or target-compliance claim is made. Layout workers and Node checks overlapped the timing runs on the same Mac. Dedicated server processes isolated fixture databases, but not host CPU/memory contention; these are exploratory shared-host lab measurements, not a controlled causal benchmark.
- The full product matrix is outstanding. The saved coverage manifests distinguish completed, blocked, failed and not-run cases. Dynamic city/guide/token routes and populated org/staff/government desks are not comprehensively covered.
- Parent quick-search input remains 42px because a caller utility overrides the shared field minimum. Some claim/cookie controls remain 38.5px for the same reason. Composite where/date inputs and inline verification/legal links also remain strict-target findings. Raw overlap/clipping candidates require review, including cookie/help overlays.
- The final primary menu run has 15 passes and one opening timeout; the separate retry passed. Startup activation was often not ready at one second, so startup responsiveness is not certified.
- Organization/staff flags stay off and their populated role memberships were not provisioned. Government fixtures redirect to public home. French admin uses `/admin?lang=fr`, with existing English main copy.
- Browser zoom is approximated with half-width CSS reflow, not actual browser UI zoom; no physical phone, real 4G, field INP, complete assistive-technology/contrast audit, real CDN/private-cache validation or external map/image service check is claimed.
- Review decisions remain for a complete 44px/8px treatment of dense calendars/composite fields, remaining caller size overrides, French admin copy and the broader all-screen sweep. Existing feature flags and classic look remain unchanged; no new motion was introduced.

App subscriptions stay off. Parent-to-daycare Stripe/payment code and configuration are untouched; no live payment was exercised. All authenticated checks used disposable local PGLite fixtures. No production accounts/data were modified.


# Local performance comparison

Built source: before `75cf0cd3cc1dc993b6eb920fe17139306f00cb80`; after `2f7a2ee1762ebd4d02fd14b063bbb7b4a9cddf4b`.

Simulated Moto G Power viewport, 412×823 CSS px, DPR 1.75; desktop Chrome, not a physical phone. Lighthouse simulated Slow 4G (150 ms RTT, 1638.4 Kbit/s throughput), CPU slowdown multiplier 4. Lighthouse 13.6.0. External browser services and health are blocked. These are lab results, not physical-phone or field measurements.

Cold Chrome profile for every navigation. The first full matrix started with a fresh dedicated server; the two core replicates use the same warmed local PGLite process. These mixed server states are retained in the ranges and per-sample metadata.

Before and after used dedicated preview servers and separate local database processes, but layout workers and Node checks ran concurrently on the same shared Mac during timing collection. These are exploratory simulated lab readings under host contention, not a causally isolated benchmark, a physical-device test, or field INP. The observed EN search regression is retained and cannot be attributed to unchanged search query logic without an isolated rerun.

Core routes have three samples per phase; parent/daycare/admin have one. All raw samples, including regressions and the initial cold-server result, remain in comparison.json and the linked Lighthouse reports. INP is unavailable; TBT is shown separately.

| Page | Locale | Samples before / after | LCP ms before → after | LCP range before / after | CLS before → after | TBT ms before → after | Script gzip bytes before → after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| home | en | 3 / 3 | 3610.268 → 3610.738 | 3609.099–11041.508 / 3609.636–10897.11 | 0 → 0 | 281 → 274 | 690919 → 693431 |
| home | fr | 3 / 3 | 3197.646 → 3207.492 | 3197.055–3200.139 / 3205.772–3208.39 | 0 → 0 | 363 → 372 | 760051 → 762565 |
| search | en | 3 / 3 | 4630.41 → 5116.313 | 4622.081–5151.933 / 4629.926–12129.25 | 0 → 0 | 669 → 589.656 | 733000 → 735373 |
| search | fr | 3 / 3 | 4626.213 → 4644.531 | 4557.775–4631.015 / 4644.118–4644.996 | 0 → 0 | 639.947 → 826.059 | 802936 → 805303 |
| listing | en | 3 / 3 | 1238.248 → 1229.628 | 1230.024–1246.118 / 1225.528–1685.715 | 0 → 0 | 11.5 → 0 | 730012 → 732452 |
| listing | fr | 3 / 3 | 1227.583 → 1253.963 | 1219.213–1248.664 / 1231.328–1264.988 | 0 → 0 | 28 → 36 | 799329 → 801765 |
| login | en | 3 / 3 | 1072.335 → 1078.716 | 1067.497–1081.39 / 1068.375–1090.499 | 0 → 0 | 2.5 → 3 | 647269 → 649678 |
| login | fr | 3 / 3 | 1088.792 → 1071.301 | 1072.349–1095.182 / 1068.311–1076.39 | 0 → 0 | 26 → 22 | 716330 → 718731 |
| parent | en | 1 / 1 | 10594.073 → 10690.15 | 10594.073–10594.073 / 10690.15–10690.15 | 0 → 0 | 14 → 19 | 814103 → 818021 |
| parent | fr | 1 / 1 | 10905.382 → 11256.158 | 10905.382–10905.382 / 11256.158–11256.158 | 0 → 0 | 44 → 41 | 883122 → 887040 |
| daycare | en | 1 / 1 | 11360.562 → 11096.54 | 11360.562–11360.562 / 11096.54–11096.54 | 0.170109 → 0.170109 | 25 → 33 | 896074 → 842917 |
| daycare | fr | 1 / 1 | 11874.303 → 11220.24 | 11874.303–11874.303 / 11220.24–11220.24 | 0.170109 → 0.170109 | 56 → 58 | 965382 → 912216 |
| admin | en | 1 / 1 | 9945.857 → 10235.06 | 9945.857–9945.857 / 10235.06–10235.06 | 0 → 0 | 0 → 0 | 689722 → 692276 |
| admin | fr (English main copy) | 1 / 1 | 10031.527 → 10006.28 | 10031.527–10031.527 / 10006.28–10006.28 | 0 → 0 | 17 → 23 | 689722 → 692276 |

The script figure sums unique loaded same-origin script bodies compressed individually with gzip level 9. Inline document scripts are excluded, so it is a lower bound for the full JavaScript budget. 14 of 14 measured route/locale rows exceed 200,000 bytes; 10 exceed the LCP target and 2 exceed the CLS target. LCP target failures and median regressions remain visible; no overall target-compliance claim is made.

## Unavailable desk coverage

- org en: Provider fixture reaches the shared daycare surface; a distinct organization/staff membership and populated desk are not provisioned. Not counted as passed.
- org fr: Provider fixture reaches the shared daycare surface; a distinct organization/staff membership and populated desk are not provisioned. Not counted as passed.
- staff en: Provider fixture reaches the shared daycare surface; a distinct organization/staff membership and populated desk are not provisioned. Not counted as passed.
- staff fr: Provider fixture reaches the shared daycare surface; a distinct organization/staff membership and populated desk are not provisioned. Not counted as passed.
- government en: Existing government access/visibility gate redirects this fixture to the public home page. Not counted as passed.
- government fr: Existing government access/visibility gate redirects this fixture to the public home page. Not counted as passed.

French admin uses /admin?lang=fr; its existing main copy is English. The original /fr/admin 404 diagnostic is preserved under before/lighthouse/initial-run-diagnostics.

## Provider script graph

The first EN provider navigation loaded 896074 → 842917 gzip bytes (-53157; -5.93%). This is a loaded-script comparison, not a claim that product features or dependencies were deleted. Full added/removed/changed chunk details are in provider-loaded-script-comparison.json.

Static provider dependency graph: 869629 → 816827 gzip bytes; 245 → 239 statically reachable modules. The direct route entry can grow while heavy panes move behind dynamic imports. The static graph and actual first navigation are separate measurements.

## Document and content checks

| Page / locale | Before document bytes by sample | After document bytes by sample | Before SSR listing articles | After SSR listing articles |
| --- | --- | --- | --- | --- |
| home / en | 51455, 298910, 298910 | 51739, 303730, 303730 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |
| home / fr | 303541, 302711, 302711 | 308361, 307530, 307530 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |
| search / en | 480872, 480156, 480156 | 41929, 489396, 489396 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |
| search / fr | 486908, 486192, 486192 | 496148, 495432, 495432 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |
| listing / en | 38003, 38003, 38003 | 38512, 38512, 38512 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |
| listing / fr | 37820, 37820, 37820 | 38329, 38329, 38329 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |
| login / en | 25244, 25244, 25244 | 25922, 25922, 25922 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |
| login / fr | 25575, 25575, 25575 | 26253, 26253, 26253 | unavailable, unavailable, unavailable | unavailable, unavailable, unavailable |

Document size can change when the server returns an initial fallback and the browser later fills results. Per-sample readiness listing counts/slugs, document bytes, observed server latency, final screenshot, and final URL are retained in comparison.json. A successful later readiness probe alone does not prove that the original timing frame was fully loaded; the actual Lighthouse screenshots and LCP node records must be reviewed too.

Expected timing sample set complete: yes. Full desk coverage and performance-target compliance remain incomplete.
