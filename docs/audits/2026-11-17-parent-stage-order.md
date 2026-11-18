# Parent home order · 17 November 2026

Implemented locally on `fix/desk-audit-stage-ssr-nov17` in `/Users/kylel/Documents/Codex/2026-11-17/task-3/kidease-stage-ssr`. Base: `c31468324de946f98ec3a77fa12d3a9db333a95f`, which includes the unpublished desk follow-up on production baseline `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`. The original checkout and `fix/desk-audit-followup-nov17` were left unchanged. This branch has no push, PR, merge or deployment.

## Behavior and source evidence

- The stage comes from the authenticated family's booking rows returned by `getFamily`. It reuses `isEnrolledBookingStatus` (`accepted` or `active`), the existing daily-care convention. A saved centre's private `trackStatus` is not enrollment evidence. Until family loading succeeds, home does not guess a stage.
- Enrolled families see the child's day and latest note preview, action needed, and open bills before discovery, requests/tours and saved centres. Searching families see discovery, requests/tours, action needed and saved centres first. Mixed families keep discovery and search for another child. The upgrade card comes after these tasks.
- Discovery reuses the existing parent matching rail in a compact four-centre mode. It only renders available eligible listing data; empty results retain a search action. There are no fabricated matches, ratings, prices or opening counts.
- The child summary reuses `listMyChildAttendance`, not the generated schedule. `getWeekSchedule` creates scheduled/default-time rows, which are not confirmed arrivals. Notes are joined by exact enrolled booking ID, centre ID and the child's centre-local day. Name-only journal matches are deliberately excluded. No photos or new mutations were added.
- Existing server authentication and feature gates remain responsible for attendance and journals. Disabled features, missing current-account access, loading, failed reads and retry remain distinct. Pending reads have bounded timers. Known child cards reserve space while updates load; notes are explicitly labeled previews with a three-line visual limit and the full care page remains linked.
- Parent home, care, search and bill links preserve EN/FR. The home has one primary next step: daily care for enrolled families, search for searching families. ECE job tools leave the main home; the existing jobs route remains available.
- `getFamily` now includes the verified viewer ID in its existing response. Route seeds are accepted only for that viewer. The parent desk remounts when the user changes; request generations prevent late responses from replacing current state. Parent loader, family, discovery, share acceptance and extra reads have bounded waits. Transport failures are not converted to successful empty extra reads.

## Files

Runtime: `src/components/parent-home.tsx`, `parent-home-care.tsx`, `parent-desk.tsx`, `parent-desk-rails.tsx`; `src/lib/parent-home-stage.ts`, `parent-home-care.ts`, `server/family.ts`; `src/routes/parent.tsx`.

Tests and previews: `scripts/parent-home-stage.test.mjs`, `parent-home-care.test.mjs`, `parent-home-preview.mjs`, `fixtures/parent-home.mjs`; updated older parent audit, rail, INP and jobs source expectations to match the new behavior. No dependency or lockfile changes.

## Validation

Checks ran with production credentials excluded. The local preview used the embedded PGLite backend. No saved login, live customer account, outbound message, live payment service or production flag was used.

- `npm run typecheck`: passed.
- `npm run lint`: passed with zero errors and 141 warnings.
- `npm run build`: passed, including server ESM linkage, lazy locale and client database checks. Source-map upload and remote migration-ledger checks were skipped because credentials were absent. No database migration was applied.
- Targeted regression command: `node --experimental-strip-types --test scripts/parent-home-stage.test.mjs scripts/parent-home-care.test.mjs scripts/parent-desk-audit.test.mjs scripts/airbnb-parent-desk.test.mjs scripts/parent-rails.test.mjs scripts/gap-features.test.mjs scripts/inp-parent-2fa.test.mjs`: 27 passed. Tests render actual home/route/care components with synthetic dependencies, including viewer changes, errors, timeout, missing access and EN/FR order.
- Broad non-payment suite: 658 test files selected; 3,394 passed, two skipped, zero failed. Payment-related filenames and test names were excluded to respect the task's Stripe restriction. The full unfiltered `npm test` was not run. A clean-environment runner and logs are saved in `artifacts/desk-stage-order/`.
- Canonical e2e: `node scripts/e2e-smoke.mjs --url http://127.0.0.1:8081 --require --shard 4/8 --out-dir artifacts/e2e-stage-order-phone`: all three phone groups passed, no flaky or quarantined results. A local wrapper selected the installed Chrome binary and blocked external browser requests. The preview was started separately without the default runner's payment flags. Other smoke shards were excluded because some exercise checkout or Stripe-related paths.
- Synthetic browser preview: `node --experimental-strip-types scripts/parent-home-preview.mjs` after build. 24 screenshots across EN/FR, 390/1280 widths, searching/enrolled, loading/error and two children with long notes. No overflow, sub-44px controls, focus failures, page errors or external requests. Eight care loading-to-ready transitions measured CLS 0. The earlier one-child mobile transition was approximately 0.096 before card space was reserved.
- `git diff --check`: passed. Generated route-tree ordering churn from the build was discarded.

Screenshot and metric files are local ignored artifacts: `artifacts/desk-stage-order/metrics.json`, `en-enrolled-ready-390.png`, `en-enrolled-ready-1280.png`, and corresponding French/search/loading/error/stress images. These render actual home/care/Button markup with synthetic data, a simplified shell and synthetic attention/matches/area/plan slots. They are not authenticated full-route or hydration validation.

## Remaining boundaries

At this revision, admin queue SSR was not implemented. See [the original investigation](2026-11-17-admin-ssr-plan.md) and the subsequent [18 November dormant bootstrap/lifecycle work](2026-11-18-desk-bootstrap.md). No session, role, desk-ready, 2FA, trusted-device or idle gate was weakened.

Authenticated parent and admin browser checks still need a suitable signed-in session. Parent access checks should include searching, enrolled, mixed and coparent accounts, fresh reloads and account changes. Current attendance/journal APIs scope their data to the current user; a coparent can have family enrollment without accessible daily details. This change reports that limit rather than broadening authorization. Journals without exact booking IDs are omitted.

Some existing read APIs catch database errors internally and return empty arrays. The new UI distinguishes rejected/expired reads, but cannot recover failure information an endpoint discards. Therefore these checks do not establish production data correctness. Full authenticated-page CLS, initial SSR, browser JS-transfer comparison and LCP/INP measurements remain outstanding. No initial admin SSR or whole-application performance improvement is claimed.
