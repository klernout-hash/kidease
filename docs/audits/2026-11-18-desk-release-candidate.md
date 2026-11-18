# Desk release candidate · 18 November 2026

Status: reviewed and validated locally; not pushed, retargeted, merged or deployed. The release coordinator must verify remote checks and database readiness before launch. Local Stripe/payment tests, including mocks, remain excluded. Kyle's later approval permits the existing mocked payment tests in GitHub CI only; the earlier CI permission blocker is therefore resolved, but no remote check result is inferred from that approval.

## Exact candidate and preservation

Existing worktree: `/Users/kylel/Documents/Codex/2026-11-17/task-3/kidease-stage-ssr`. New local branch: `release/desk-candidate-nov18`. The original checkout and all other worktrees were left in place. `fix/desk-audit-stage-ssr-nov17` remains at `83aa0a2f19ce11dc8982382c008fdd96475aa563`; `fix/desk-audit-followup-nov17` remains at `c31468324de946f98ec3a77fa12d3a9db333a95f`.

Assembled desk base: **`8ec1a63cf9da210e13a3c49a47ce7282d1e132bc`**, tree **`2dee0904bf43313e56d90beff4dfcfbefd67a33a`**. It is byte-for-byte tree-equivalent to completed commit `83aa0a2f19ce11dc8982382c008fdd96475aa563`, now with the actual PR commits in its ancestry. A separate release follow-up adds browser-test CI integration and this report above that preserved base; it changes no application runtime files. The final handoff records that follow-up's exact SHA.

| Order | PR/source commit | Candidate commit | Verified identical tree |
| --- | --- | --- | --- |
| 1 | #939 `ed18153e2ce1cee71372d02300dfd77cd52e4287` (local counterpart `50cfbd53`) | Original PR commit retained | `2905cabd702ef2899e5ee46dda397f3d5d7e37be` |
| 2 | #940 `b75179fb5a20795500a4b2d7dc2f0bce602e1610` (local counterpart `c3146832`) | Original PR commit retained | `1f450ae9d1f76db77b1e6665b5d6c5d16c86aabf` |
| 3 | `440723b65ec847e43d5a5622201f759d85fed086` | `61283428a6d3db64ba2a8b760e0e6b4a8efdc567` | `a0197e001c739a700405f09fbf8838ec25871707` |
| 4 | `61a179c502586daa2f98e5e737ff6a33bfb09960` | `6e009f2e69e2e1b175def548f98633ac0b260b7f` | `16a3fc0b1fd128a23f6ce0dccbce9596f9598126` |
| 5 | `83aa0a2f19ce11dc8982382c008fdd96475aa563` | `8ec1a63cf9da210e13a3c49a47ce7282d1e132bc` | `2dee0904bf43313e56d90beff4dfcfbefd67a33a` |

Fetched only the two PR head refs for comparison. Replayed the three completed commits without conflicts and ran a full tree diff against the corresponding source after each. No force update of an existing branch was needed. All descend from production baseline `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`.

This is the desk stack only. It does not contain separate email-branding #937, outbound fail-closed #938, attendance, booking, photo or other parallel work. It changes no dependency versions, migrations, production configuration or outbound gating relative to the desk baseline. The release follow-up only adjusts local/CI test placement and portability. Any later combined release containing those other changes needs its own combined-tree validation.

## Reviewed behavior

- #939 keeps compact truthful subsidy tags, a single scrollable message-filter row, and lazy provider panels.
- #940 keeps the setup card inside the provider desk slot when it appears late or is replaced, separates discovery links from heavy panel implementations, and explains the saved registry comparison in EN/FR without promising live government checks.
- Parent home derives searching/enrolled ordering from actual accepted/active family bookings. The care summary uses existing attendance and daily-journal data; it does not invent status or notes. Searching families retain discovery and requests first; enrolled families get care and existing action/statement sections first, with sibling discovery still available. ECE jobs stay off the main home. Pending/error/empty paths remain explicit.
- Parent navigation and request generations reject interrupted tab work and stale results across repeated clicks, remounts, sign-out and account A→B→A switches. A fresh family read avoids adopting abandoned pending work.
- Admin bootstrap remains dormant: **only exact server value `FEATURE_ADMIN_QUEUE_SSR=1` enables it**, and the clean candidate process/configuration never receives that value. The existing session, operator role, 2FA, trusted-device, idle, readiness and view-as gates remain. Shared HTML caching preserves upstream private/no-store through CSP/gzip. No activation is part of this candidate.

## Validation of the assembled tree

The combined checks used the existing exact-lockfile install and cleared service environment. The application tree remained identical to desk base `8ec1a63c`; the test-integration follow-up was then validated against the final source. No installation, real account, real child record, production database or outbound service was used.

