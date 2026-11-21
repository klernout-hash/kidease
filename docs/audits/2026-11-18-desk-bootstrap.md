# Dormant admin bootstrap and parent lifecycle · 18 November 2026

Continuation of local commit `440723b65ec847e43d5a5622201f759d85fed086`, on the existing `fix/desk-audit-stage-ssr-nov17` worktree at `/Users/kylel/Documents/Codex/2026-11-17/task-3/kidease-stage-ssr`. No checkout, branch, production configuration or service has been replaced. No push, PR, merge, deployment, live send or feature activation is part of this work.

## Admin summary

`FEATURE_ADMIN_QUEUE_SSR` is an opt-in server environment value: only the exact string `1` enables this code. It remains unset/off. The existing `assertAdminDesk` check reports that flag alongside its unchanged gate result; the route performs no extra bootstrap request when off. Direct calls to the disabled endpoint still pass the normal authentication middleware.

When enabled in a future approved environment, a new server function validates the actual Better Auth session and its public session ID, matches the authenticated actor, rejects view-as, runs the complete `requireAdmin` chain, and resolves desk/account readiness. Only then does it read the queue. It repeats role, 2FA, trusted-device, idle, desk/account and actual session checks after the read; session or credential rotation invalidates the result. The ordinary client session, desk and `TwoFactorGate` checks remain in place for the admin tools.

The serialized response contains only viewer/public-session IDs, timestamps and four global counts (Waiting, Live, Declined, Total), or an unavailable state. It contains no session token, signed proof, centre rows, provider contacts or child data. The lease cannot exceed 15 seconds or session/2FA expiry. Responses use `Cache-Control: private, no-store`; the route has zero stale/garbage-collection time and rechecks on navigation. These values are display data and cannot authorize any later server request.

The shared queue reader preserves the existing SQL projection, eligibility, licence/photo mapping, duplicate collapse, hidden-row handling and sorting. Existing admin callers retain their add-on enrichment; the new summary never invokes that enrichment, contracts, financial reads or financial components. Counts reuse `staffQueueRows(..., false)` and `tallyAdminCentreStats`. They are explicitly global, exclude QA fixtures, and do not pretend to reflect province/document/local-search filters or incomplete/licence/photo counts.

Desk resolution has an optional read-only mode for the summary: it retains denial for closed accounts and all authorization decisions, while skipping CRM intake sends and account cleanup. Existing callers retain their previous behavior. Existing authentication/profile bootstrap and idle bookkeeping are unchanged; this mode is not a claim that the entire legacy authorization chain has no writes.

The initial read-only summary can server-render in the lazy/session/desk/2FA pending states, independently authorized by the complete server bootstrap. On hydration it is withheld until current raw session identity, desk readiness and a fresh full bootstrap check agree. Sign-out, account/session mismatch, denial, expiry, blur, hidden visibility, page hide and unmount clear it; late results cannot restore it. This deliberate withholding can produce a brief count disappearance during hydration. No full-tools SSR or measured production paint improvement is claimed.

Queue-read failures and bounded queue-read timeouts return unavailable, never zero. Authorization failures still withhold data and retain the existing 404/verification routing. An outer route timeout covers middleware as well as the handler.

## Parent lifecycle

`useParentNavigation` is now the production authority for immediate tab highlighting and deferred panel selection. Generations prevent interrupted work from reversing a newer click or URL change, including A → B → A. Repeated selections are ignored without swallowing navigation to the route's other menu destinations.

`useParentRequestScope` binds reads to a mounted viewer and request channel. Late results and failures, superseded requests, sign-out and A → B → A account switches cannot replace current content. Family payloads must match the verified viewer ID. A fresh read on mount prevents an old pending cache entry from becoming a new account visit's result. Superseded reads stop before downstream requests. Current shortlist-refresh failures have a visible recovery path; obsolete failures do not overwrite newer success. The care summary uses the same scope and retains its timeout/error states.

