# Local Lighthouse measurements

`scripts/polish-lighthouse.mjs` captures the core public routes and the desk
entry points from the shared `scripts/polish-coverage.mjs` manifest. It creates
JSON and HTML Lighthouse reports, a per-navigation script-size breakdown, and
`summary.json` with exact samples and medians. Failed, redirected, pending, and
gated surfaces remain visible in that summary.

Install audit tooling outside the application checkout so the production
dependency graph and lockfile stay unchanged:

```sh
npm install --prefix ../audit-tools lighthouse@13.6.0
```

Build the reviewed application source with `npx vite build`; the repository's
`npm run build` also runs database migrations and is unsuitable for this
isolated measurement workflow. Start its production preview with a cleared
environment, no database URL, local PGLite artifacts staged, and
`E2E_ROLE_FIXTURE=1`. Preserve the existing app subscription flags; do not copy
the existing e2e script's subscription overrides. Use separate preview
processes for layout checks and timing. The operator must verify that the
server uses local PGLite before passing `--local-fixtures`.

```sh
node scripts/polish-lighthouse.mjs \
  --base http://127.0.0.1:8082 \
  --out ../evidence/before/lighthouse \
  --source-sha 75cf0cd3cc1dc993b6eb920fe17139306f00cb80 \
  --listing provincial-employee-day-care-portage-1255 \
  --runs 3 --local-fixtures
```

Use the exact commit that produced the build for `--source-sha`. `--pages`
accepts a comma-separated subset of `home,search,listing,login,parent,daycare,org,staff,admin,government`;
`--locales en` or `--locales fr` narrows language coverage. `--runs 1` produces
a single exploratory sample, with that count recorded; it does not establish
a stable median. `--run-offset 1 --runs 2` labels additional captures as samples
2 and 3; use a separate output directory to preserve the first full-matrix
summary. `--server-state` records an explicit operator description of cold or
warm server state. Every browser profile is cold even when the server process
has already served requests. The summary also records observed document body
bytes and server response time. New captures record SSR listing article counts
when the document artifact is available, plus listing counts and slugs from the
independent readiness probe. `CHROME_PATH` can identify another local Chrome executable.
`POLISH_AUDIT_TOOLS` can identify another directory containing the pinned
tool installation. The default executable is the macOS Google Chrome app.

Each navigation starts a fresh Chrome profile and uses Lighthouse simulated
Slow 4G: 150 ms RTT, 1638.4 Kbit/s throughput, 4× CPU slowdown, a 412×823 CSS
pixel mobile viewport, and device pixel ratio 1.75. The JSON records all
simulation parameters and the browser user agent. This is a desktop lab
simulation, not a physical mid-range phone or a field measurement. Keep other
CPU-intensive browser/build jobs stopped while collecting comparative samples.

The evidence produced for this change used dedicated preview servers and
separate local databases, but layout workers and Node checks ran concurrently
on the same shared Mac during timing collection. Those recorded results are
exploratory simulated lab readings under host contention, not a causally
isolated benchmark. The observed English search regression remains in the
report; unchanged search query logic cannot establish its cause without an
isolated rerun. No rerun was used to replace the captured values.

The runner blocks external browser traffic through a dead local proxy and an
interception guard. It blocks `/api/health` by path and in Lighthouse's request
settings. It never navigates to that endpoint or invokes checkout, messaging,
or account-management actions. Public external media and map services therefore
remain unavailable during this controlled local check; production performance
may differ.

For authenticated routes, the runner uses the repository's loopback-only
synthetic fixture endpoint and verifies that the fixture establishes a session.
An independent same-session page navigation after Lighthouse checks settled
headings and redirects. Parent readiness additionally requires the saved
section inside a settled parent home; daycare readiness requires the settled
daycare home; admin readiness requires the queue filters with the queue loader
gone. The runner also exports Lighthouse's actual final screenshot for visual
inspection, since a later readiness probe alone cannot prove what the timing
sample rendered. These compressed Lighthouse images supplement the full-width
Playwright screenshots. The readiness probe does not alter the already
captured timing. Organization and staff entry points only have a provider
fixture; their timing is retained as a gated-surface measurement and is not
counted as a verified organization or staff desk home. Feature and access gates
continue to apply. A blocked page is never treated as successful coverage.
The existing French admin entry point is `/admin?lang=fr`, and its main content
currently remains English; the summary records that localization limit.

The JavaScript figure is the sum of gzip level-9 sizes of unique same-origin
script bodies actually requested during that Lighthouse navigation. It is
reproducible from the individual asset paths and sizes in `*-scripts.json`.
It excludes inline document scripts and is separate from the preview server's
actual transfer encoding. Treat it as a lower bound when assessing the total
first-page JavaScript budget.

Lighthouse navigation reports TBT. TBT is not INP. This workflow leaves INP
unavailable; representative field INP requires real-user interactions and
field data. LCP, CLS, and JavaScript budgets must also be reported as failed
when the measured values exceed their targets.

If timing capture completed but report postprocessing was interrupted, rerun
the same command with `--recover-reports`. This reads each existing unaltered
Lighthouse JSON, rechecks the intended local surface, and recomputes script
body gzip sizes without collecting a new timing sample. The summary records
that recovery. It does not repair a failed Lighthouse navigation or fabricate
a missing sample.

After the full matrices and the two additional core replicates are available,
generate a comparison without collecting new data:

```sh
node scripts/polish-compare.mjs ../evidence
```

This writes `comparison.json` and `comparison.md` with exact values, medians,
ranges, raw sample links, gated surfaces, provider script comparisons, and
document/content checks. Its completion flag applies only to the expected
available timing samples; it does not certify full route coverage or target
compliance. An interrupted run remains visibly incomplete.
