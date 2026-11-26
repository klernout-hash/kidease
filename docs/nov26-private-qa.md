# November 26 KidEase test branch (local only)

Use this branch instead of the live site to rerun the five changed flows. This is
not a production deployment, a real Vercel preview, a native store build, or a
replacement for the full release checklist. Keep these tests separate from
customer records. The database is disposable and resets when the process stops.

In a **fresh clone** of the KidEase repository:

```sh
git fetch origin cursor/nov26-qa-combined
git switch --detach origin/cursor/nov26-qa-combined
npm ci
env -i HOME="$HOME" PATH="$PATH" CI=1 npm run build
env -i HOME="$HOME" PATH="$PATH" CI=1 node scripts/nov26-private-qa.mjs
```

Open http://127.0.0.1:8081/login on that same computer. No environment files or
production credentials are needed. Use a separate browser profile or new
private window for each role. Test password for the four **local fixture accounts
only** is `E2e-role-fixture-pass-1`.

| Role         | Fake local email                | Check                                                                                                                                                             |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent       | `e2e-parent@kidease.test`       | Open `/parent?tab=family`, generate and copy the invite.                                                                                                          |
| Other parent | `e2e-qa-recipient@kidease.test` | In a separate signed-out browser profile, follow the copied link and join. Reload.                                                                                |
| Owner        | `e2e-provider@kidease.test`     | Open `/provider?desk=documents`, `desk=calendar`, and `desk=listings`. Switch between the two synthetic centres. Add `&centre=unavailable-test` to test recovery. |
| Staff        | `e2e-qa-staff@kidease.test`     | Open `/provider?desk=screening`: confirms the owner-only notice. Compare with the owner account.                                                                  |

Repeat in French with the `/fr` route prefix. Do not test real uploads,
notifications, customer messaging, Stripe or Admin in this launcher. The public
site and currently installed store apps still point to production.

Included original PRs #1049 Share Family, #1050 Documents, #1051 Calendar,
#1052 Listings and #1053 Screening protection (only the Screening slice of N-02).
This QA branch deliberately skips Vercel builds and must not merge to main as a
bundle.
