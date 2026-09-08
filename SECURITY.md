# Security

Please report vulnerabilities privately to [support@kidease.ca](mailto:support@kidease.ca). Do not open a public GitHub issue for security reports.

## Error monitoring (Sentry)

Production uses the official `@sentry/node` (SSR / API) and `@sentry/react` (browser) SDKs.

- `SENTRY_DSN` — server-only. Already set on Vercel Production. Never prefix `VITE_`.
- `VITE_PUBLIC_SENTRY_DSN` — the same DSN string, public, required for client errors. Set this on Vercel Production (and Preview if you want browser events there).

If neither is set, the app boots and skips ingest. Events drop cookies, `Authorization` headers, emails, tokens, and child-name fields. Common browser-extension errors are ignored.

Admin-only check: signed-in staff on `www.kidease.ca` can `GET /api/admin/sentry-test` (session + `profiles.role = admin` + same-site, same gate as other `/api/admin/*`) to send `KidEase Sentry test`.

Support desk (`/support*`) is staff-only (`profiles.role` = `admin`, `support`, or `support_lead`). It does **not** weaken `/admin*` admin-only tools. Public Help Centre is `/help`. Cloudflare Access can later include `/support*` (see `docs/support.md`).

## Auth bootstrap

`requireAdmin` / `requireSupport` and `/api/admin/*` require a verified 2FA cookie (same device token as TwoFactorGate). A thrown status check fails closed for those desks.

`ADMIN_EMAIL` / `kyle@kidease.ca` is auto-promoted to `profiles.role = admin` only when Better Auth `user.emailVerified` is true. Remaining risk: if an identity provider marks that mailbox verified without a real mailbox check, the first such session still becomes admin. Extra staff should be promoted with SQL, not a second env flag.

## Payments

`/pay/$bookingId` (`createPayment` / `confirmInterac`) cannot mark a booking or payment `paid`. Card / wallet PAN fields are refused. Interac is `pending_review` until staff confirm. Live card charges stay on invoice Stripe Checkout and Parent Plus Checkout. Those Checkout sessions request `card` (Apple Pay / Google Pay ride on card) in CAD. Native Capacitor opens Checkout in the system browser so wallets can appear.

## Cron

`/api/digest`, `/api/search-alerts`, and `/api/seed-catalog` accept `Authorization: Bearer $CRON_SECRET` only (Vercel Cron sends this when `CRON_SECRET` is set). Query-string `?secret=` is rejected. `/api/seed-catalog` upserts a chunk of `centres.json` into Neon; it is not on the deploy build and is not a Vercel cron by default.

`/api/inngest` is the Inngest serve endpoint (TanStack Start + `inngest/edge`). Inngest Cloud signs requests with `INNGEST_SIGNING_KEY`. Do not put a query-string secret on that URL. The app boots when Inngest keys are unset — Cloud simply cannot sync until Kyle pastes them on Vercel kidease-git. See `docs/inngest.md`.

## Production notes

- QA ghost listing (`/daycare/test-ghost-claim-lab` and `/book/test-ghost-claim-lab`) must **404** for public document GETs. Robots `Disallow` alone is not enough. Admin claim/search still works from `/admin` and `/claim`.
- Production HTML must not include `https://grok.com/grok-app-builder/extensions.js` (Grok App Builder editor chrome). That host is not on the CSP allowlist.

## CSP

Document HTML is stamped in Nitro (`server/middleware/csp.ts`) with a per-request nonce. `vercel.json` does **not** send `Content-Security-Policy` — a second static header cannot carry the nonce, and browsers enforce every CSP they receive.

`script-src` is `'self' 'nonce-…' 'strict-dynamic'` plus Maps / Stripe / Turnstile / PostHog hosts (fallback for browsers that ignore `strict-dynamic`). First-party `<script>` tags (including TanStack `<Scripts />` hydration) get the nonce after render. Maps, Stripe.js, Turnstile, and PostHog load further scripts with `createElement`, which `strict-dynamic` allows.

`style-src` is `'self' 'nonce-…'` (no `'unsafe-inline'`). Document `<style>` tags are stamped after render. A nonce'd boot script (`data-ke-style-nonce` in the root `<head>`, also injected if a document lacks it) copies that nonce onto `document.createElement("style")` so Radix, Sonner, and Maps can inject styles at runtime.

`style-src-attr` keeps `'unsafe-inline'`. Required leftovers:

- BrandMark / help-bot logo pin (`maxWidth` inline) — `#72` / `#73` boot safety when CSS fails to load. Do not remove.
- Sonner `Toaster` `pointerEvents` (also asserted in boot-loop tests).
- Radix / Floating UI `style={{ top, left, transform }}` positioning.
- Dynamic meter widths (`listing-health`, `quality-issues`).
- Marketing mocks (`app-shots.tsx`) that still use `style={{}}` for static colors.

`img-src` keeps `'self' data: blob: https:` and also lists the production listing-photo host `https://media.kidease.ca` plus optional `https://*.r2.dev`. Optional Image Transformations stay on that same host (`/cdn-cgi/image/…/photos/…`). Do **not** add the private S3 API host `*.r2.cloudflarestorage.com`.

Do **not** add `grok.com` to the allowlist. Do **not** put `'unsafe-inline'` back on `script-src` or `style-src`.
