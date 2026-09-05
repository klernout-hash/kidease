# Security

Please report vulnerabilities privately to [support@kidease.ca](mailto:support@kidease.ca). Do not open a public GitHub issue for security reports.

## Error monitoring (Sentry)

Production uses the official `@sentry/node` (SSR / API) and `@sentry/react` (browser) SDKs.

- `SENTRY_DSN` — server-only. Already set on Vercel Production. Never prefix `VITE_`.
- `VITE_PUBLIC_SENTRY_DSN` — the same DSN string, public, required for client errors. Set this on Vercel Production (and Preview if you want browser events there).

If neither is set, the app boots and skips ingest. Events drop cookies, `Authorization` headers, emails, tokens, and child-name fields. Common browser-extension errors are ignored.

Admin-only check: signed-in staff on `www.kidease.ca` can `GET /api/admin/sentry-test` (session + `profiles.role = admin` + same-site, same gate as other `/api/admin/*`) to send `KidEase Sentry test`.

Support desk (`/support*`) is staff-only (`profiles.role` = `admin`, `support`, or `support_lead`). It does **not** weaken `/admin*` admin-only tools. Public Help Centre is `/help`. Cloudflare Access can later include `/support*` (see `docs/support.md`).
## Production notes

- QA ghost listing (`/daycare/test-ghost-claim-lab` and `/book/test-ghost-claim-lab`) must **404** for public document GETs. Robots `Disallow` alone is not enough. Admin claim/search still works from `/admin` and `/claim`.
- Production HTML must not include `https://grok.com/grok-app-builder/extensions.js` (Grok App Builder editor chrome). That host is not on the CSP allowlist.

## CSP

Document HTML is stamped in Nitro (`server/middleware/csp.ts`) with a per-request nonce. `vercel.json` does **not** send `Content-Security-Policy` — a second static header cannot carry the nonce, and browsers enforce every CSP they receive.

`script-src` is `'self' 'nonce-…' 'strict-dynamic'` plus Maps / Stripe / Turnstile / PostHog hosts (fallback for browsers that ignore `strict-dynamic`). First-party `<script>` tags (including TanStack `<Scripts />` hydration) get the nonce after render. Maps, Stripe.js, Turnstile, and PostHog load further scripts with `createElement`, which `strict-dynamic` allows.

Do **not** add `grok.com` to the allowlist.

Leftover WARN: `style-src` keeps `'unsafe-inline'` for React `style={{}}` and injected `<style>` from Radix / Sonner. Dropping it needs `'unsafe-hashes'` or a CSS-only pass — not this PR.
