# Automatic category motion — 13 November 2026

Application motion source: `91299bdb3d4add381b432c3e365e6c373636e01e`. This follow-up preserves the first published redesign snapshot and supersedes its one-time arrival behavior. Later edits change test harnesses, documentation and evidence only.

## Behavior

The original category PNGs now sway gently without a click, hover or play button. A six-second repeating transform includes a short rest, at most two degrees of rotation and two pixels of vertical movement. Categories are staggered. Only the reserved artwork moves; text, links and tap targets remain stationary. Existing finite interaction replay remains on the inner image.

An IntersectionObserver pauses both effects off-screen; document visibility changes pause them in hidden tabs. Reduced motion prevents animation and cancels both effects when the preference changes. Returning to visible content resumes eligible motion. Unmount disconnects the observer, removes listeners and cancels owned animations. No animation timers, forced layout reads or new dependencies are used. Without Web Animations the controls remain static and functional; without IntersectionObserver the visibility preference still works, but off-screen pausing is unavailable.

Routes, translations, filters, original artwork bytes, Classic default and optional gallery behavior are unchanged. No payment, subscription, feature-flag or production setting changed.

## Validation

- The actual shared React component and exact category CSS ran at 390px and 1280px. Automatic transforms progressed beyond one full six-second cycle with no pointer, focus or click events; controls and labels remained stationary.
- Real scroll/intersection pause and resume, native Enter/Space and anchor activation, repeated interaction, three remounts per width, listener/observer/animation cleanup, initial and live reduced-motion preference, and missing-API fallbacks passed. Zero page errors. [Component report](category-idle-20261113/component-report.json).
- Hidden-state handling passed an explicit `document.hidden` plus `visibilitychange` simulation. Headless Chrome kept actual tabs visible, so this does not certify real background-tab or native-WebView behavior.
- Full local unit run: 3,058 passed; two cases were blocked by sandbox loopback-listener permissions. Rerunning both affected files with loopback permission and external connections blocked passed all three tests, including both blocked cases. The invoice test used its request-route fallback because its optional Playwright browser was unavailable. No test was removed or skipped.
- Typecheck passed; full lint had zero errors and 128 existing warnings. The new browser script and modified files passed targeted lint. Eight category-art/store-status unit checks passed.
- Credential-free `build:dev` and bundle guards passed: 71 server modules, eight lazy extra locales and 727 client files without database schema. No production migration or production request was made.
- The original published head's desktop preflight expected obsolete “Coming soon” copy for unavailable downloads. Its test now requires the current EN/FR “Download unavailable” status while retaining three unlinked unavailable stores, Huawei availability with no invented URL, and the exact Google Play destination. All 16 local EN/FR × Classic/Clean × light/dark × 390/1280 cases passed. This is a test-only correction.
- Its Windows input check also expected a button background change on the redesigned “For daycares” text link. The test now checks visible background, text-color or underline feedback, retaining rejection of unchanged styles. A guarded actual-app probe passed the link's color/underline hover, menu/link focus rings, claim navigation and existing touch/pointer/target/menu checks. Negative unchanged and valid button/link feedback cases passed. No runtime styling or route changed for this correction.
- Its phone issue check expected the previous wider photo ratio. It now requires the shared 20:19 ratio within 0.02, retaining hidden overflow, cover fit and absolute image positioning. Existing card-parity tests passed 7/7. The actual local phone issue pass returned no problems; overriding the frame to the former 4:3 ratio correctly failed. No card data or styling changed for this correction.

Exact latest-head GitHub checks remain a separate release requirement. Earlier successful checks do not transfer to a new head.

## Current rendered evidence

These actual built-app captures use isolated local PGLite and public bundled assets, with non-loopback server and browser requests blocked. No signed-in customer data is present. [Capture provenance](category-idle-20261113/capture-provenance.json) records source hashes, dimensions, fixture limits and checksums.

Catalogue JSON files were not staged beside this header-capture build; homepage recommendations may therefore be empty. The header screenshots and motion remain actual rendered UI. The separate [role-harness follow-up](role-smoke-20261113.md) staged the unchanged repository catalogue locally for its search checks. No listing data was invented or substituted into these captures.

| EN 390px | EN 1280px | FR 390px | FR 1280px |
| --- | --- | --- | --- |
| [Phone](category-idle-20261113/classic-en-390-home.png) | [Desktop](category-idle-20261113/classic-en-1280-home.png) | [Téléphone](category-idle-20261113/classic-fr-390-home.png) | [Ordinateur](category-idle-20261113/classic-fr-1280-home.png) |

Automatic, no-input sampled browser motion: [390px](category-idle-20261113/category-idle-motion-390.webm), [1280px](category-idle-20261113/category-idle-motion-1280.webm). Each captures more than eight seconds and crosses the six-second cycle boundary. They encode actual rendered header frames with their recorded timing; no generated or reconstructed UI and no audio. Static screenshots cannot demonstrate movement. Earlier finite-motion evidence remains in the [original icon snapshot](floating-gallery-20261113.md).

These checks do not establish complete accessibility, physical-device, production performance or external-service acceptance. The broader redesign's [remaining limitations](redesign-release-review-20261113.md#preserved-boundaries-and-outstanding-items) remain, including the unchanged account target and unimplemented Resolution Centre.
