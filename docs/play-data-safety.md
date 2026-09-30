# Play Data safety — Android binary

Fill the Data safety form from this list. Do not add a row for an SDK that is not here. The application id in the project is `ca.daycarenearme.app` (Capacitor `appId`, iOS bundle, and Android `applicationId`). It is not `ca.kidease.app`. `targetSdkVersion` and `compileSdk` are 36. The store file is an Android App Bundle from `./gradlew bundleRelease` (`android/app/build/outputs/bundle/release/app-release.aab`), not an APK. `assembleRelease` exists because the Android Gradle plugin always offers it. Do not upload that APK.

`ANDROID_CERT_SHA256S` stays empty until the first Play App Signing upload.

The WebView loads `https://www.kidease.ca`. JavaScript SDKs are not Android libraries inside the AAB. They still count on the form because the app collects that data after it opens.

## Native libraries in the AAB (`android/capacitor.settings.gradle`)

| SDK | Data it collects | When |
| --- | --- | --- |
| capacitor-android | WebView shell. Loads `https://www.kidease.ca`. | Always, to show the site. |
| @capacitor/geolocation | Precise location (fine + coarse) while the app is open. | After the search permission prompt. Not background. Not used for ads. |
| @capacitor/push-notifications | Pulls `com.google.firebase:firebase-messaging` 25.0.1 into the AAB. That library can collect a Firebase installation id and an FCM token once Firebase is initialized. This repo has no `google-services.json`, so the Google Services plugin is not applied and Firebase does not auto-start. The manifest still declares `POST_NOTIFICATIONS`. | `FEATURE_PUSH` is off. The app does not call `requestPermissions` on launch, on the first open, or while the flag is off. No token is read in v1. If a later upload adds `google-services.json`, add Device or other IDs on the form before you ship that build. |
| @capacitor/preferences | On-device key/value (review cooldown, push seen flag, saved centres). | Stays on the phone. The plugin does not upload it. |
| @capacitor/browser | Opens the system browser for childcare Stripe Checkout and store links. | The app does not see card numbers. |
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
| posthog-js | Page views, product events, account id if signed in. The property scrubber drops password, email, phone, child name, allergy, and birth date. Session replay stays off unless `VITE_PUBLIC_POSTHOG_REPLAY_NATIVE` is on (default off). | Only after the person taps Allow analytics. Essential or no choice means PostHog does not start and the app does not queue events. First-party `/ingest` proxy. |
| @sentry/react | Crash and performance traces if `VITE_PUBLIC_SENTRY_DSN` is set. `sendDefaultPii` is false. Stack trace and route tag. No email, cookies, or child name. | In the app, only after the same Allow tap. The website still starts Sentry without that banner. Leave it off the form when the DSN is unset. |
| Stripe Checkout (hosted page, not an Android library) | Childcare payments (spots, tours, fees). | Card data stays on Stripe. Not used for Parent Plus or centre plans inside the app — those screens are hidden. |

## Not in this build

- SMS, call log, contacts, photo library, advertising ID, microphone, background location.
- Play Billing. Digital plans are not sold in the app.
- `FEATURE_SMS` and in-app chat stay off. SMS checkboxes, the chat lab, and “coming soon” store badges are hidden when `data-runtime` is `ios` or `android`.
- Parent Plus and centre-plan prices and Stripe checkout for those digital plans are hidden on iOS and Android. Childcare bills stay.
