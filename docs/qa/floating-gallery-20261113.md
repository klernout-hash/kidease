# Floating Gallery category icons — 13 November 2026

Application/test source: `55197ba9827cd5f381b8a157d569c26401c0a1d0`, extending reviewed redesign `b3a5e6a4`. Later evidence edits change documentation only.

## Behavior

All eight original 256×256 RGBA PNGs are included unchanged and mapped by the shared `CareCategoryIcon` component. [Asset provenance](floating-gallery-20261113/asset-provenance.json) records their sizes and SHA-256 values. These are decorative category illustrations, not listing photos.

The Classic header retains its six licensed-care/program links, localized labels and selected-city query. The existing optional gallery retains eight categories, including All and Open Spots, with its existing destinations and selection behavior. Phone rows retain horizontal scrolling. Classic remains the default look; Clean remains opt-in. No feature flag, source data, payment/subscription setting, business filter or authorization behavior changes.

The PNGs themselves are static. Their reserved icon boxes use the reference's finite 1.05-second sway, with cubic-bezier(.35,.05,.2,1), rotation and vertical translation. A staggered arrival plays once; pointer entry, keyboard focus and clicks can replay it. Pointer exit does not start another animation. Reduced motion disables the arrival and interaction effects; changing the preference cancels an active effect. Unmount removes the control/media listeners and cancels owned animations. Labels and hit targets remain stationary. There are no animation timers or forced layout reads.

## Validation

- Full local suite: **3,060 passed, 0 failed, 0 skipped**. Typecheck passed. ESLint: **0 errors, 128 existing warnings**.
- Fresh credential-free `build:dev` and bundle guards passed: 71 server modules, eight lazy extra locales and 727 client files without database schema. No migration ran.
- Eight actual-app functional cases covered Classic/gallery × EN/FR × 390/1280: **56 route checks with back navigation, 24 repeated cycles and eight keyboard/focus checks**. Classic's 24 destinations retained the selected Winnipeg query; the optional gallery's 32 destinations retained its existing semantics.
- Those cases recorded zero page errors, document overflow or observed category layout shifts. Original images decoded at 256×256, contained in reserved 49×49 boxes at the tested root font size. The smallest category control was 84×79.75, above the 44px target.
- An independent mounted-component probe covered repeated entry, no exit replay, native Enter/Space activation, aborted pointer release, live reduced-motion changes and cleanup: 15 animation calls and zero page errors.
- Additional Classic/Clean and light/dark appearance checks cover 32 combinations in total. A settled Clean/gallery desktop probe also verified brand, account, menu, daycare link and search-button containment and center hit-testing. Their measured scope is recorded in [capture provenance](floating-gallery-20261113/capture-provenance.json); document width alone is not a complete clipping check.

## Actual application screenshots

The following settled screenshots use Classic/light appearance and the bundled public catalogue. They contain no signed-in accounts or private conversations. Non-loopback server/browser requests were blocked. Exact source revision, dimensions, hashes and fixture limits are in [capture provenance](floating-gallery-20261113/capture-provenance.json).

| Existing navigation | EN 390×844 | EN 1280×900 | FR 390×844 | FR 1280×900 |
| --- | --- | --- | --- | --- |
| Classic, six types | [Phone](floating-gallery-20261113/classic-en-390-home.png) | [Desktop](floating-gallery-20261113/classic-en-1280-home.png) | [Téléphone](floating-gallery-20261113/classic-fr-390-home.png) | [Ordinateur](floating-gallery-20261113/classic-fr-1280-home.png) |
| Optional gallery, eight categories | [Phone](floating-gallery-20261113/flagged-en-390-home.png) | [Desktop](floating-gallery-20261113/flagged-en-1280-home.png) | [Téléphone](floating-gallery-20261113/flagged-fr-390-home.png) | [Ordinateur](floating-gallery-20261113/flagged-fr-1280-home.png) |

Additional Clean/dark examples: [Classic phone](floating-gallery-20261113/classic-en-390-clean-dark.png) and [settled gallery desktop](floating-gallery-20261113/flagged-en-1280-clean-dark.png).

## Rendered motion drafts

These videos encode actual hydrated, font-settled browser header frames using their recorded capture timing. They are sampled rendered motion, not generated or reconstructed UI. Static screenshots disable animation and cannot demonstrate the sway.

| Existing navigation | 390px phone | 1280px desktop |
| --- | --- | --- |
| Classic | [Motion](floating-gallery-20261113/floating-gallery-motion-390.webm) | [Motion](floating-gallery-20261113/floating-gallery-motion-1280.webm) |
| Optional gallery | [Motion](floating-gallery-20261113/floating-gallery-motion-flagged-390.webm) | [Motion](floating-gallery-20261113/floating-gallery-motion-flagged-1280.webm) |

## Limits

This is local synthetic/public-data acceptance, not a production, physical-device, complete accessibility or performance certificate. The imported PNG files total 747,675 bytes; this is file size, not measured transferred bytes or a page-speed result. External photos/services and native WebViews were not accepted by these checks. Exact published-head CI, all guest smoke shards and signed-in CI remain separate release requirements. The broader redesign's [outstanding limitations](redesign-release-review-20261113.md#preserved-boundaries-and-outstanding-items) remain.

The unchanged account/login styling produced a 42×42px target in the settled Clean/gallery desktop check, below the repository's 44px guideline. Category targets meet that guideline. This remains a separate accessibility follow-up; these checks do not certify every site control.
