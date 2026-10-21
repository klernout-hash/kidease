# Play Data safety — Android binary

Fill the Data safety form from this list. Do not add a row for an SDK that is not here. The application id in the project is `ca.kidease.app` (Capacitor `appId`, iOS bundle, and Android `applicationId`). `targetSdkVersion` and `compileSdk` are 36. The store file is an Android App Bundle from `./gradlew bundleRelease` (`android/app/build/outputs/bundle/release/app-release.aab`), not an APK. `assembleRelease` exists because the Android Gradle plugin always offers it. Do not upload that APK.

`ANDROID_CERT_SHA256S` stays empty until the first Play App Signing upload.

The WebView loads `https://www.kidease.ca`. JavaScript SDKs are not Android libraries inside the AAB. They still count on the form because the app collects that data after it opens.

## Native libraries in the AAB (`android/capacitor.settings.gradle`)

| SDK | Data it collects | When |
| --- | --- | --- |
| capacitor-android | WebView shell. Loads `https://www.kidease.ca`. | Always, to show the site. |
| @capacitor/geolocation | Precise location (fine + coarse) while the app is open. | After the search permission prompt. Not background. Not used for ads. |
| @capacitor/push-notifications | Pulls `com.google.firebase:firebase-messaging` 25.0.1 into the AAB. That library can collect a Firebase installation id and an FCM token once Firebase is initialized. This repo has no `google-services.json`, so the Google Services plugin is not applied and Firebase does not auto-start. The manifest still declares `POST_NOTIFICATIONS`. | `FEATURE_PUSH` is off. The app does not call `requestPermissions` on launch, on the first open, or while the flag is off. No token is read in v1. If a later upload adds `google-services.json`, add Device or other IDs on the form before you ship that build. |
| @capacitor/preferences | On-device key/value (review cooldown, push seen flag, saved centres). | Stays on the phone. The plugin does not upload it. |
| @capacitor/browser | Not used for Stripe Checkout in v1. | Payments are not part of the app. |
| @capacitor/share | Share sheet. | No personal data stored by the plugin. |
| @capacitor/haptics | Vibration (`VIBRATE`). | None collected. |
| @capacitor/splash-screen | Launch splash. | None. |
| @capacitor/status-bar | Status bar style. | None. |
| @capacitor/keyboard | Keyboard inset. | None. |
| @capacitor/app | Back button and app state. | No account data. |
| @capacitor-community/in-app-review | OS review sheet. | Review text is not returned to the app. |

## JavaScript the WebView can load

| SDK | Data it collects | When |
| --- | --- | --- |
| posthog-js | Page views, product events, account id if signed in. The property scrubber drops password, email, phone, child name, birth date, and health text (allergies, medications, medical notes). Session replay stays off unless `VITE_PUBLIC_POSTHOG_REPLAY_NATIVE` is on (default off). | Only after the person taps Allow analytics. Essential or no choice means PostHog does not start and the app does not queue events. First-party `/ingest` proxy. |
| @sentry/react | Crash and performance traces if `VITE_PUBLIC_SENTRY_DSN` is set. Data collection is limited: no user info, cookies, headers, query params, or request bodies. Stack trace and route tag. No email, child name, or health text. | Website and app both wait for the same Allow tap. Unset or Essential does not start Sentry. Leave it off the form when the DSN is unset. |

## Health information

Parents can type child health details in KidEase: allergies, medications, and medical notes. On the Play Data safety form, declare **Health info**. Those fields stay in the KidEase database. PostHog and Sentry scrub keys and values that look like allergy, medication, medical, or health notes. They are not sent to analytics or crash reports.
| Stripe Checkout | Not opened from the Android app. | Plan prices, upgrade buttons, and Stripe links are removed from the native shell. A plan already bought on the website still unlocks after sign-in. |

## Not in this build

- SMS, call log, contacts, photo library, advertising ID, microphone, background location.
- Play Billing. Digital plans are not sold in the app.
- `FEATURE_SMS` and in-app chat stay off. SMS checkboxes, the chat lab, and “coming soon” store badges are hidden when `data-runtime` is `ios` or `android`.
- Parent Plus, Parent Alerts, centre-plan prices, and every Stripe checkout are not shown in the app. Firebase Analytics is excluded from the release. Twilio voice and video SDKs are not in the AAB, and the native WebView does not load `twilio-video` or `@twilio/voice-sdk`. Google Maps and Places load in the WebView for search. Age rating is 18+. Not the Families program. 16 KB page size: `useLegacyPackaging = false`. Target API 36. Declare Health info for allergies, medications, and medical notes.
