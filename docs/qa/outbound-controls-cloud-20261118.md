# Outbound controls cloud follow-up, 18 November 2026

This isolated worktree continues published draft PR #938, exact head `977d839d62c107bb127ac7cf624371834213792d` (tree `774836c84fad5178e7101c0fede6a0f1fc39c3f1`), based on `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`. The local-only follow-up branch is `cursor/outbound-cloud-verification-nov18`. `AGENTS.md` was read; this published tree has no `.agents/skills` directory. No inaccessible Mac work was recreated.

## Concrete fix

`src/lib/server/outbound-gate.ts` now shares one controls refresh per process and checks an invalidation generation before either caching or returning its result. A read started before a saved safety change cannot restore the old live snapshot or authorize a waiting ordinary send. Retired requests cannot clear a newer pending refresh. Cache freshness starts when the read starts, and results that consume the full 15-second window fail closed when they settle. No SQL query timeout was added. The successful setting write invalidates the cache before the separate audit insert, including when that insert fails.

`scripts/outbound-gate-failure.test.mjs` adds five deterministic synthetic regressions for shared refreshes, invalidated old live results, late failed refreshes, failed audit writes and delayed stale results. SQL, time and transport edges are injected; real database and delivery modules are not imported.

Invalidation is process-local. This does not revoke already-read delivery decisions or eliminate other processes' existing 15-second cache allowance. The documented essential auth/emergency/internal-alert exception remains; slow or unavailable control reads block ordinary sends. No new dependency, workflow, migration, settings or flags changed.

## Verification actually run

Exact lockfile dependencies were installed with `npm ci --ignore-scripts --no-audit --no-fund`; no package lifecycle script was run. No `.env` or credential file was copied into either worktree.

Before the source fix, the single focused failure file produced **8 passed, 5 failed**, with zero skips/cancellations. All five new failures reproduced the identified issues. Log: `/workspace/scratch/cb9e70b5c59e/kidease-outbound-before-concurrency.log`.

After the fix:

```sh
node --experimental-strip-types --test scripts/outbound-gate-failure.test.mjs scripts/outbound-controls.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/server/outbound-gate.ts src/lib/outbound-gate-core.ts src/lib/outbound-controls.ts scripts/outbound-gate-failure.test.mjs scripts/outbound-controls.test.mjs
git diff --check
```

**31 focused tests passed**, zero failed/skipped/cancelled. Typecheck and scoped lint passed with no diagnostics. No aggregate suite or Stripe/payment test, including mocks, was run. Test log: `/workspace/scratch/cb9e70b5c59e/kidease-outbound-after-concurrency.log`.

The final direct `node node_modules/vite/bin/vite.js build` passed using an environment containing only PATH, HOME, CI and NODE_ENV. No application credential/database environment was provided. `npm run build` was deliberately not used, so no sourcemap upload or migration check ran. The generated route ordering-only diff was restored from HEAD.

```sh
node scripts/check-ssr-bundle.mjs
node scripts/check-locale-chunks.mjs
node scripts/check-client-db.mjs
```

All passed: 75 server modules checked for syntax, eight extra locales stayed lazy, and 843 client files contained no database schema. Build log: `/workspace/scratch/cb9e70b5c59e/kidease-outbound-final-build.log`.

## Published state and exact remaining gaps

GitHub was read again in this session. Main remains `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`. #938 remains an open draft at the supplied exact head and base main. Existing CI run `44023012297` and Store isolation run `44023012294` succeeded. Its Vercel status remains failure at https://vercel.com/klernout-1129s-projects/kidease-git/9YQ3VHYa7ggtnq3x9vW29TPTyyL2 . The cloud browser opened that detail page and was redirected to Vercel sign-in; no build log or failure cause was accessible. No retry, deployment or deployment/security settings change was attempted. The passing isolated build cannot explain or clear the remote failure without its log.

#941 remains an open draft at `511cc8390209e201c69c646018818944ecfc7e68`, targeting `cursor/photo-security-review-base-nov17` at the same baseline. No PR-triggered GitHub Actions runs exist; its Vercel status is success under the existing ignored cursor-branch build policy. That status is not a working deployed preview. Its independent cloud verification is recorded in the sibling photo report.

There is no already-available ephemeral PostgreSQL service: no postgres/psql/pg_ctl/Docker executable, installed server directory, PostgreSQL process or local socket. True independent-session authorization/concurrency behavior remains unverified. The sibling photo picker test also failed before page creation because Chromium socket creation returned EPERM. No cloud 390/1280 screenshots or outbound browser smoke result is claimed.

## Next safe step

Obtain read-only access to the exact failed Vercel build log and rerun the focused browser checks on a host that permits Chromium local sockets. Use an isolated synthetic PostgreSQL service for true multi-session authorization/revocation tests when available. Keep both safety PRs draft and preserve the photo review base. Do not push this follow-up onto #938: its main-targeted PR update would trigger the aggregate/payment workflow and Vercel preview. Publication needs a verified review-only cursor branch/base path that avoids those actions.

This follow-up remains local-only. No remote branch/PR was updated, no workflow was triggered, and nothing was merged or deployed. No production database, real child data, live delivery or external messages were used. The user's explicit publication/testing restrictions take precedence over the repository's general PR/e2e instructions.
