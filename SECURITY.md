# Security

Please report vulnerabilities privately to [kyle@kidease.ca](mailto:kyle@kidease.ca). Do not open a public GitHub issue for security reports.

## Production notes

- QA ghost listing (`/daycare/test-ghost-claim-lab` and `/book/test-ghost-claim-lab`) must **404** for public document GETs. Robots `Disallow` alone is not enough. Admin claim/search still works from `/admin` and `/claim`.
- Production HTML must not include `https://grok.com/grok-app-builder/extensions.js` (Grok App Builder editor chrome). That host is not on the CSP allowlist.

## CSP follow-up (not this change)

`vercel.json` still allows `'unsafe-inline'` on `script-src` and `style-src` because a nonce/hash migration would break Maps, Stripe, Turnstile, PostHog, and the auth/channel boot inline script unless every injector is moved together. Do **not** drop `'unsafe-inline'` or add `grok.com` to the allowlist as a shortcut. Next pass: nonce (or hashes) for first-party inline script/style, keep the existing Maps / Stripe / Turnstile / PostHog host allowlist.
