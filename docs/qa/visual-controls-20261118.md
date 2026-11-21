# Visual control follow-up — November 18, 2026

Base: `4d478a26f369c799872ca2a247383009db54ec34` (PR944), isolated branch `fix/visual-controls-nov18`. PR943 and PR944 remain unchanged. This is a bounded control-size and native-disclosure audit fix, not full-page visual acceptance.

## Confirmed issue groups and changes

| Group | Before evidence | Change | After evidence |
| --- | --- | --- | --- |
| Clean quiet radius select | Exact source excerpt and finished base CSS: 73.5×38.5 CSS px, EN/FR at 390/1280. The 2.75rem rule overrode the quiet 44px height at a 14px root. | Local clean radius rule uses `max(44px, 2.75rem)`; widths/options/labels unchanged. | Height 44px, readable chevron/label, selection/focus preserved. Regular and classic variants remain at least 44px. |
| Map/Carte and Satellite buttons | Exact complete control-stack JSX: both layer buttons 24.5px high. The Map button is also narrower than 44px. No larger enclosing click handler exists. | Add the existing `min-h-11 min-w-11` floors, inline centering and touch manipulation to the two existing native buttons. | All layer/location/zoom controls at least 44×44; callback and keyboard checks pass; full stack fits the 280px map host without covering the radius badge. |
| Closed native disclosure findings | Five existing detector cases passed; four new closed/open/nested-details cases failed on installed Chrome. Hidden descendants retained rectangles that the detector treated as visible. Search's area-waitlist and claim's enrollment forms use this closed native structure. | `hiddenUp` excludes closed-details body content, retaining the first direct summary branch and all open content. | Nine detector cases pass, including active overlap/small-target positives, open overflow/spill positives, nested/extra-summary and Boolean `open="false"` semantics. |

The detector change preserves the existing minimum size, pixel thresholds, masks, caps, clipping rules and inert/modal handling. No accepted baseline was changed. It does not establish that all 624 earlier footer-overlap observations are resolved; the actual app audit has not been rerun with a pinned synthetic catalogue.

## Synthetic browser evidence and limits

`scripts/visual-controls.browser.mjs` compiles exact AST excerpts of the existing radius function and complete map-control/badge JSX, with four pure helper modules, literal EN/FR copy, actual finished-build CSS and local fonts. It does not import or run the owning ExploreSearchBar, PlaceSearch, MapView, application routes, catalogue, database or map/provider services. State and callbacks are synthetic. All browser requests and WebSockets are blocked.

Eight before and eight after captures cover EN/FR × clean/classic × 390/1280. Checks cover geometry, inset/centre hit testing, control overlap, page overflow, map-stack containment, badge clearance, focus, keyboard activation, radius selection and local callbacks. All eight after cases pass, with zero requests, WebSockets or page errors. Independent review found no visual issue in four representative before/after pairs. The smallest mobile bottom clearance is about 24.6px.

Private local evidence is under `artifacts/visual-controls/{before,after}/`: 16 PNGs, verdicts, source/excerpt/CSS/font hashes and screenshot hashes. `private-acceptance.md` records the independent image review. The CI shard-1 step requires the after check and uploads its artifact directory. Existing admin/parent/product browser steps remain mandatory.

## Validation

All final accepted runs used the unchanged private outbound guard and a clean environment. No dependencies were upgraded or installed.

- `node --test --test-isolation=none scripts/layout-audit-controls.test.mjs`: 9/9 pass after a real 5-pass/4-fail RED reproduction.
- `node --test --test-isolation=none scripts/search-radius-viewport.test.mjs scripts/site-footer.test.mjs`: 17/17 pass.
- `VISUAL_CAPTURE_PHASE=before VISUAL_CSS_FILE=<finished-base-css> node scripts/visual-controls.browser.mjs`: 8 expected-short-control captures pass.
- `node scripts/visual-controls.browser.mjs`: 8 after cases pass against the finished candidate CSS.
- TypeScript `tsc --noEmit`: pass. ESLint: 0 errors, 141 existing warnings.
- Direct credential-free `vite build`, then `check-ssr-bundle.mjs`, `check-locale-chunks.mjs`, `check-client-db.mjs`: pass. This does not run migration checks, uploads or deployment.

An initial default worker test invocation was stopped by the private preload check before cases ran; single-process Node test mode retained the guard. Restricted Chrome launch failed before cases and then ran successfully with the separately approved native execution. Two prospective older suites (`ipad-layout` and `search-radius-url`) were stopped by the guard for transitive financial imports and excluded, without bypassing it. Unrelated phone-navigation assertions, including a wallet-path assertion, were also excluded from accepted results. These attempts are retained in private incident logs; no financial module or provider executed. No aggregate local payment/Stripe suite ran.

Build-only generated route-tree ordering drift was preserved privately and restored to the exact base file; no unrelated route-tree change is included.

## Remaining acceptance and release gates

- The 14px home input observations still need actual compound hit-area evidence. Where has a larger click-to-focus segment; Name does not have the same forwarding. This pass does not claim either fixed.
- Blank Help media and the missing login-provider row remain unattributed baseline/runtime/capture differences. No behavior or auth/provider configuration was changed.
- No full search/claim/MapView lifecycle, map transport, native-device, authenticated desk or complete large-text audit is claimed. The old 76 baseline mismatches are not automatically accepted.
- Existing Preview migration gate remains unresolved. No live database/schema access, backup, migration or ledger write is authorized here. No merge/deployment or activation occurred.
- App subscriptions stay off, Email Bot paused and CRM Bot paused. Other unresolved features remain dormant. Source defaults are not runtime-state evidence.
