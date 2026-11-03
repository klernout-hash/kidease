# Amazon features (Amazon Appstore build only)

All four flags default **off**. No Amazon IAP and no ads. Only the Amazon Appstore build on Amazon hardware is affected (see docs/store-flavors.md).

| Flag | What | Needs |
| --- | --- | --- |
| `FEATURE_AMAZON_ADM` | Amazon Device Messaging push next to FCM / APNs | `FEATURE_PUSH`, `ADM_CLIENT_ID`, `ADM_CLIENT_SECRET`, `android/app/src/amazon/assets/api_key.txt` (ADM API key, not committed) |
| `FEATURE_LOGIN_AMAZON` | Login with Amazon button. Order: Apple, then Google (hidden), then Facebook, then Amazon | `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET` (LWA security profile). Return URL `/api/auth/callback/amazon` |
| `FEATURE_FIRE_KIOSK` | `/kiosk`: landscape check-in/out desk, big buttons, back navigation locked, staff PIN to exit (stored only as a SHA-256 hash on the device) | `FEATURE_CHILD_CHECKIN` |
| `FEATURE_ALEXA_SKILL` | `/api/alexa` custom skill. Intents: find spots (by city), today's day log (linked parent, count only, no child names), new daycare messages (linked staff) | `ALEXA_SKILL_ID`; interaction model in `alexa/skill-package/` |

## ADM flow

The shell plugin `KidEaseAdm` (amazon flavour only) is registered. It returns a registration id, and the client posts it with `provider: "adm"`. The server stores the token only when `admRegistrationAllowed` (flag + Amazon build + Amazon device UA). `push-send.ts` gets an LWA client-credentials token (`messaging:push`) and posts to `api.amazon.com/messaging/registrations/{id}/messages`. A 410 or an invalid registration id prunes the token. Migration `0168` allows `adm` in `push_device_tokens.provider`.

## Alexa request verification

Every request is checked for:

- The cert URL is https on `s3.amazonaws.com:443`, with a path under `/echo.api/`.
- The cert chain is valid now, and its SAN includes `echo-api.amazon.com`.
- The `Signature-256` header is RSA-SHA256 over the raw body.
- The timestamp is within 150 s.
- The `applicationId` equals `ALEXA_SKILL_ID`.

Account linking reuses a KidEase session token as the access token (scaffold; swap in a proper OAuth server before certification).
