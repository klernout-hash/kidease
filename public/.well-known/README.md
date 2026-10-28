# Universal / App Links

These files must stay **HTTP 200** `application/json`. Do not invent a Play SHA.

| File | Store values |
| --- | --- |
| `apple-app-site-association` (+ `.json` alias + site-root `/apple-app-site-association`) | Team ID `GAUC28WJXZ` (10037493 MANITOBA LTD.). Set `APPLE_TEAM_ID` on Vercel to the same 10 characters. Enrolment id B7UM5AC9JQ is not the Team ID. Paths cover `/daycare/*`, `/search`, `/get-app`, `/login`, `/help`, `/privacy`, `/terms`, `/delete-account`, `/fr/*`, and `/*`. |
| `assetlinks.json` | Play App Signing and upload SHA-256 for `ca.kidease.app` are in `sha256_cert_fingerprints`. Relation stays `delegate_permission/common.handle_all_urls`. Set `ANDROID_CERT_SHA256S` on Vercel only to replace that list. |

Builders: `scripts/well-known-app-links.mjs`. Docs: `docs/STORE-LAUNCH.md`, `docs/store-readiness.md`.
