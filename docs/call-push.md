# Background call ring (FEATURE_CALL_PUSH)

Incoming KidEase voice and video calls ring when the app is closed, in the background, or the phone is locked.
The flag is off by default. While it is off, every server function returns "Background ring is off." and nothing is sent.

| Platform | Transport | Ring UI |
|---|---|---|
| iOS | PushKit VoIP push (`apns-push-type: voip`, topic `<bundle>.voip`) | CallKit system incoming-call screen |
| Android (Play) | FCM HTTP v1 data message, `priority: HIGH`, `ttl: 25s` | Full-screen `CallStyle` notification (`CATEGORY_CALL`, `USE_FULL_SCREEN_INTENT`) |
| Huawei (no GMS) | HMS Push Kit data message, `urgency: HIGH`, `category: VOIP` | Same notification (`android/hms/KidEaseHmsMessageService.java`) |
| Web | Web Push (VAPID) through `public/sw.js` | `requireInteraction` notification with Answer / Decline |

Flow: the caller runs `startCallRing`, which creates a `call_rings` row per callee that expires after 25 s and sends `type=call`.
`cancelCallRing` (reasons: answered, declined, hangup, timeout) sends `type=call-cancel`, which stops the ringing on every device.
Payloads hold only the ring id, the thread id, the media type, and the caller's display name. A label that looks like a phone number or email is replaced with "KidEase". No personal numbers are used: the CallKit handle is the opaque thread id.

## Keys still needed (env names only; never commit values)

- **APNs VoIP:** `APNS_KEY` (.p8 with APNs enabled), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION=1`. The App ID needs Push Notifications and VoIP background mode.
- **FCM:** `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (Firebase service account), plus `google-services.json` in the Android build.
- **HMS:** `HMS_APP_ID`, `HMS_CLIENT_ID`, `HMS_CLIENT_SECRET` (AppGallery Connect), plus `agconnect-services.json` and a huawei build flavor.
- **Web:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (already used by FEATURE_PUSH).

## Release

This needs new native store builds (iOS: PushKit, CallKit, entitlements. Android: new service and permissions).
Apple and Google submission waits until Kyle has tested it on real devices.
Apple rejects apps that receive a VoIP push and don't report it to CallKit. The plugin always reports the call, including on cancel.
Google Play needs the USE_FULL_SCREEN_INTENT declaration (calling app) in the Play Console.
