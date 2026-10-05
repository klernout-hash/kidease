# Push (FCM + APNs)

KidEase push is for **transactional** vacancy and alert notifications later (spot opened, claim status, bill reminder). Not marketing blasts. Not OneSignal. Not Meta.

`FEATURE_PUSH` defaults **off**. Absent Vercel env = off. One sender covers phones (FCM and APNs, separate credentials) and the website (VAPID). Native iOS and Android register with Capacitor when the flag is on. www.kidease.ca does not register native device tokens.

**Get alerts** shows only for a signed-in visitor. The browser permission sheet opens only when Web Push is supported, the public key is in the build (`VITE_FCM_VAPID_PUBLIC_KEY`), the server has both VAPID keys, and `FEATURE_PUSH` is armed. Unsigned visitors are never prompted. If push cannot send, email and the in-app bell still run. Nothing is sent after 9 p.m. Winnipeg time until 8 a.m.

**Production vs Preview:** on Vercel Production the flag is ignored unless a real secret exists: the FCM trio, the APNs set, or the VAPID public and private pair (`src/lib/channel-readiness.ts`). Native send still no-ops without FCM or APNs. Website send still no-ops without both VAPID keys. Preview/dev may set `FEATURE_PUSH=1` to exercise Chat lab; send still no-ops without the matching secret. Do not set Production `FEATURE_PUSH=1` in code. The default in `src/lib/flags.ts` stays false.

Optional PostHog overlay (no redeploy): see `docs/flags.md`. Env is the fallback when `POSTHOG_FLAGS_KEY` is unset. Do not enable push here by default.

The same outbox sends website Web Push when the flag is armed and both VAPID keys exist, and FCM / APNs when those credentials exist. **Nothing is sent until `FEATURE_PUSH=1` and the matching credentials are set.** Production stays off without them. The code default stays false.

## Do not enable on Production today

Leave `FEATURE_PUSH` unset (or `0`) on Production until Chat lab shows a real secret for the channel you want:

1. Website: both VAPID keys (and `VITE_FCM_VAPID_PUBLIC_KEY` in the web build).
2. Phones: a Firebase project + APNs `.p8` (placeholders only in `.env.example`), then a TestFlight / Play build with `@capacitor/push-notifications` (`npx cap sync`) and the Push Notifications entitlement.
3. You have confirmed Chat lab: secret present, never the value. Native dry-run counts tokens and still does not send.

Do not set the flag “to see if it works” on the public site with no secrets. Production ignores `FEATURE_PUSH=1` until FCM, APNs, or the VAPID pair exists. Email and the in-app bell still notify without push. Do not set `FEATURE_SMS=1` as part of this work.

Play Console enrollment is parked until the Google account is ready. Apple Developer enrollment is parked. The code and this note are enough to store tokens and run a test path later.

## Vercel env checklist

Set the same keys on **Production and Preview** (encrypted). Never commit values. `FCM_*` and `APNS_*` are server-only — never prefix `VITE_` except the optional VAPID public key.

| Name | Required to send later | Notes |
| --- | --- | --- |
| `FEATURE_PUSH` | yes (`1`) to send / prompt | **Code and Production default stay `0`.** Production ignores `1` until FCM, APNs, or the VAPID pair is set. **Preview:** may set `1` to test the lab. |
| `FCM_PROJECT_ID` | Android / FCM HTTP v1 | Firebase project id. |
| `FCM_CLIENT_EMAIL` | Android / FCM HTTP v1 | Service account email (`…@….iam.gserviceaccount.com`). |
| `FCM_PRIVATE_KEY` | Android / FCM HTTP v1 | PEM from the service account JSON. Paste the full key; keep `\n` escapes. |
| `APNS_KEY_ID` | iOS | 10-character Key ID from Apple Developer → Keys. |
| `APNS_TEAM_ID` | iOS | 10-character Team ID. |
| `APNS_BUNDLE_ID` | iOS | `ca.kidease.app` (Capacitor `appId`). |
| `APNS_KEY` | iOS | Contents of the Auth Key `.p8` (-----BEGIN PRIVATE KEY----- …). |
| `APNS_PRODUCTION` | iOS TestFlight / App Store | `1` for production APNs (`api.push.apple.com`). Default / `0` is sandbox. TestFlight uses production. |
| `VAPID_PUBLIC_KEY` | website send | Uncompressed P-256 public key, base64url. Same value as `VITE_FCM_VAPID_PUBLIC_KEY`. Server-only name. Never commit a value. |
| `VAPID_PRIVATE_KEY` | website send | 32-byte private key, base64url, or a PEM. Server-only. Never prefix `VITE_`. Never commit a value. |
| `VAPID_SUBJECT` | optional | `mailto:` or `https:` contact in the VAPID JWT. Default `mailto:support@kidease.ca`. |
| `VITE_FCM_VAPID_PUBLIC_KEY` | website subscribe | Public key baked into the web build. Must match `VAPID_PUBLIC_KEY`. Leave blank to skip the permission sheet. |

