# Universal / App Links (placeholders until store enroll)

These files must stay **HTTP 200** `application/json`. Do not invent a Team ID or Play SHA.

| File | Swap later |
| --- | --- |
| `apple-app-site-association` (+ `.json` alias + site-root `/apple-app-site-association`) | Set `APPLE_TEAM_ID` on Vercel (10 chars). Placeholder is `XXXXXXXXXX`. |
| `assetlinks.json` | Set `ANDROID_CERT_SHA256S` on Vercel (colon hex). Array stays empty until then. |

Builders: `scripts/well-known-app-links.mjs`. Docs: `docs/store-readiness.md`.