The new browser harness mounts actual React/TanStack Router navigation, the production lifecycle hooks, actual deduplication and the care component with synthetic attendance/journal boundaries. It does not mount the full parent desk, whose existing extra reads include financial data. It rejects financial modules and transports rather than mocking them. No old parent-home financial fixture is used in this continuation.

## Validation commands and evidence

Run the clean build before browser checks. `scripts/desk-nonpayment-checks.mjs` contains an explicit reviewed filename allowlist, clears service credentials from child environments, rejects dotenv files and accepts only these commands:

```
node scripts/desk-nonpayment-checks.mjs typecheck
node scripts/desk-nonpayment-checks.mjs lint
node scripts/desk-nonpayment-checks.mjs build
node scripts/desk-nonpayment-checks.mjs tests
node scripts/desk-nonpayment-checks.mjs parent-ui
```

Final results: typecheck passed; lint passed with zero errors and 141 warnings; build passed including server ESM linkage, locale laziness and the client database-schema guard. The 17-file allowlist passed **114 tests, zero failures/skips**. The parent browser harness passed **12 scenarios, zero failures**. Four admin EN/FR 390/1280 captures had no overflow, undersized controls, focus failures, page errors or external requests; two parent care captures were visually reviewed at the same widths. A first combined run failed because the concurrent build temporarily removed its stylesheet directory; the final run was serialized after the completed build and passed. Duplicate compiler/lint jobs were stopped and rerun sequentially under local resource pressure.

The tests command is not aggregate discovery or a name-based payment exclusion. All Stripe/payment tests, including mocks, are excluded. The default `npm test`, old parent-home previews and default/role payment smoke paths were not run.

The new server tests use genuine Better Auth cookie-signature verification with its installed memory adapter and the actual middleware, verified-session resolver, role/email gate, signed 2FA, trusted-device, idle and persistent-session functions. Synthetic leaves supply SQL, desk readiness, view-as state and queue rows. The feature branch is injected inside a source-loading test harness; the application's actual flag is never set. Tests also cover post-read proof/role/session/readiness changes, credential rotation, proof expiry, queue failure/timeout and no-store serialization boundaries. The shared reader has separate mapping, eligibility, ordering and error tests.

The client suite mounts the actual React fallback through hydration and checks session/account changes, denied rechecks, late responses, expiry, focus, hidden visibility and unmount. Its four EN/FR screenshots use 390 px and 1280 px. The shell, router link and auth/readiness transport are synthetic. Parent screenshots use the isolated nonfinancial navigation/care fixture. These are component and lifecycle checks, not production authentication evidence.

Final command results and screenshot metrics are saved under `artifacts/desk-bootstrap-nov18`, `artifacts/admin-bootstrap-client` and `artifacts/parent-navigation`. Build source-map upload and remote migration-ledger checks must remain skipped without credentials. No database migration is applied by these checks. Build-generated route-tree ordering churn is discarded.

## Limitations and next integration step

No authenticated production account, real database, real child record, real 2FA code or outbound service was accessed. At commit `61a179c5`, the complete actual `/admin` HTTP/streaming document had not yet been validated with the dormant feature enabled. The subsequently authorized disposable, clean-environment Nitro/Better Auth/PGlite checks are recorded in [Admin bootstrap HTTP validation](2026-11-18-admin-http.md), including the private-cache fix, 20 passing scenarios and actual JavaScript-disabled EN/FR captures. No production activation is implied. Keep the feature off during review/integration.

The existing persistent-session enforcer and trusted-device lookup have legacy fallback/error semantics. This work preserves them; it does not claim that every storage outage is newly fail-closed. The new gates never turn an explicit revocation or failed proof into an authorized summary.

The full admin tools' historical client behavior and financial workflows are outside these harnesses. Full authenticated page CLS, transferred JavaScript, LCP/INP and production count correctness remain unverified. Parent financial extra-read behavior was not tested. There is no deployment or activation approval implied by the local commit.