| Check | Result |
| --- | --- |
| `node scripts/desk-nonpayment-checks.mjs build` | Passed; 71 server modules link, locale chunks stay lazy, client database boundary passes (856 files). Source-map upload and remote migration-ledger check skipped because credentials/DB URL are absent. This local skip does not establish remote database readiness. |
| `node scripts/desk-nonpayment-checks.mjs typecheck` | Passed |
| `node scripts/desk-nonpayment-checks.mjs lint` | Passed, 0 errors / 141 existing warnings |
| `node scripts/desk-nonpayment-checks.mjs tests` | Final explicit 19-file unit allowlist: **120 passed**, zero failed/skipped; browser cases now run separately as required checks |
| `node scripts/desk-nonpayment-checks.mjs admin-ui` | **4/4 browser tests passed** after splitting; all original browser scenarios remain. Together with the 120 unit tests, this retains the original 124-test coverage. |
| Five additional reviewed nonpayment suites | **20 passed**: `desk-audit-nov17`, `checklist-slot`, `care-category-art`, `four-category-ux-qa`, `airbnb-parent-desk` |
| Synthetic enrollment status assertions | **11 passed** against production `parentHomeStage`: pending, searching, accepted/active, rejected/unknown labels and mixed bookings |
| `node scripts/desk-nonpayment-checks.mjs parent-ui` | **12/12 passed**: repeated/interrupted clicks, URL changes, replaced reads, visible current errors, sign-out, A→B→A, fresh remount and care timeouts |
| Responsive component captures | Actual care component at 390/1280 and admin fallback EN/FR at 390/1280; visually inspected. Admin metrics: no overflow, 44 px primary links, keyboard focus, zero page errors/external requests. Parent fixture blocks application APIs and financial modules/transports. |
| Tree/whitespace checks | Source/candidate trees match; no whitespace errors. Build-only route ordering churn was reviewed and restored exactly to HEAD. |

Extra-suite allowlist and clean-environment controller are saved as ignored `artifacts/desk-release-nov18/explicit-extra-checks.mjs`. Logs are in that directory: `build.log`, `typecheck.log`, `lint.log`, `tests.log`, `extra-tests.log`, `stage.log`, `parent-ui.log`. No aggregate `npm test`, local payment mock, default payment smoke path or old parent-home financial fixture ran. The actual enabled HTTP harness was not rerun and no flag was activated in this release review. Its earlier disposable evidence is recorded separately in [the HTTP audit](2026-11-18-admin-http.md).

Fresh screenshots and JSON metrics are under `artifacts/parent-navigation` and `artifacts/admin-bootstrap-client`. They are synthetic component/lifecycle captures, not authenticated full parent/provider desk acceptance. The provider setup-slot regression has DOM-placement tests; an authenticated 390/1280 setup-card capture and full desk CLS/INP/LCP remain unverified. Full parent/admin hydration is excluded because existing effects invoke financial handlers.

## Browser-test integration follow-up

Source review found a real release blocker in the assembled base: `admin-queue-bootstrap-client.test.mjs` had a global browser setup that read built CSS and hardcoded Mac Chrome. GitHub's Ubuntu `check` job runs `npm test` without a build artifact or browser installation. Approval for mocked payment tests in CI did not fix those prerequisites.

The follow-up keeps all three pure SSR/authorization-presentation tests in the existing `.test.mjs`, extracts their shared real-component renderer into `scripts/fixtures/admin-queue-client.mjs`, and moves the four hydration/browser tests into `admin-queue-bootstrap-client.browser.mjs`. Default unit discovery no longer requires CSS or a browser for those pure tests. No scenario is deleted or silently skipped.

The clean runner gains explicit `admin-ui`; that mode and `parent-ui` require compiled assets, use installed Mac Chrome only on macOS when present, and otherwise use Playwright's bundled Chromium. The runner preserves only `PLAYWRIGHT_BROWSERS_PATH` in addition to its prior non-service environment allowlist. The installed/locked Playwright 1.62.1 matches the existing CI image 1.62.1. No package, browser or infrastructure is installed by this follow-up.

CI runs both nonpayment UI modes as a mandatory step on existing shard `1/8`, after restoring the existing build artifact. The existing required `e2e` aggregate depends on all shards, so either new UI command failing fails that path. The step has a time budget; it is not `continue-on-error`. The existing failure artifact also includes both fixture directories. Existing unit/payment CI behavior and all other smoke, visual, signed-in and store jobs remain intact. Actual branch-protection settings and remote outcomes still need coordinator verification.

Focused proof: the three pure SSR cases passed normally and with an import guard that throws on any attempted browser launch or built-output read. `admin-ui` passed all four browser tests and `parent-ui` all twelve cases after the split. Targeted ESLint, formatting and whitespace checks passed. Full typecheck, lint, build and the 120-test unit allowlist were rerun on the final source. The admin browser metrics again show EN/FR 390/1280, visible focus, 44 px links and zero page errors/external requests. This validates Mac execution plus the source correction for Ubuntu; actual Linux/GitHub execution remains a remote acceptance gate. Logs are `artifacts/admin-bootstrap-client/ci-integration.log` and `artifacts/parent-navigation/ci-integration.log`.

## Eight pending SQL files: source review only

The release coordinator reports eight pending **preview** filenames from #938's migration check. This review did not connect to preview or production, confirm either ledger, or apply any SQL. These files already exist in the baseline; this desk stack adds/changes none.

