# Admin bootstrap HTTP validation · 18 November 2026

This continues `61a179c502586daa2f98e5e737ff6a33bfb09960` in the existing worktree `/Users/kylel/Documents/Codex/2026-11-17/task-3/kidease-stage-ssr`, branch `fix/desk-audit-stage-ssr-nov17`. The branch originally started at the unpublished follow-up `c31468324de946f98ec3a77fa12d3a9db333a95f`, descended from production baseline `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`. The original checkout and the follow-up worktree/branch remain unchanged.

## Finding and fix

The outer Nitro CSP middleware replaced an upstream `Cache-Control: private, no-store` policy with the general HTML document revalidation policy. Its public-page cache helper could also promote an explicitly private document back into a shared cache.

`scripts/csp.mjs` now preserves upstream `private` or `no-store` directives verbatim while retaining no-store on all three CDN headers. `server/middleware/csp.ts` skips public cache promotion for those private documents. The declaration in `scripts/csp.d.mts` matches the new helper. Ordinary anonymous public documents keep their previous cache behavior. Six focused tests cover the real CSP middleware, nonce stamping, gzip, private public-path documents and non-HTML responses.

## Disposable test boundary

`scripts/admin-http.synthetic.mjs` creates two separate child processes with an environment allowlist. It refuses dotenv files, drops all service credentials and generates an ephemeral signing secret. Only the enabled child receives `FEATURE_ADMIN_QUEUE_SSR=1`; the disabled child receives `0`. No environment file, production flag or other feature is changed. No infrastructure or package is installed.

The fixture imports the actual built Vercel/Nitro server, initializes the application's real migrated, in-memory PGlite database and seeds only synthetic users, sessions, profiles, five daycares and one private review note. No auth or SQL implementation is replaced. Session cookies use the installed Better Auth signature format; 2FA uses the existing signing helpers with the ephemeral secret. The fixture preserves the real last-admin database trigger by temporarily assigning the synthetic parent profile a stored admin role while testing the operator's unverified parent role; the parent's unrelated mailbox still cannot authorize admin access. That profile returns to parent before view-as checks.

A real Node HTTP listener binds only to loopback. Only GET `/admin` documents and built static assets are served; other application transports are refused. Server fetch and browser requests may reach only that listener. A SQL tripwire rejects financial table access and outbound message writes after schema initialization. JavaScript is disabled and service workers are blocked in Chrome. This is essential: the existing full admin tools refresh financial handlers in a client effect. Neither that effect nor a financial mock is executed here. Passive role/configuration helpers and the queue's existing listing fee columns are not payment tests or transactions.

The authorization path still performs its existing profile ensures, notification projection and idle bookkeeping inside the disposable database. The bootstrap's read-only option skips intake sends and account purging; it is not a claim that every authorization query is a SQL read. Both child processes, their HTTP listeners and their in-memory databases close after the checks.

## Verified results

The final built application passed **20 HTTP/browser scenarios**: two with the flag disabled and eighteen with it enabled.

- Disabled authorized requests contain no bootstrap and execute zero queue reads. Anonymous requests still deny.
- Authorized enabled GETs contain Waiting **2**, Live **1**, Declined **1**, Total **4** from actual queue SQL. A fifth QA row is excluded. Gzip and nonce middleware preserve `private, no-store` plus `no-store` on Cloudflare, Vercel and generic CDN headers.
- Missing, tampered, expired and deleted sessions deny. A stored admin role on an unauthorized mailbox denies. An unverified operator with a parent role cannot bootstrap admin.
- Missing, expired, tampered and foreign-user 2FA redirect to verification. A revoked matching trusted device denies even with a valid current-login proof.
- A stale session without an idle proof denies. An expired account denies without purging the synthetic session. An active, correctly timed view-as session cannot receive the admin summary. Native shells redirect to the existing unavailable page.
- Three concurrent authorized/anonymous request pairs stay isolated. Deleting the actual session row after initial authorization, at the driver boundary before the actual queue SELECT executes, prevents count serialization; a new real session restores access. This is an in-flight revocation check, not a claim that the deletion occurs after rows have returned. The separate server-function unit tests cover post-read changes.
- Renaming a queue column in the disposable schema causes a real PostgreSQL error. The authorized document shows unavailable, with no zero counts, and retains the private policy. The column is restored afterward.
- The actual initial HTML is visible with JavaScript disabled in EN and FR at **390 px and 1280 px**. Exactly one count panel is visible. Each layout has no horizontal overflow and no summary link below 44×44 px. All four screenshots were visually inspected. Saved profile language takes precedence over cookie/header hints, so each locale uses the real synthetic profile preference.

