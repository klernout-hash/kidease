# App Store privacy labels and Play Data safety

Use this list when filling Apple's privacy nutrition labels and Google's Data safety form. Do not invent extra collection. If a row says off, leave it out of the form until that feature is turned on.

Bundle id: `ca.kidease.app`

## SDKs in the app

| SDK | What it is | Data | Linked to a person | Used to track | Notes |
| --- | --- | --- | --- | --- | --- |
| Better Auth | Sign-in | Email, name, session | Yes | No | Account data. Sign in with Apple is added only when its four env keys are set. |
| Neon Postgres | App database | Account, saved centres, messages, bookings | Yes | No | Hosted database. Not a phone SDK, but the data is collected. |
| Stripe | Web payments | Payment status for daycare plans | Yes | No | Checkout opens in the browser, not as an in-app purchase. Billing rows are kept after account deletion. |
| PostHog | Product analytics | Pages and actions, approximate location from IP | No, if identified calls stay off | No | Do not mark tracking unless a build actually identifies people. |
| Sentry | Crash reports | Crash logs, device type | No | No | No ads identifier. |
| Capacitor Geolocation | Near me | Precise location, only while searching | No | No | Not used in the background. City search works if permission is denied. |
| Capacitor Push | Notifications | Push token | Yes, when the person turns notifications on | No | Off until `FEATURE_PUSH` is on. The app does not ask on first launch. |
| Capacitor Preferences | On-phone storage | Saved centre names saved for offline | Stays on the phone | No | Not sent to KidEase by itself. |

## Not collected in the store build

- SMS. Twilio is not approved. `FEATURE_SMS` stays off.
- In-app chat with a person is not live. `FEATURE_INAPP_CHAT` stays off. A help bubble can show when the `parent-helper` flag is on. It answers from KidEase guides and does not send personal details to the model.
- Advertising ID, contacts, microphone, and background location.
- Children's profiles are parent-entered. Do not put the app in the Kids category.

## Apple privacy manifest

`ios/App/App/PrivacyInfo.xcprivacy` declares:

- No tracking
- Precise location for app functionality
- UserDefaults reason `CA92.1` (saved preferences on device)

Add a new reason API only when a new native API is actually called.