There is no legacy “FCM server key” in this scaffold. Firebase Cloud Messaging HTTP v1 uses the service account trio above. If a Console still shows a server key, do not put it in git and do not add a new env name.

Do **not** put `.p8` files, `google-services.json`, `GoogleService-Info.plist`, `sk_live_`, or service-account JSON in the repo.

## Firebase (Android + FCM) — Kyle later

1. Create a Firebase project (Google Cloud). Enable **Cloud Messaging**.
2. Add an Android app with package `ca.kidease.app`. Download `google-services.json` into `android/app/` on the laptop that cuts the Play build. That file is gitignored.
3. Project settings → Service accounts → generate a new private key. Copy `project_id`, `client_email`, and `private_key` into the Vercel names above.
4. Do not enable Analytics / Crashlytics just to “turn push on.”

## Apple (.p8 + TestFlight entitlements) — Kyle later

1. Apple Developer → Certificates, Identifiers & Profiles → **Keys** → create a key with **Apple Push Notifications service (APNs)** enabled. Download the `.p8` once. Copy Key ID → `APNS_KEY_ID`, Team ID → `APNS_TEAM_ID`, file body → `APNS_KEY`.
2. Identifiers → `ca.kidease.app` → enable **Push Notifications**.
3. Xcode / Capacitor iOS target (after Apple enrollment):
   - Signing & Capabilities → **+ Push Notifications**.
   - **Background Modes** → Remote notifications (Info.plist already lists `remote-notification`).
   - Entitlements: `aps-environment` is `development` for debug, **`production` for TestFlight and App Store**. TestFlight uses the production APNs environment — set `APNS_PRODUCTION=1` on Vercel before relying on TestFlight.
4. Rebuild (`npx cap sync ios`) so `@capacitor/push-notifications` is in the binary. A web-only Vercel deploy does not add the entitlement.
5. Confirm the provisioned profile includes Push. Archive → TestFlight. First launch after `FEATURE_PUSH=1` should prompt once and `POST /api/push/register`.

## Capacitor plugin

`@capacitor/push-notifications` is a dependency. `capacitor.config.ts` sets presentation options. Native projects (`ios/`, `android/`) are checked in — run `npx cap sync` on a laptop when you cut a store build.

The web client dynamically imports the plugin only when:

- the session is signed in,
- `Capacitor.isNativePlatform()` is true,
- `getPushClientStatus()` says `FEATURE_PUSH` is on.

www calls `Notification.requestPermission()` only from the Get alerts button, and only when the visitor is signed in, Web Push is supported, both VAPID keys exist, and `FEATURE_PUSH` is armed. The first view in a browser tab does not ask. Unsigned visitors never see the prompt.

`vercel.json` sets `notifications=(self)` so an armed site can ask. `notifications=()` would block the prompt even after keys exist. The button is the real gate. Chat lab shows whether each secret is present. It never shows the value.

## What is wired

