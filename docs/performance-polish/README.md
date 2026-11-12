# Local performance and layout evidence

The audit starts from the verified default-branch commit recorded in each report. It does not contact production, change application flags, call `/api/health`, submit product forms, or authenticate to a real account. Browser HTTP requests outside the specified loopback origin are blocked, including analytics, maps, and remote images. This makes the run safe and reproducible, but does not measure those external services.

Run the production build with a disposable local database and without production environment variables. Do not use `npm run build` for a measurement-only build: its final step runs database migrations. Use `npx vite build`, then the repository bundle checks explicitly. The existing `e2e --start-preview` runner enables subscriptions and probes health, so its default environment is unsuitable for this evidence run.

## Layout audit

```sh
node scripts/polish-layout.mjs --base http://127.0.0.1:8081 --phase before --mode quick --pages home,search,login
node scripts/polish-layout.mjs --base http://127.0.0.1:8081 --phase before --mode screenshots --pages home,search,listing,login --slug VERIFIED-LOCAL-SLUG
node scripts/polish-layout.mjs --base http://127.0.0.1:8081 --phase after --mode matrix --pages all --slug VERIFIED-LOCAL-SLUG
```

`quick` checks 390 and 1280 pixels. `screenshots` saves full-page images at 360, 390, 768, 1280 and 1440 pixels, plus classic/clean and light/dark at 390/1280. `matrix` tests 320, 360, 375, 390, 414, 768, 1024, 1280, 1440 and 1920 widths in both orientations, at the largest application text setting, and at a half CSS viewport width to approximate the reflow from 200% browser zoom. `all` combines the matrix and screenshots. This reflow approximation is clearly labeled; a physical phone and browser UI zoom still require manual validation. EN and FR are both default. Use `--locales en` to narrow a debugging run.

Pass `--revision FULL_VERIFIED_SHA` to identify the source served by the local preview, especially when the audit script checkout differs from the served snapshot. The report keeps this separate from the harness checkout revision. `--workers 3` allows three independent browser contexts at once for layout checks; the default is one. This concurrency is unsuitable for performance timing measurements. Local fixture sessions refresh once per selected desk page, then each profile receives an independent context with a copy of that disposable session.

`--reuse prior-layout.json` preserves completed cases from a prior run only when its verified source revision, phase and local server origin match. Each preserved row links to the original report and retains its original scroll coverage. This lets a bounded screenshot pass keep already completed full-scroll checks while labeling remaining checks as first-viewport-only. Copy the corresponding existing PNGs into the new output directory when resuming into a different directory. An interrupted or still-running case is rerun; completed failures remain failures.

The page inventory is exported from `scripts/polish-coverage.mjs`. It combines representative pages and desk homes with every literal canonical static sitemap path, including province guides. `--pages core`, `--pages public`, `--pages all` or comma-separated page IDs select coverage. Dynamic listing evidence requires a verified local catalog slug; a missing slug remains blocked. Generated city/listing URLs and tokenized flows have representative coverage only. Each unselected page remains `not-run` in the report. The status page is explicitly blocked because its server loader invokes the same health collector excluded from this task; no status request is sent.

Each report records the revision, profile, requested/final path, status, runtime errors, request blocks, screenshot, audit findings and observed exceptions. A failed, redirected, unavailable or skipped page is never counted as passed. Exit status is nonzero for failures or selected blocked pages. Reports are written after each case, so interrupted runs preserve completed evidence.

Run `node scripts/polish-summarize.mjs artifacts/performance-polish` to create a machine-readable summary. It keeps runs and readiness limitations separate, excludes initial/exploratory directories, and labels geometric collisions as candidates requiring review. Use individual report rows, rather than adding overlapping run counts, to establish unique page/profile coverage.

Checks cover document and element horizontal overflow, under-44-pixel touch targets, overlapping or nested interactive elements, clipped text and missing image alt text. Pages are scrolled in overlapping viewport samples. Controls outside a horizontal scroll rail's visible area are not treated as visible, while the rail exception is recorded. Large associated checkbox labels are recorded as effective touch targets. Ellipsis is recorded as an exception only when full text is available through `aria-label` or `title`; an inaccessible clipped label fails. Overlap checks report geometric collisions for review; overlays can require human interpretation. These are layout checks, not a complete WCAG audit or contrast/focus certification.