React emits both a fallback and a streamed replacement in the raw document. The raw-HTML assertion validates every count panel, and the browser separately verifies exactly one is visible without running reveal or hydration scripts. No assertion relies only on serialized route data. Every captured response is checked for raw session tokens, signed current-login proofs, the private contact and review-note sentinels before its authorized HTML can be saved.

Final metrics: **zero external network attempts, zero forbidden SQL attempts and zero page errors**. Eleven real queue reads occurred in the enabled child. The browser requested only documents, CSS, local fonts, logo and favicon.

## Commands and artifacts

Run from this isolated checkout, without dotenv files:

```sh
node scripts/desk-nonpayment-checks.mjs build
node scripts/desk-nonpayment-checks.mjs admin-http
node scripts/desk-nonpayment-checks.mjs typecheck
node scripts/desk-nonpayment-checks.mjs tests
node scripts/desk-nonpayment-checks.mjs parent-ui
node scripts/desk-nonpayment-checks.mjs lint
```

- Build passed, including server ESM linkage, lazy locale and client database-boundary checks. Source-map upload and the remote migration ledger check skipped without credentials; no remote migration was applied. Generated route ordering was reviewed and restored to HEAD.
- Typecheck passed after adding the helper declaration.
- The explicit **19-file nonpayment allowlist passed 124 tests**, zero failures/skips. It includes six new cache tests, four direct-fixture refusal tests and the existing synthetic admin hydration checks. No aggregate discovery, default payment smoke suite, payment mocks or Stripe tests were run.
- Parent navigation passed **12/12** cases, including repeated/interrupted navigation, account A→B→A, fresh remount data, sign-out, stale errors and care timeouts.
- Lint passed with **0 errors and 141 existing warnings**. Diff whitespace checks passed.

Logs are under `artifacts/admin-http`: `build.log`, `http.log`, `typecheck.log`, `tests.log`, `parent-ui.log`, `lint.log`. The two process results are `disabled/results.json` and `enabled/results.json`. The authorized HTML is `enabled/authorized.html`. Screenshots are `enabled/en-390.png`, `en-1280.png`, `fr-390.png`, `fr-1280.png`. These local ignored artifacts contain synthetic data only. Parent captures and the existing component-hydration captures remain under `artifacts/parent-navigation` and `artifacts/admin-bootstrap-client`.

Early fixture failures were corrected without weakening app gates: duplicated streamed markup needed panel-scoped assertions; the last-admin database trigger needed a second synthetic stored admin; and French needed the persisted synthetic profile preference. A missing TypeScript declaration was fixed. The final complete runs supersede those failed attempts.

A final review found that direct use of the internal fixture in a dirty shell could print a rejected database configuration through Node's assertion error. Static refusal messages now reject database/deployment/auth-fixture configuration and a missing ephemeral secret before Nitro/database initialization. Four subprocess regression tests verify refusal and that synthetic sensitive values never appear in output. The completed HTTP runs had clean environments, so no credential was exposed by those runs. This guard change leaves their already verified HTTP/auth behavior unchanged; no further flag activation was needed.

After the interrupted connection, the new audit file was present but the older audit update had not landed. Both were inspected and reconciled. Metadata checks found no remaining HTTP fixture worker or listener on its recorded loopback port; completed children had already closed their browsers, listeners and in-memory databases.

## Remaining integration needs

No production database, customer/child data, actual login code, real account, outbound service or payment workflow was accessed. No push, PR, merge, deployment or production activation was performed. The dormant default stays off.

This validates the genuine enabled document/auth/SQL path against the disposable PGlite backend. It does not establish production Neon latency, production count correctness, Cloudflare/Vercel edge behavior after deployment, full admin-tools hydration, real provider data or performance targets. Full parent-desk rendering remains excluded because its existing extra reads include financial handlers. Component hydration and nonfinancial parent lifecycle behavior have separate synthetic checks.

Existing trusted-device and persistent-session fallback/error semantics remain unchanged. The required matching-device revocation case passes; competing host/shared-device candidates and every storage-outage permutation have not been validated here. Do not infer broad authorization hardening from this cache fix.

The next safe step is code review/integration with the feature off, followed by an explicitly authorized private staging acceptance check using synthetic data and staging credentials. No additional infrastructure is needed for the completed local checks. An authenticated full-tools/real-backend browser check is still required before any later activation, under a scope that respects the payment exclusion.
