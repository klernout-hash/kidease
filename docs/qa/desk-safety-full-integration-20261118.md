# Desk and safety integration · 18 November 2026

This integrates exact desk candidate `03263fb515e71131d6ecc8be53f72907f5b7e001` and safety candidate `bf2a6ebb455928288c81b9d725b04b9664099f79` in a new worktree `/Users/kylel/Documents/Codex/2026-11-17/task-3/kidease-full-integration-nov18`, branch `release/desk-safety-integration-nov18`.

Local merge `037ec72b5df89ae01a5b300cca841d5ace5fa431` has both exact candidates as parents. Their complete ancestor/follow-up histories are retained; neither original candidate or worktree was changed. The common base and currently observed remote main are `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`. Follow-up changes extend synthetic bilingual browser evidence only; the final tested SHA is recorded in the draft PR and Library manifest.

## Manual integration review

Only CI and `src/components/curriculum-pack.tsx` overlap between candidates. Both merged automatically and were then reviewed by source comparison.

- `CurriculumPackDesk()` through the end of its file matches the safety candidate exactly: selected-child story filtering, explicit exact-story choice, disabled upload until selection, frozen booking/story/centre payload, resets on child/centre changes, and newly saved story selection remain intact.
- `curriculum-pack-link.tsx` and the provider route match the desk candidate exactly. The link is separated from the heavy panel and the panel remains lazy.
- The curriculum server and all three outbound safety files match `bf2a6ebb` exactly. Authorization/consent checks, upload rechecks, cleanup/private-read safeguards and outbound fail-closed behavior were not weakened.
- Admin session/role/2FA/trusted-device/idle/readiness/view-as gates and the exact default-off SSR check match `03263fb5`. No feature configuration is activated here. No migrations change.

## CI and publication review

The merged workflow retains both mandatory Chromium installation before the default GitHub unit suite and mandatory admin/parent browser checks on shard `1/8` after build restoration. Failure propagation, time budgets and diagnostic artifacts remain intact. No test was removed, silently skipped, or made nonblocking. Existing payment mocks are approved in GitHub CI only; local aggregate/payment tests remain excluded.

All four checked-in workflows were inspected; the corresponding current-main trigger sections were also read through GitHub. CI and store-isolation pushes are limited to main; PRs targeting main run checks, including drafts. Android release is manual. Live smoke requires a successful Production deployment event or manual invocation. No checked-in workflow deploys production as a consequence of pushing this non-main branch or opening its draft PR. No release workflow is manually dispatched here.

`vercel-ignore.mjs` allows release-branch website builds; the repository does not encode Vercel's external production-branch or environment configuration. Those external settings were not inspected or changed. A configured Vercel Preview/build check may therefore run, and its reported migration-ledger gap must not be bypassed. Publication is for exact-candidate CI and review, not a production deployment or merge.

## Local verification

Dependencies were installed from the unchanged lockfile with lifecycle scripts disabled. Application credentials, database URLs, delivery credentials and feature variables were excluded from all test/build children. No production database, real child image, real send, Stripe test or payment mock was used locally.

- Explicit desk unit allowlist: **120 passed**, zero failed/skipped.
- Explicit outbound/photo/curriculum unit allowlist: **111 passed**, zero failed/skipped.
- Five additional desk-polish/setup suites: **20 passed**, zero failed/skipped.
- Production enrollment-stage helper: **11 synthetic assertions passed**.
- Required curriculum picker: **1 test passed**, zero failed/skipped; it repeats all six original binding/reset/new-story safeguards in separate English and French contexts. Actual product translations are used. Four genuine component screenshots at 390/1280 have no overflow, external browser requests or page errors. Existing English artifact paths remain compatible; French evidence and captures are added.
- Required admin browser suite: **4 passed**, zero failed/skipped; EN/FR captures at 390/1280 preserve visible focus and 44 px controls, with no overflow, page errors or external requests.
- Parent navigation/care: **13 passed**—all 12 original English cases plus a French account-switch case. Actual care components and production translations/CSS are captured in EN/FR at 390/1280. Locale, overflow, 44 px action and focus are measured. API/financial/external transport guards remain.
- Typecheck passed. Full ESLint passed with zero errors and 141 existing warnings.
- Direct sanitized Vite build passed. Bundle guards passed: **71 server modules**, **8 lazy extra locales**, **856 client files**. No package build wrapper, sourcemap upload, migration checker or migrator was run. The output targets local Darwin and is not a deployment artifact.
- Generated route ordering was reviewed and restored to HEAD. Source whitespace checks passed. Browser fixtures clean up their listeners, contexts and temporary fixture directories.

Reproducible local commands, from the isolated integration worktree:

```sh
node scripts/desk-nonpayment-checks.mjs tests
env -i PATH="$PATH" HOME="$HOME" CI=1 node --experimental-strip-types --test scripts/outbound-gate-failure.test.mjs scripts/outbound-controls.test.mjs scripts/curriculum-photo-authorization.test.mjs scripts/curriculum-pack.test.mjs
env -i PATH="$PATH" HOME="$HOME" CI=1 node --experimental-strip-types --test scripts/desk-audit-nov17.test.mjs scripts/checklist-slot.test.mjs scripts/care-category-art.test.mjs scripts/four-category-ux-qa.test.mjs scripts/airbnb-parent-desk.test.mjs
env -i PATH="$PATH" HOME="$HOME" CI=1 CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node --experimental-strip-types --test scripts/curriculum-photo-picker.test.mjs
node scripts/desk-nonpayment-checks.mjs admin-ui
node scripts/desk-nonpayment-checks.mjs parent-ui
env -i PATH="$PATH" HOME="$HOME" CI=1 node node_modules/typescript/bin/tsc --noEmit --incremental false
env -i PATH="$PATH" HOME="$HOME" CI=1 node node_modules/eslint/bin/eslint.js .
env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=production node node_modules/vite/bin/vite.js build
env -i PATH="$PATH" HOME="$HOME" CI=1 node scripts/check-ssr-bundle.mjs
env -i PATH="$PATH" HOME="$HOME" CI=1 node scripts/check-locale-chunks.mjs
env -i PATH="$PATH" HOME="$HOME" CI=1 node scripts/check-client-db.mjs
```

Logs are under `artifacts/full-integration-nov18`; locale-specific browser metrics and images are under `artifacts/curriculum-photo-authorization`, `artifacts/admin-bootstrap-client` and `artifacts/parent-navigation`. The Library package includes the Git bundle, exact SHA/tree/parent manifest, checksums, sanitized evidence, command results and actual screenshots. PNGs are browser captures, not generated mockups.

## Limits and next release gates

These are synthetic component and authorization-function checks. They do not prove real production authorization, real consent changes/R2 behavior, native picker/image decoding, a full authenticated desk, real-backend concurrency, edge caching after deployment, or LCP/INP/CLS targets. The admin SSR flag stays off pending its real-backend acceptance. Full parent rendering is not locally tested because existing effects include financial reads.

The previously reported eight Preview ledger filenames remain an independently identified schema/ledger prerequisite, not proof of missing tables or Production state. No SQL preflight, database connection, migration, ledger repair, feature setting or security change was performed. A green credential-free local build cannot establish that prerequisite.

The draft PR must receive exact-head GitHub checks. Actual failures should be diagnosed from their logs and corrected without weakening checks or running local payment tests. No PR merge, production deployment or release workflow is authorized here. Retain compatible additive schema during an application rollback; do not run destructive down scripts or the generic migrator to clear a check.

The QR stack ending at `a170ac2b11c172f41fa70f1f5ee36d242abc37e7` is queued separately. It is not included in this tested tree. After this candidate and its CI are stable, prepare a distinct stacked QR candidate and review migrations 0215→0216→0217, privileges/ownership, transactions, locking and technical revisions before any further integration. No QR migration or flag activation is implied by this report.

## Published candidate and CI regression follow-up

Draft PR [#942](https://github.com/klernout-hash/kidease/pull/942) initially published exact tested commit `0646ba64e0833987199bbd59ceb84d6e1419ed9c`. Remote equality, repository push access and secure CLI keyring storage were verified. Both candidate histories remain intact.

Its first GitHub unit job ran 3,667 cases: 3,655 passed and 12 failed. The failures exposed test assertions tied to the former inline queue/navigation implementation, missing request-scope imports in isolated parent fixtures, and a global browser-install prohibition that conflicted with required unit-component Chromium provisioning.

The follow-up changes only test code and this report. Admin moderation assertions now inspect the extracted query, exercise the real pure row mapper and retain authorization-before-read checks. Navigation assertions follow the extracted hook and its integration. The care VM runs the real request-scope hook with its React boundary and lifecycle; an added regression covers replacement, channels, account A→B→A, cancellation and unmount. Browser-cache expectations are scoped to the desktop job while the unit job's unconditional Chromium provisioning remains required. No test coverage, authentication gate, workflow check or runtime code is removed or disabled.

Local follow-up validation passed 11 explicitly selected nonpayment cases (4 admin moderation, 4 INP, 2 French routing/auth and 1 CI browser invariant), plus an isolated actual-hook regression. The full care/stage fixtures and the other French/scorecard cases were not executed locally because their dependency graphs or assertions include financial code; existing full coverage remains in GitHub CI. Typecheck passed; final full ESLint passed with zero errors and the same 141 warnings. Application, build, migration and workflow sources were verified identical to `0646ba64`.

The exact-head Vercel Preview build and all three bundle guards passed, then `db:migrate:check` failed with `MIGRATIONS_PENDING`: `0204_centre_lead_worker.sql`, `0204_first_run_onboarding.sql`, `0205_centre_documents.sql`, `0206_care_floor.sql`, `0208_live_support.sql`, `0208_persistent_sessions.sql`, `0209_staff_permissions.sql` and `0210_outbound_controls.sql`. This is an observed Preview ledger result, not proof of Production schema state. No database connection or migration was performed by the local workflow. Keep that gate intact and require exact follow-up-head CI before integration. The final PR and Library publication receipt record the follow-up SHA and current check outcomes.

Messaging is also queued separately: UX `70da2b98` over `7f3a271e`, plus safety `1274f7b06dbfd95436a98619ed210288f972f188`. Review complete ancestors and migrations 0211/0218 alongside QR numbering, privileges and locking. Preserve reservation/no-replay behavior and delivery-hold-compatible rollback fencing; old binaries can bypass those holds. No messaging code or migration is included here.
