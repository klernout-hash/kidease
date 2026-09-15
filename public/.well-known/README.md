# Universal / App Links (placeholders until store enroll)

These files must stay **HTTP 200** `application/json`. Do not invent a Team ID or Play SHA.

| File | TODO after Kyle has accounts |
| --- | --- |
| `apple-app-site-association` (+ `.json` alias + site-root `/apple-app-site-association`) | **TODO:** set `APPLE_TEAM_ID` on Vercel (10 chars from Apple Membership). Placeholder in git is `XXXXXXXXXX`. Paths cover `/daycare/*`, `/search`, `/get-app`, `/login`, `/help`, `/privacy`, `/terms`, `/delete-account`, `/fr/*`, and `/*`. |
| `assetlinks.json` | **TODO:** set `ANDROID_CERT_SHA256S` on Vercel (Play App Signing SHA-256, colon hex). `sha256_cert_fingerprints` stays `[]` until then. Package is already `ca.daycarenearme.app`. |

Builders: `scripts/well-known-app-links.mjs`. Docs: `docs/STORE-LAUNCH.md`, `docs/store-readiness.md`.
