# Browser smoke (e2e)

Minimal Playwright checks that run without Stripe live keys, Twilio/Resend OTPs, or Cloudflare Access credentials.

## What is covered

| Check | Expected |
| --- | --- |
| Homepage `/` | HTTP ok (not 4xx/5xx), KidEase identity (`Find licensed daycare near you` or title) |
| `/api/health` | Guest `200` JSON `{ ok: true, service: "kidease" }`. No Better Stack keys required. |
| Login `/login` | Email field and **Sign in** copy. The suite does not submit the form. |
| `/admin` | Guest and non-admin: plain 404 (`Page not found`), not a sign-in page and not a 403. `*.vercel.app` still 302s to `https://www.kidease.ca/admin`. A Cloudflare Access interstitial is accepted at the edge. Role checks use the loopback cookie `kidease_e2e_role` only when preview sets `E2E_ROLE_FIXTURE=1`. |
| `/parent` | Guest gate: client redirect to `/login` (or Sign in). The signed-in parent desk must not render. |
| `/provider` | Guest landing with **Sign in to the centre desk** — not the tours / money write desk. |
| `/api/admin/sentry-test`, `/api/admin/stripe-catalog` | Guest fetch is 401/403, login/Access redirect, or `{ ok: false }`. A 200 admin JSON payload fails the suite. |

The suite never opens `/pay/*`, never fills a password or OTP, and never calls Stripe Checkout.

## Local (preferred)

Preview port is **8081** (`vite.config.ts`). Dev server stays on **8080**.

`vite preview` serves the Nitro **vercel** build. That bundle cannot boot the in-memory PGLite file. `npm run e2e:preview` sets `VERCEL=1` (same SQL backend as a Vercel deploy without `DATABASE_URL`) so catalogue pages still render. Set a real `DATABASE_URL` if you need Neon instead.

```bash
npx playwright install chromium   # once per machine
npm run build                     # migrate no-ops without DATABASE_URL
npm run e2e:preview               # starts `vite preview` with VERCEL=1, then smokes it
```

Or point at an already-running preview:

```bash
npm run preview                   # http://127.0.0.1:8081
BASE_URL=http://127.0.0.1:8081 npm run e2e
```

`npm run e2e` with no `BASE_URL` and without `--start-preview` **skips** (exit 0) so a missing preview URL is not a red X.

## Existing screenshot smoke

`scripts/browser-smoke.mjs` still takes desktop + mobile screenshots and a verdict JSON. Output may be under the repo (`artifacts/`), `/tmp`, or `/workspace`.

```bash
npm run e2e:browser-smoke
# or, after preview is up:
npm run e2e:preview -- --browser-smoke
```

## Long-lived preview URL

If CI cannot boot `vite preview` and you only have a deployed preview:

1. Actions → **CI** → **Run workflow** (`workflow_dispatch`).
2. Set **base_url** to the preview origin (`https://…vercel.app` or similar).
3. The job sets `BROWSER_ALLOW_EXTERNAL_HOST=1` and skips the local build+preview.

Locally:

```bash
BASE_URL=https://your-preview.example BROWSER_ALLOW_EXTERNAL_HOST=1 npm run e2e
```

`/admin` on `*.vercel.app` 302s to `www.kidease.ca` so Cloudflare Access can apply. The smoke treats that redirect (or a Cloudflare Access page) as a pass. It does not log in.

## npm scripts

| Script | Purpose |
| --- | --- |
| `npm run e2e` | Smoke `BASE_URL`, or skip if unset |
| `npm run e2e:preview` | `vite preview` on :8081, then smoke |
| `npm run e2e:browser-smoke` | Screenshot / verdict helper |

## CI

The workflow cancels superseded PR/branch runs (`concurrency`). A cancelled or first-push red `check` job is **pipeline noise**, not production CFR — see `docs/uptime.md`.

Pushes and pull requests that only touch `docs/**` or `**/*.md` do not start this workflow.

The `build` job runs `npm run build` once and uploads `artifacts/ci-build`. This app is Vite + Nitro, not Next.js. The archive includes `.vercel/output` and `node_modules/.nitro/last-build.json`, which `vite preview` needs. Smoke jobs restore that after `npm ci` (`npm ci` would otherwise delete the Nitro pointer). A later run with the same source hash restores the archive from the Actions cache and skips the build.

Smoke is six shards (`--shard 1/6` … `6/6`):

| Shard | What it runs |
| --- | --- |
| 1/6 | Public pages, health, login, search, guest gates |
| 2/6 | Role fixture (parent and daycare seed) |
| 3/6 | WebKit search guard, iPad sizes |
| 4/6 | Phone sizes |
| 5/6 | Fold resize |
| 6/6 | Store sizes (Google, Samsung, Huawei, Microsoft run in parallel contexts) |

`e2e` is the check branch protection already requires. It passes when every shard passes. Desktop screenshots are a separate job so a picture mismatch can be reported without hiding a real smoke failure. A pixel mismatch is a warning on pull requests and main alike; refresh `e2e/desktop-baselines/` from the `desktop-visual-report` artifact (`desktop-actual/`) when a UI change is intended.

### Desktop visual

The screenshot job runs on `ubuntu-latest` (the same kind of runner the baselines were made on). It installs Chromium only. WebKit is not installed there.

Shard 3 still needs WebKit. `runWebkitSearchGuard` in `scripts/e2e-smoke.mjs` launches it. Those jobs use `mcr.microsoft.com/playwright:v1.62.1-jammy`, which already contains Chromium and WebKit, so CI does not `apt-get` WebKit. Bump that image tag when the Playwright version in `package-lock.json` changes.

`/search` and `/daycares` wait for the network to go idle and for Plus Jakarta Sans, including French letters (`é`, `à`, `ê`), then mask the moving parts. Home and French home still wait for that font inside the same three-second window as before. Other pages keep the old timing, so a lazy photo that the baseline shot as a placeholder is not forced to finish. CI also installs Liberation Sans, Noto, and Noto Color Emoji so a missing web font falls back to the same files every run.

`/search` and `/daycares` mask the listing count, the result list (photos and cards), and the map. Those pixels follow the catalogue. Their limit is **1%** (`0.01`). Every other page stays at **0.4%** (`0.004`). Do not raise the 0.4% limit to make a page pass.

On a pull request, a desktop visual miss is a warning. The `e2e` check stays green. On a push to `main`, the same miss fails `e2e`.

The job uploads `desktop-report.json`, red diff images, and the French home shots. Replace a baseline only when that report shows a real, stable difference, and only for the files you looked at. Do not replace the whole folder.

### Retries and quarantine

Seed requests (`POST /api/e2e-seed`) retry up to **2** times when the error is a dropped connection (`ECONNRESET`, `ECONNREFUSED`, `socket hang up`, and the same class). A 4xx or a wrong page is not retried.

On CI, a shard that fails runs **once more** (Playwright `retries: 1`; this suite uses the Playwright library, not `@playwright/test`). If the second run passes, the log says `FLAKY` and the job is green. The names are in the step summary and in `verdict.json`.

`e2e/quarantine.json` lists check names that still run but do not fail the job:

```json
{ "checks": [] }
```

Add a name only for a known break, and delete it once two CI runs are green. Do not put `desktop-visual` in that list. An empty `checks` array is the normal state.

`npm run e2e:preview -- --shard 2/4` runs one bucket against a local preview. `--desktop-visual-only` runs the screenshot pass. Without either flag, a local run still does the full suite, including screenshots.

Unit tests (`npm test`) stay in the `check` job and do not launch a browser.
