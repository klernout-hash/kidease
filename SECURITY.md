# Security

Please report vulnerabilities privately to [kyle@kidease.ca](mailto:kyle@kidease.ca). Do not open a public GitHub issue for security reports.

## Production notes

- QA ghost listing (`/daycare/test-ghost-claim-lab` and `/book/test-ghost-claim-lab`) must **404** for public document GETs. Robots `Disallow` alone is not enough. Admin claim/search still works from `/admin` and `/claim`.
- Production HTML must not include `https://grok.com/grok-app-builder/extensions.js` (Grok App Builder editor chrome). That host is not on the CSP allowlist.

## CSP follow-up (partial)

First-party channel boot is now `/channel-boot.js` (`script-src 'self'`). `vercel.json` still allows `'unsafe-inline'` on `script-src` and `style-src`.

Do **not** drop `'unsafe-inline'` in this pass. Do **not** add a script hash or nonce to the static Vercel CSP while `'unsafe-inline'` remains — in CSP2 a hash/nonce *disables* `'unsafe-inline'`, which would break TanStack Start `<Scripts />` hydration, any remaining inline style, and production forms (login / Turnstile / claim / contact).

Do **not** add `grok.com` to the allowlist.

Remainder (needs a coordinated Nitro + TanStack change, not a `vercel.json` one-liner):

1. Per-request nonce in Nitro middleware (Vercel static headers cannot vary by request).
2. Pass that nonce into `__root.tsx` and TanStack `<Scripts />` if/when the adapter supports it.
3. Keep Maps (`maps.googleapis.com`), Stripe (`js.stripe.com`), Turnstile (`challenges.cloudflare.com`), and PostHog (`us.i.posthog.com`, `us-assets.i.posthog.com`) on the host allowlist.
4. Then drop `'unsafe-inline'` from `script-src`. `style-src` may still need `'unsafe-inline'` for React `style={{}}` / component libraries until `'unsafe-hashes'` or CSS-only is proven.
