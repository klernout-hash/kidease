# Browser smoke (e2e)

Minimal Playwright checks that run without Stripe live keys, Twilio/Resend OTPs, or Cloudflare Access credentials.

## What is covered

| Check | Expected |
| --- | --- |
| Homepage `/` | HTTP ok (not 4xx/5xx), KidEase identity (`Find licensed daycare near you` or title) |
| Login `/login` | Email field and **Sign in** copy. The suite does not submit the form. |
| `/admin` | Guest gate: client redirect to `/login`, or Access-ish 302 to `https://www.kidease.ca/admin` on `*.vercel.app` hosts. A Cloudflare Access interstitial is also accepted. |
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

The `e2e` job in `.github/workflows/ci.yml` installs Chromium, then either:

- `npm run build && npm run e2e:preview` (push / pull_request / dispatch without `base_url`), or
- `BASE_URL=… npm run e2e` when `workflow_dispatch` provides a long-lived URL.

Unit tests (`npm test`) stay in the `check` job and do not launch a browser.