The revised overlap collector clips each control's client rectangles to all ancestor scroll/clip regions, then checks actual pointer-hit stacks in shared areas. It permits a Save/image overlay only when both controls share the same card photo region and remain independently reachable. A password toggle must identify its input and fit entirely within reserved input padding. Fixed navigation may obscure ordinary scrolling content only when document scrolling can reveal the whole target; two fixed controls or a cookie action covering Save receive no blanket exemption. A zero-hit target and an action completely clipped by a non-scrollable ancestor fail separately. Active modal scope is explicitly recorded.

`scripts/polish-readiness.mjs` requires two stable content-state observations. Search must show actual listing slugs or an explicit settled empty/error surface with no result/count loading state. An `h1` is insufficient. Settled error geometry can be recorded, but it is never counted as healthy result-data coverage. Both screenshot and resize runners use this contract; screenshot state is checked again before capture, and old search evidence using the heading-only contract is not reused as certified loaded coverage. Original reports remain unchanged when validity corrections are issued.

Run the behavioral collector fixtures separately from the unit suite:

```sh
POLISH_BROWSER_TESTS=1 node --test scripts/polish-layout.behavior.test.mjs
```

These tests use static HTML with all HTTP/WebSocket requests blocked. They assert real click destinations and native label/toggle behavior as well as observed overlap, clipping and loading states. They are explicitly skipped in the general unit suite unless opted in, because that job need not have a browser installed; a skipped browser fixture is not a passed browser check.

## Authenticated local fixtures

Only after independently verifying that the loopback server uses a disposable PGLite database, opt in to local seed sessions:

```sh
POLISH_FIXTURE_DATABASE=local-pglite node scripts/polish-layout.mjs --base http://127.0.0.1:8081 --phase before --mode quick --pages parent,daycare,org,staff,admin,government --fixtures local-pglite
```

The server must run with its existing `E2E_ROLE_FIXTURE=1` local gate. The harness POSTs only to the existing `/api/e2e-seed` fixture endpoint. It never enables application subscriptions or changes Stripe configuration. Parent, daycare, admin and government use local fixture roles. Organization and staff are provider desk panes (`?desk=sites` and `?desk=staff`); their existing feature flags and membership gates remain in force. A gated or empty fixture is evidence of that state, not proof that populated feature content passed.

Pass `--chrome /absolute/path/to/chrome` only if bundled Playwright Chromium is unavailable. `--scroll top` is useful during debugging and explicitly records that only the first viewport was checked.

## Resize matrix

```sh
POLISH_FIXTURE_DATABASE=local-pglite node scripts/polish-resize-matrix.mjs --base http://127.0.0.1:8084 --revision FULL_VERIFIED_SHA --canonical artifacts/performance-polish/after/after-layout.json --out artifacts/performance-polish/after-resize-matrix --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

The resize runner groups profiles by page, locale, appearance and text setting. It loads one page for a cohort, changes the viewport, waits for content readiness, and audits the first viewport. It mirrors the application's existing text-scale CSS setting in the disposable page DOM so a saved fixture preference cannot override the requested test size. It reuses completed matching canonical appearance cases with their original outcomes and provenance. Ten selected surfaces produce 920 requested profile cases, including unavailable/gated coverage decisions; the report separately identifies actual resize checks, reused evidence and cohorts whose route was unavailable. These checks measure responsive layout after resize; they do not measure fresh navigation performance or certify full-document scrolling for every profile.

Cold-navigation and full-scroll attempts remain in separately named partial reports. Their interrupted or browser-closed cases are retained as original attempts; they are not converted into passes. The resize report is the final geometry report, while the canonical screenshot reports remain the before/after visual comparison.

## Performance interpretation

Lighthouse and browser timing results are laboratory measurements using simulated conditions. TBT is not INP. A synthetic interaction sample is not field INP, and no successful field INP claim can be made from this run. A local-only run with external resources blocked is not a measurement of production R2, map tiles, third-party scripts, CDN cache behavior or a physical 4G device. Preserve exact metric outputs, network settings, request blocks and baseline failures with the report.
