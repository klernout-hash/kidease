# Play Data safety — Android binary

Fill the Data safety form from this list. Do not add a row for an SDK that is not here. The application id in the project is `ca.kidease.app` (Capacitor `appId`, iOS bundle, and Android `applicationId`). `targetSdkVersion` and `compileSdk` are 36. The Play store file is an Android App Bundle from `./gradlew bundlePlayRelease` (`android/app/build/outputs/bundle/playRelease/app-play-release.aab`), not an APK. `assemblePlayRelease` builds an APK. Do not upload that APK. Samsung and Huawei use their own flavours (`docs/other-stores.md`).

`ANDROID_CERT_SHA256S` stays empty until the first Play App Signing upload.

The WebView loads `https://www.kidease.ca`. JavaScript SDKs are not Android libraries inside the AAB. They still count on the form because the app collects that data after it opens.

## Native libraries in the AAB (`android/capacitor.settings.gradle`)

| SDK | Data it collects | When |
| --- | --- | --- |
| capacitor-android | WebView shell. Loads `https://www.kidease.ca`. | Always, to show the site. |
| @capacitor/geolocation | Precise location (fine + coarse) while the app is open. | After the search permission prompt. Not background. Not used for ads. |
| @capacitor/preferences | On-device key/value (review cooldown, saved centres). | Stays on the phone. The plugin does not upload it. |
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
| posthog-js | Page views and product events. When the person is signed in, that usage is linked to the account id. The property scrubber drops password, email, phone, child name, birth date, and health text (allergies, medications, medical notes). Session replay stays off unless `VITE_PUBLIC_POSTHOG_REPLAY_NATIVE` is on (default off). | Only after the person taps Allow analytics. Essential or no choice means PostHog does not start and the app does not queue events. First-party `/ingest` proxy. On the Data safety form, mark App activity as collected and linked to the account. |
| @sentry/react | Crash and performance traces if `VITE_PUBLIC_SENTRY_DSN` is set. Data collection is limited: no user info, cookies, headers, query params, or request bodies. Stack trace and route tag. No email, child name, or health text. | Website and app both wait for the same Allow tap. Unset or Essential does not start Sentry. Leave it off the form when the DSN is unset. |
| twilio-video and @twilio/voice-sdk | Live audio on a voice call. Live audio and video on a video tour. Not a native AAR. The scripts load only on `/call` and `/video`. KidEase does not record the call. Phone numbers stay hidden. | After the person opens a call and the phone shows the camera and microphone prompt. Declare Audio and Photos and videos. Not used for ads. Not collected in the background. |

## Health information

Parents can type child health details in KidEase: allergies, medications, and medical notes. On the Play Data safety form, declare **Health info**. Those fields stay in the KidEase database. PostHog and Sentry scrub keys and values that look like allergy, medication, medical, or health notes. They are not sent to analytics or crash reports.
Also declare these, each linked to the account:

- **Phone number.** A parent or centre can save a phone number on the profile. A call does not reveal the other person's number.
- **Search history.** Searches and saved searches are used to find licensed centres. They are not used for ads.
- **Customer support.** Messages sent to KidEase support stay on that thread.
- **Files and docs.** A provider can upload a licence or screening file. Those files stay with that centre. Parents do not receive the raw file.
- Stripe Checkout is not opened from the Android app. Plan prices, upgrade buttons, and Stripe links are removed from the native shell. A plan already bought on the website still unlocks after sign-in.

## Not in this build

- SMS, call log, contacts, photo library, advertising ID, and background location. The microphone and camera are used only during a voice or video call.
- `@capacitor/push-notifications`, `POST_NOTIFICATIONS`, and `firebase-messaging`. Push is not in this version.
- Play Billing. Digital plans are not sold in the app.
- `FEATURE_SMS` and in-app chat stay off. SMS checkboxes, the chat lab, and “coming soon” store badges are hidden when `data-runtime` is `ios` or `android`.
- Parent Plus, Parent Alerts, centre-plan prices, and every Stripe checkout are not shown in the app. A video tour that needs Parent Plus is blocked with no price and no subscribe button. Firebase Analytics is excluded from the release. Firebase Messaging is not in the AAB. Twilio voice and video are JavaScript on the call pages, not native libraries. Google Maps and Places load in the WebView for search. Age rating is 18+. Not the Families program. 16 KB page size: `useLegacyPackaging = false`. Target API 36. Declare Health info for allergies, medications, and medical notes. Declare Audio and Photos and videos for Twilio calls.
