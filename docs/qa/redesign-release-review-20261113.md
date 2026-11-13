# KidEase redesign release review — 13 November 2026

This is the implementation and validation record for the redesign draft. Application/test source is reviewed layout `c27a475d`, corrections `960da0f4`, the Floating Gallery extension `55197ba9` and automatic idle-motion follow-up `91299bdb`, based on main `9d9838ec` (#842–#846). See the [review history](approved-redesign-20261113.md), [blocker corrections](redesign-local-blockers-20261113.md), [original icon snapshot](floating-gallery-20261113.md) and [current idle-motion evidence](category-idle-20261113.md) for context. This record does not establish release acceptance.

## Included

- [x] Care categories inside the home header at desktop and phone widths, including Classic; city/locale destinations retained. Small desktop **For daycares** link and mobile-menu destination.
- [x] Original Floating Gallery PNG artwork with gentle periodic idle motion while visible, finite interaction replay, off-screen/hidden-state pauses and live reduced-motion support. Classic retains six type links; the existing optional gallery retains eight categories. Asset bytes, routes, labels and current default look are preserved. [Current screenshots and rendered motion](category-idle-20261113.md).
- [x] Redundant **Live on KidEase** section removed; useful live-centre filtering retained.
- [x] Category and Recently Viewed photo cards use shared responsive sizes/20:19 picture boxes on web and app. Listing photos retain their ratio and cover fit; missing photos remain honest branded fallbacks.
- [x] Source-date photo overlays removed; relevant provenance retained elsewhere.
- [x] Prominent blue **$10 / Day** overlay only for verified eligible records; approved1.8s pulse and reduced-motion suppression. A fee cap, subsidy or province alone does not imply eligibility. The Cornerstone Nelson preview uses the stored official-list entry dated2026-09-30, not a fresh provincial verification.
- [x] Approved tinted **Need help finding the right daycare?** card below ordinary search; existing five-question Match flow preserved, with focus containment/restoration and repeated/interrupted openings tested.
- [x] Clearer childcare detail gallery, facts and next-action hierarchy. Supporting capabilities remain reachable; tour booking depends on real listing capability, with accurate request options otherwise. No photos, availability or customer facts invented.
- [x] Compact Parents / Daycares / Help & KidEase footer, equal app boxes, single Share action and slim legal bar. Duplicate Get Help removed. Phone app shell retains Menu instead of the large website footer.
- [x] Huawei availability from#846 retained with no guessed AppGallery URL; existing Google/Amazon destinations preserved. Pending stores remain accurately labelled.
- [x] Public government offering/navigation promotions removed except neutral government login. Official licensing/fee sources and authority disclaimers remain. Government functionality is protected by actual server authorization, not link hiding.
- [x] Government province actor clamps, narrowed legacy scope fallback, fail-closed HTTP isolation and Alexa role isolation; intended scoped/national/admin paths tested.
- [x] Parent contract PDF ownership/role access corrected; unrelated parent, wrong-role, government and unauthenticated paths remain denied.
- [x] Demand SQL failures distinguished from successful empty reports; EN/FR copy describes waiting-list entries without changing aggregation or suppression.
- [x] Messages scroll/keyboard recovery integrated, with synthetic parent/provider fixture checks at phone, desktop and landscape sizes; no auth or message-data rewrite.
- [x] Shared search predicates for cards/count/map including radius and language; stale pins cleared; Saved-map isolation from#843 retained. School-age loader/client policy aligned.
- [x] Truncated, timed-out and fallback candidates carry coverage evidence; incomplete counts/pagination/retry remain truthful.
- [x] Claimed facts enrich normal/name/live-fallback candidates in bounded batches beyond192. The existing192 heavy review/ranking prefix remains. Incomplete enrichment is unverified; observed hidden IDs cannot be resurrected by stale fallback.
- [x] Public fees on Compare/Saved are independent of KidEase subscriptions, retaining permissions and unknown-fee handling.
- [x] Internal/prelaunch wording replaced while preserving customer truth. Approved subscription presentation and public checkout-error wording changed; payment execution, Stripe configuration, prices and feature flags did not.
- [x] EN/FR detail Suspense boundaries aligned between server/client; real SSR listing content retained. Retry now reloads a failed loader.
- [x] MapLibre receives a worker script URL instead of the raw module's class export. Hashed worker asset bytes are unchanged; actual worker rendering and built map open/close cycles tested.

## Validation and visual evidence

First icon-extension application/test source `55197ba9` passed the full local suite: **3,060 passed,0 failed,0 skipped**; typecheck passed; ESLint **0 errors,128 warnings**. Fresh credential-free `build:dev` and bundle guards passed:71 server modules,8 extra locales lazy,727 client files without database schema. Those category browser checks cover eight functional cases,56 routes/back checks,24 repeat cycles and keyboard/motion/reduced-motion behavior; [historical scope](floating-gallery-20261113.md). The [idle follow-up validation](category-idle-20261113.md) records its exact checks and limits separately.

Earlier redesign source `960da0f4` passed local guest smoke **shard1/8:34/34**, eight EN/FR×390/1280×Classic/Clean hydration cases, synthetic503 Retry recovery, the original two-width coverage scenario and actual-worker/built-map cycles. Those earlier checks are historical; full guest shards and signed-in CI have not been rerun for the icon extension.

Required GitHub `check` and aggregate `e2e`, plus the signed-in result, must be read against the exact published head; earlier checks do not transfer. Published-head status belongs in the PR description. No full production, accessibility or performance sign-off is implied.

Repository-relative screenshots and their exact capture provenance are listed below. They are review evidence within the stated fixture scope, not production or physical-device acceptance.

### Redesign baseline screenshots before the icon extension

These retained built-app captures use `960da0f4` application source, preceding the Floating Gallery extension. The current header screenshots and motion are in the [icon evidence](floating-gallery-20261113.md). The baseline Classic/light pages used local PGLite and the bundled public catalogue with non-loopback server/browser access blocked. All eight recorded zero page errors and no horizontal overflow; detail responses retained the actual SSR listing heading. Missing photos remain branded fallbacks. These captures are not final-revision acceptance. Exact revisions, dimensions and SHA-256 values are in [provenance.json](redesign-20261113/provenance.json).

| Page | EN 390×844 | EN 1280×900 | FR 390×844 | FR 1280×900 |
| --- | --- | --- | --- | --- |
| Home | [Phone](redesign-20261113/current-home-en-390.png) | [Desktop](redesign-20261113/current-home-en-1280.png) | [Téléphone](redesign-20261113/current-home-fr-390.png) | [Ordinateur](redesign-20261113/current-home-fr-1280.png) |
| Detail | [Phone](redesign-20261113/current-detail-en-390.png) | [Desktop](redesign-20261113/current-detail-en-1280.png) | [Téléphone](redesign-20261113/current-detail-fr-390.png) | [Ordinateur](redesign-20261113/current-detail-fr-1280.png) |

### Historical component evidence

The unchanged [English footer](redesign-20261113/historical-footer-en-1280.png), [French footer](redesign-20261113/historical-footer-fr-1280.png), [phone-width eligible pill](redesign-20261113/historical-verified-pill-en-390.png) and [desktop-width eligible pill](redesign-20261113/historical-verified-pill-en-1280.png) are element crops from layout source `fd2747fb`, preceding the blocker corrections. Footer crops are 1280×482; pill crops are 358×341 and 354×337 from 390px and 1280px viewports. They are not current-revision interaction acceptance. Static screenshots disable animation; the pulse and reduced-motion checks are separate. Public provenance distinguishes these captures from the current screenshots.

## Preserved boundaries and outstanding items

- [x] Classic remains `DEFAULT_LOOK`; Clean is opt-in. Subscriptions stay off; no Stripe/payment/Connect setting changed. No Email/CRM bot resumed. Runtime settings/payment availability/external bot state were not queried.
- [x] Main#842–#846, including Huawei and Saved-map behavior, preserved. PR841 is independent and not included; protected PRs remain untouched. PR847 is separate.
- [ ] Exact published-head required checks must complete before release decisions. Current icon-extension screenshots and scoped browser checks do not replace final-head CI, full interaction acceptance or physical-device testing.
- [ ] Enrichment's2s bound limits waiting, not SQL execution or total endpoint latency. At most one chunk per reader may continue, and primary/live readers can overlap. Bounds are design limits, not production performance measurements.
- [ ] Cap-limited/stale fallback remains unverified. Exclusions protect observed nonpublic records only. Existing review/quality limits do not prove exhaustive favorite/rating matching.
- [ ] Legacy national government totals remain unsupported; empty national jobs is not proof of zero. Jobs/curriculum error-to-empty behavior remains outside this targeted pass.
- [ ] Demand counts entries, not unique families/children or a guaranteed reporting period; calculation unchanged.
- [ ] AppGallery URL, physical/native-device acceptance, external tiles/Google and production schema/settings remain unverified.
- [ ] The unchanged account/login target measured42×42px in the settled Clean/gallery desktop check, below the repository44px guideline. New category targets meet44px; full accessibility acceptance remains outstanding.
- [ ] Resolution Centre is queued and **not implemented**. PR841's performance targets are not solved by this redesign.

The existing normal build can invoke migrations when a database URL is configured. Preview database isolation is not established by these local tests. No production health/on-call or signed-in tour/desk loader was used for this review.