- `FEATURE_PUSH` / `pushEnabled()` — default off. Absent env = off.
- Migration `0027_push_device_tokens.sql` — `push_device_tokens` (user_id, token, platform ios|android, provider fcm|apns).
- `POST /api/push/register` — session required, same-site. Persists only when the flag is on. Rejects `web`.
- `registerPushToken` / `getPushClientStatus` server functions — same rules, used by `usePushRegistration`.
- `POST /api/admin/push-dry-run` and `dryRunPush` — admin only. Counts tokens. **Does not send.**
- `sendPushNotification` / `sendPushToDevices` — FCM HTTP v1 and APNs HTTP/2 when the flag **and** credentials are present. Otherwise skip / dry-run. Invalid tokens (UNREGISTERED / 410) are deleted.
- Admin → Chat lab shows FEATURE_PUSH on/off, source (env / PostHog), and whether FCM, APNs, and each VAPID key are present (never the values). Production stays disarmed without secrets. Staff can run a dry-run. See `docs/chat.md`.
- Migration `0084_alert_push_prefs.sql`: category opt-out (`notification_prefs`), quiet-hours queue (`notification_outbox`), and stored web subscriptions. Billing alerts are skipped while `SUBSCRIPTIONS_ENABLED` is off. Quiet hours are 9 p.m. to 8 a.m. America/Winnipeg.
- Migration `0085_alert_hooks.sql`: first aid expiry, centre review replies, still-looking check-ins, and a bell kind that can store customer alerts.
- `sendWebPushToUser` delivers those subscriptions when the flag is armed and both VAPID keys exist. If nothing is pushed, email (when the alert asks for it) and the in-app bell still run.
- Account → Alerts (parent and daycare) saves those toggles in English and French. Parents can confirm they are still looking. Unsubscribe links use `/unsubscribe?token=ka.…`.

## How to turn it on later

1. Put FCM service-account + APNs `.p8` values on Vercel **kidease-git** (Production + Preview). Redeploy. Leave `FEATURE_PUSH` off and hit Admin → Chat lab — credentials should read “present.”
2. Ship a TestFlight / internal-track build with the plugin + entitlements. Place `google-services.json` only on the build machine.
3. Enable `FEATURE_PUSH` in PostHog (preferred — see `docs/flags.md`) or set `FEATURE_PUSH=1` on Vercel (and `APNS_PRODUCTION=1` for TestFlight). Open the **native** app while signed in. Confirm a row in `push_device_tokens`.
4. `POST /api/admin/push-dry-run` — expect `dryRun: true` and a token count. Still no send.
5. Call `sendPushNotification({ userId, title, body })` from a server path (vacancy / claim) only after a dry-run looks right. Keep copy transactional.

## Website delivery

When `FEATURE_PUSH` is armed and both VAPID keys are set, `dispatchCustomerAlert` encrypts the payload (RFC 8291 aes128gcm) and POSTs it to the stored subscription (RFC 8292). Endpoints are limited to known browser push hosts. A 404 or 410 deletes that subscription. There is no OneSignal and no marketing blast.

Generate a key pair on your laptop. Paste the lines into Vercel. Do not commit them.

```bash
node -e 'const {generateKeyPairSync}=require("node:crypto"); const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"}); const jwk=publicKey.export({format:"jwk"}); const pub=Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x,"base64url"), Buffer.from(jwk.y,"base64url")]).toString("base64url"); console.log("VAPID_PUBLIC_KEY="+pub); console.log("VITE_FCM_VAPID_PUBLIC_KEY="+pub); console.log("VAPID_PRIVATE_KEY="+privateKey.export({format:"jwk"}).d);'
```

Set `VAPID_PUBLIC_KEY` and `VITE_FCM_VAPID_PUBLIC_KEY` to the same public value, and `VAPID_PRIVATE_KEY` to the private value. Redeploy so the public key is in the web build. Then set `FEATURE_PUSH=1` on the environment that has those secrets. Production with no secrets stays disarmed even if the flag is `1`.

## What parents and daycares get

All of these go through account toggles, quiet hours, and unsubscribe. Billing stays off while `SUBSCRIPTIONS_ENABLED` is off.

- Enquiry, messages, tours, claim approved, waitlist, saved-search match, and the weekly open-spots check-in (already on this path).
- Saved centre price, ages, or schedule changes.
- Weekly "still looking?" for parents who saved a search or a centre.
- Review replies (the review text is not in the push).
- Licence or screening status on a saved centre. Documents stay private.
- Licence, screening, or first aid expiry for the daycare.
- A photo or review that needs a look.
- Claim needs a document (Admin → Needs a document).

## Where it shows

| Who | What they get |
| --- | --- |
| Signed-in website | Web push when the flag is armed and both VAPID keys exist. Otherwise email and the in-app bell. |
| Native iOS / Android | FCM or APNs when the flag is armed and those credentials exist. The code is ready. It does not fake a send. |
| Unsigned visitor | No prompt. |

## Later

- Store builds and the FCM / APNs secrets. Phone send stays a no-op until both the flag and those credentials exist.
- OneSignal or another vendor. Not planned.