`scripts/check-migrations.mjs` checks **all top-level SQL filenames**, independent of feature flags, using `BEGIN READ ONLY`, `SELECT name FROM public._migrations`, then `ROLLBACK`. A configured target missing any filename must fail. Filename presence does not validate object shape or checksums. There is no top-level 0207 migration; both duplicated 0204 and 0208 prefixes represent distinct required entries.

Proposed source order, subject to separately authorized target/schema inspection:

| Exact filename | Effect / prerequisite | Rollback concern |
| --- | --- | --- |
| `0204_centre_lead_worker.sql` | Empty singleton cursor/lease table; worker also needs existing 0200 tracker settings. No schedule/worker activation. | No down script. Removing progress can repeat work; stop workers first. |
| `0204_first_run_onboarding.sql` | Empty account/item seen-dismissed table and index; first-run feature defaults off. | Down loses saved onboarding memory. |
| `0205_centre_documents.sql` | Empty private-document metadata/review storage and index; document panels/checklists use it when their flag is enabled. | Down deletes metadata/reviews and leaves private R2 objects orphaned. |
| `0206_care_floor.sql` | Empty JSON care-floor records with kind constraint and centre FK; requires 0002 daycares. Provider care mounts this panel without a separate floor flag. Missing reads may appear empty; writes need the table. | Down deletes care history. Parent home status instead uses older check-in/journal APIs. |
| `0208_live_support.sql` | Idempotency keys/unique index, reference/alert fields and read marks; requires support schema 0176. | Down loses deduplication/read/reference/alert history. Partial prior schema with duplicate nonnull keys can block the unique index. |
| `0208_persistent_sessions.sql` | Empty refresh/revocation/expiry/step-up device-session storage and indexes; feature defaults off. | No down script. Dropping it loses state while extended Better Auth sessions may remain. |
| `0209_staff_permissions.sql` | Adds member/invite presets and JSON grants; requires employee schema 0045. Backfills active staff/manager null presets without changing roles. | Down destroys custom limits; role fallback can broaden access. |
| `0210_outbound_controls.sql` | Empty controls, daily usage and audit tables; no default rows, sends or flag activation. | Down loses switches, caps, test targets, counters and audit history. Recreating tables resets controls rather than restoring prior configuration. |

All forward files use unqualified object names. A future operator must verify target identity, foundational schema, `search_path`, public object shape, existing rows/partial application, and exact ledger names together. `IF NOT EXISTS` can conceal malformed objects. The down scripts do not reconcile ledger entries, so dropping schema alone can leave the filename-only check falsely green.

Do not use the generic `db:migrate` command as shorthand for narrow eight-file approval. `scripts/migrate.mjs` also runs sourced-age backfills and credential/protected/demo-account hooks. That wider operation has not been authorized here.

The current desk candidate retains inherited outbound store-error fallbacks; the separate #938 changes them. Do not treat schema 0210 alone, or this desk stack, as outbound fail-closed acceptance. Coordinate that version/schema/control relationship in the broader release without modifying outbound files here.

## Proposed integration and rollback

1. The coordinator owns remote publication and merges. Preserve #939 → #940 → the three replayed desk commits in order. If squash/rebase merging changes commit IDs, compare resulting trees and resolve ancestry without duplicating #939/#940. Retargeting/pushing is not performed here. Run required GitHub checks against the actual eventual head; approval for GitHub's mocked payment checks does not permit local payment execution or establish a green run.
2. Do not bypass preview/build/schema checks. Obtain separate authorization for any target database inspection or narrow schema operation. Reconcile the eight reported filenames and object shape, then require the configured read-only migration check to pass. A green credential-free local build cannot substitute for this.
3. Keep `FEATURE_ADMIN_QUEUE_SSR` unset/off through review and initial integration. Its later acceptance needs an explicitly authorized private real-backend session/2FA/revocation/idle/readiness/view-as test, actual edge no-store verification and synthetic-data isolation. Do not infer Neon latency, production counts or full-tools browser acceptance from PGlite/component results.
4. Combine separately approved email/outbound and other release work only in a newly reviewed combined tree. Re-run applicable required CI and preview checks there. No launch or independent deployment is authorized by this local candidate's results.
5. Before a coordinated launch, record the actual known-good deployment ID and exact application SHA. Prefer reverting to that tested application artifact while retaining compatible additive schema. Preserve independently released outbound safety fixes. If code reverts are needed, first reverse/adapt the new test-integration follow-up when its tested components are being removed, then reverse the desk layers in dependency order (8ec1a63c, 6e009f2e, 61283428, #940, #939). Review conflicts and required checks; do not force-reset shared main or blindly revert unrelated release work. Consider retaining independent private-cache hardening in a reviewed rollback.
6. Do not run destructive down scripts as a routine app rollback. Schema rollback requires separate data preservation, migration-ledger reconciliation, active session revocation/expiry, custom staff-grant preservation and outbound-control restoration planning. No schema or configuration rollback is performed here.

The desk candidate is ready for coordinated code review and remote checks. Launch remains gated by actual remote CI/preview results, the reported schema gap, real-backend/full-desk acceptance limits and integration with the other release branches. No production access, schema write, real send, feature activation, push, merge or deployment occurred in this review.
