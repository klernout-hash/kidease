# Push scaffold (FCM + APNs)

KidEase push is for **transactional** vacancy and alert notifications later (spot opened, claim status, bill reminder). Not marketing blasts. Not OneSignal. Not Meta.

`FEATURE_PUSH` defaults **off**. Absent Vercel env = off. **www.kidease.ca does not register tokens and does not prompt** even after you flip the flag — only the Capacitor iOS / Android app does.

This PR stores device tokens and dry-runs. It does **not** send.

## Do not enable on www

Leave `FEATURE_PUSH` unset (or `0`) on Production until:

1. A Firebase project + APNs `.p8` exist (placeholders only in `.env.example`).
2. The next TestFlight / Play build includes `@capacitor/push-notifications` (`npx cap sync`).
3. You have confirmed a dry-run token count on Admin → Chat lab.

Do not set the flag “to see if it works” on the public site. Email and (when ready) SMS still notify without push.

## Vercel env checklist

Set the same keys on **Production and Preview** (encrypted). Never commit values. `FCM_*` and `APNS_*` are server-only — never prefix `VITE_` except the optional VAPID public key.

| Name | Required to send later | Notes |
| --- | --- | --- |
| `FEATURE_PUSH` | yes (`1`) | Leave `0` / unset until credentials + a TestFlight build exist. |
| `FCM_PROJECT_ID` | Android / FCM HTTP v1 | Firebase project id. |
| `FCM_CLIENT_EMAIL` | Android / FCM HTTP v1 | Service account email (`…@….iam.gserviceaccount.com`). |
| `FCM_PRIVATE_KEY` | Android / FCM HTTP v1 | PEM from the service account JSON. Paste the full key; keep `\n` escapes. |
| `APNS_KEY_ID` | iOS | 10-character Key ID from Apple Developer → Keys. |
| `APNS_TEAM_ID` | iOS | 10-character Team ID. |
| `APNS_BUNDLE_ID` | iOS | `ca.daycarenearme.app` (Capacitor `appId`). |
| `APNS_KEY` | iOS | Contents of the Auth Key `.p8` (-----BEGIN PRIVATE KEY----- …). |
| `VITE_FCM_VAPID_PUBLIC_KEY` | web push only | **Not used.** www stays off. Leave blank. |

There is no legacy “FCM server key” in this scaffold. Firebase Cloud Messaging HTTP v1 uses the service account trio above. If a Console still shows a server key, do not put it in git and do not add a new env name until a live sender is written.

Do **not** put `.p8` files, `sk_live_`, or service-account JSON in the repo.

## Firebase (Android + FCM) — later

1. Create a Firebase project (Google Cloud). Enable **Cloud Messaging**.
2. Add an Android app with package `ca.daycarenearme.app`. Download `google-services.json` into the Capacitor `android/` app module when you next run `npx cap sync` / Android Studio. That file is not in this PR.
3. Project settings → Service accounts → generate a new private key. Copy `project_id`, `client_email`, and `private_key` into the Vercel names above.
4. Do not enable Analytics / Crashlytics just to “turn push on.”

## Apple (.p8 + TestFlight entitlements) — later

1. Apple Developer → Certificates, Identifiers & Profiles → **Keys** → create a key with **Apple Push Notifications service (APNs)** enabled. Download the `.p8` once. Copy Key ID → `APNS_KEY_ID`, Team ID → `APNS_TEAM_ID`, file body → `APNS_KEY`.
2. Identifiers → `ca.daycarenearme.app` → enable **Push Notifications**.
3. Xcode / Capacitor iOS target:
   - Signing & Capabilities → **+ Push Notifications**.
   - **Background Modes** → Remote notifications.
   - Entitlements: `aps-environment` is `development` for debug, **`production` for TestFlight and App Store**. TestFlight uses the production APNs environment.
4. Rebuild (`npx cap sync ios`) so `@capacitor/push-notifications` is in the binary. A web-only Vercel deploy does not add the entitlement.
5. Confirm the provisioned profile includes Push. Archive → TestFlight. First launch after `FEATURE_PUSH=1` should prompt once and `POST /api/push/register`.

## Capacitor plugin

`@capacitor/push-notifications` is a dependency. `capacitor.config.ts` sets presentation options. Native projects (`ios/`, `android/`) are not committed here — run `npx cap add ios` / `android` then `npx cap sync` on a laptop when you cut a store build.

The web client dynamically imports the plugin only when:

- the session is signed in,
- `Capacitor.isNativePlatform()` is true,
- `getPushClientStatus()` says `FEATURE_PUSH` is on.

www never calls `Notification.requestPermission()`.

## What is wired

- `FEATURE_PUSH` / `pushEnabled()` — default off. Absent env = off.
- Migration `0027_push_device_tokens.sql` — `push_device_tokens` (user_id, token, platform ios|android, provider fcm|apns).
- `POST /api/push/register` — session required, same-site. Persists only when the flag is on. Rejects `web`.
- `registerPushToken` / `getPushClientStatus` server functions — same rules, used by `usePushRegistration`.
- `POST /api/admin/push-dry-run` and `dryRunPush` — admin only. Counts tokens. **Does not send.**
- `sendPushNotification` — dry-run stub. No vendor HTTP.
- Admin → Chat lab shows FEATURE_PUSH on/off and whether env names are present (no secret values). Staff can run a dry-run.

## How to turn it on later

1. Put FCM service-account + APNs `.p8` values on Vercel **kidease-git** (Production + Preview). Redeploy. Leave `FEATURE_PUSH` off and hit Admin → Chat lab — credentials should read “present.”
2. Ship a TestFlight / internal-track build with the plugin + entitlements.
3. Set `FEATURE_PUSH=1`. Redeploy. Open the **native** app while signed in. Confirm a row in `push_device_tokens`.
4. `POST /api/admin/push-dry-run` — expect `dryRun: true` and a token count. Still no send.
5. Only then write a real sender (out of scope). Keep vacancy / alert copy transactional.

## Later (not this PR)

- Live FCM HTTP v1 / APNs sender (and invalid-token cleanup).
- Vacancy alert fan-out to waitlisted parents (need consent + stored tokens).
- Deep links into `/inbox` or a listing.
- Web push / VAPID. Do not enable on www without a separate product decision.
- OneSignal or another vendor. Not planned.
