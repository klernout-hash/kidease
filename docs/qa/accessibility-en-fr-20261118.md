# Help dialog and public-form accessibility — 18 Nov 2026

Base: `d39f980bd1e20804d02b310e34879f125caba178` (PR #942).
Branch: `fix/a11y-en-fr-nov18`. Worktree: `2026-11-18/task-5/kidease-a11y-en-fr`.
Read `AGENTS.md`; this checkout has no `.agents/skills` directory or nested instructions.

## Reproduced before changes

- Opening Help by keyboard left focus on the launcher. Tab moved into the cookie banner,
  and Escape left Help open. With the default feature flag off, the panel had no dialog role.
- `/fr/contact` displayed an English required-security-check error. Expired security-check
  text appeared without alert semantics. The same hard-coded required text also existed
  in Help and job-interest forms; the shared server-error mapper always returned English.

Before screenshots: `artifacts/a11y/help-before-{390,1280}.png` and
`artifacts/a11y-en-fr/contact-fr-before-390.png`.

## Changes

- The existing lazy launcher owns one Radix modal, with a stable title, close control,
  and translated loading status outside the lazy chat body. Keyboard focus starts on Close;
  Tab stays within the dialog; Escape, Close, and the backdrop restore launcher focus.
- Full-location changes reset the dialog, including browser Back and navigation while the
  chat import is pending. No stale import reopens a dismissed panel.
- The dialog explicitly sets modal semantics and its content layer. Real browser checks
  caught the shared unlayered dialog CSS overriding its Tailwind z-index; a scoped inline
  layer keeps content above the backdrop without changing other dialogs.
- Transcript updates use a named polite log and scroll only their own scroller. The panel
  and composer wrap/scroll at narrow widths and large text sizes. The unused duplicate
  launcher in `help-bot.tsx` was removed; its static tests now inspect the actual shell.
- Contact, Help, Report, and job-interest forms pass existing translated security-check
  recovery text through the shared mapper. Turnstile asynchronous failures use an alert.

`FEATURE_A11Y_PASS` and all other flag defaults remain unchanged. Help's baseline modal
behavior is independent of the flag-gated skip link and language-change announcement.
No libraries were added.

## Final verification

This section retains the original worker's results at `16bae5fe`. It is historical
evidence, not the local test allowlist for the integrated staging tree. Use the strict
isolated commands below for current validation.

- `node scripts/desk-nonpayment-checks.mjs typecheck` — passed on final source.
- `node scripts/desk-nonpayment-checks.mjs lint` — passed, 0 errors / 141 warnings.
  Final scoped ESLint also passed, with only the existing Turnstile Fast Refresh warning.
- `node scripts/desk-nonpayment-checks.mjs build` — passed on final source. ESM checks
  linked 71 server modules; locale chunks remained lazy; 856 client files passed the
  database-code check. Source-map upload and the remote migration ledger check skipped
  because their credentials / database URL were absent.
- The original worker reported **56/56 unit tests passed** across eight existing files.
  Five of those files eagerly import pricing, subscription or refund-policy modules;
  they are excluded from the current strict local allowlist even though their assertions
  concern Help, accessibility or copy. The previously listed ninth file,
  `scripts/turnstile-widget.test.mjs`, does not exist in committed `16bae5fe`; that command
  typo is corrected here. These historical 56 results are not relabeled as a current
  strictly nonfinancial run.

- `node scripts/public-form-a11y.browser.mjs` — four synthetic EN/FR × 390/1280 cases
  passed: required errors, expired/error/timeout callbacks, alert clearing, rejected local
  submit stubs, repeated widget lifecycle, and 200% text load-failure alerts. Zero network
  mutations and no page errors or horizontal overflow. This uses actual Contact and
  Turnstile components with service edges stubbed; no real challenge or message service.
- The worker's prior full-preview Help harness reported **10/10 passed** against its
  production build, with no diagnostic overrides. The current script instead owns an
  isolated fixture and does not accept an application-preview URL:
  EN/FR × 390/1280, EN/FR at 320px/200% text, and four fresh-context interrupted-import
  cases. Covered initial focus, Tab/Shift+Tab wrapping, outside focus containment,
  Escape/button/backdrop dismissal, three reopen cycles, translated busy/failure log,
  page-scroll preservation, route navigation, and browser Back while the modal is open.
  All 39 POST attempts were aborted before reaching the server; zero external requests
  were observed. The attempts were startup flag reads and deliberately blocked synthetic
  helper questions. Zero uncaught browser errors.
- Existing `scripts/browser-smoke.mjs` — EN/FR `/help`, 390/1280, passed on final build:
  HTTP 200, no console/page errors, no horizontal overflow. A local wrapper blocked
  external requests and business writes while allowing the code-verified local
  `readAiFeatureFlags` POST. With no PostHog key, that read returns defaults locally.
  An earlier fully POST-blocked smoke reported a transport error for that startup read;
  no production service was contacted. An initial copy-language unit run also included
  one wallet-wording assertion; no payment flow or payment service was exercised, and
  that suite was omitted from the final explicit test list above.
- `git diff --check` — passed. Generated route-tree ordering drift was excluded.

All checks used a clean environment and synthetic data. The preview used an empty
`DATABASE_URL` with `VERCEL=1`. No production database, real messages, payment flows,
push, merge, or deployment. The aggregate test / e2e runners were deliberately avoided
because they include financial fixtures or Stripe-related smoke paths.

## Evidence and integration

Final evidence is local and ignored by Git:

- `artifacts/a11y-en-fr/help-final/verdict.json` and its EN/FR 390/1280 screenshots.
- `artifacts/a11y-en-fr/help-final/help-fr-320-text200{,-top}.png`.
- `artifacts/a11y-en-fr/public-form/results.json` and `contact-{en,fr}-{390,1280}.png`.
- `artifacts/a11y-en-fr/browser-smoke-{en,fr}.json` and desktop/mobile PNGs.

Visually inspected final normal mobile/desktop, French large-text top and composer,
and French contact-error screenshots. At 200% text the dialog scrolls vertically;
all controls remain reachable without horizontal clipping.

No journey, child-profile, or privacy-lifecycle files were changed. No path overlaps
with journey commits `37238b95`, `751eff3e`, or `27330474`; no cherry-pick or integration
into another worktree was performed. Keep the stable shell and lazy body changes
together. Existing Radix Dialog dependency is required and already installed.

## Integrated strictly nonfinancial validation

The eligible unit files contain **34 tests**: Turnstile 15, native Google auth 9 and
boot-loop 10. A credential-cleared run with module/fetch denial passed all 34, with
zero failures or skips. Its log is `artifacts/a11y-adaptation/units.log`.

```sh
env -i PATH="$PATH" HOME="$HOME" CI=1 \
  node --experimental-strip-types \
  --import ./artifacts/a11y-adaptation/unit-guard.mjs --test \
  scripts/turnstile.test.mjs \
  scripts/native-google-auth.test.mjs \
  scripts/boot-loop.test.mjs
```

Do not add `help-bubble`, `help-launcher`, `a11y-pass`, `public-form-error` or
`site-guide` to that command: their runtime dependency closures reach financial policy.
Also exclude `public-copy-language.test.mjs`, which includes wallet wording assertions.
The unit preload is an ignored local module/fetch guard; it is not an OS socket sandbox.

The adapted browser harnesses use actual Help, Radix, Router, Contact and Turnstile
components. Only explicitly enumerated nonfinancial service/copy edges are isolated.
Selected EN/FR strings and the support email are read from TypeScript AST literals;
no copy runtime, pricing, refund module or financial mock is imported. The production
UI code remains unchanged. Both fixtures use CSS from the finished application build,
block external/API requests, reject unlisted direct or dynamic application imports,
and verify source/CSS hashes before publishing a passing verdict.

Preserve all **10 Help cases** and **4 public-form cases**. Their combined-tree browser
runs are pending review of the private process guard's exact installed compiler/Chrome
exceptions. The local private preload is an ignored audit artifact, not application
or deployment code. Once that guard is ready, run from the staging checkout:

```sh
env -i PATH="$PATH" HOME="$HOME" CI=1 \
  KIDEASE_OUTBOUND_GUARD_MODE=fixture \
  A11Y_CSS_FILE="$PWD/.vercel/output/static/assets/styles-DSYW2fcR.css" \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node --experimental-strip-types \
  --import ./artifacts/journey-integration/runtime-outbound-guard.mjs \
  scripts/help-dialog.browser.mjs artifacts/a11y-adaptation/help

env -i PATH="$PATH" HOME="$HOME" CI=1 \
  KIDEASE_OUTBOUND_GUARD_MODE=fixture \
  A11Y_CSS_FILE="$PWD/.vercel/output/static/assets/styles-DSYW2fcR.css" \
  CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node --experimental-strip-types \
  --import ./artifacts/journey-integration/runtime-outbound-guard.mjs \
  scripts/public-form-a11y.browser.mjs
```

The CSS filename above belongs to the observed `fd5975ad` local build; use the exact
finished CSS artifact of any later tested build. Browser fixtures prove component
behavior and real Router/lazy-import interaction, not full application startup,
server authorization, real message delivery, real Turnstile iframe traversal or an
OS-level network sandbox. Their service boundaries reject synthetic actions; none
returns a fabricated successful delivery.

## Remaining device checks

Chromium keyboard and DOM assertions do not verify spoken VoiceOver/TalkBack output,
native webview focus behavior, device text scaling, the software keyboard, or real
Turnstile iframe traversal. Android hardware Back handling is unchanged; these tests
verify browser Back on route transitions, not native modal-specific Back interception.
No claim of full WCAG or native screen-reader certification is made.
