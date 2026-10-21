# App Store privacy labels and Play Data safety

Use this list when filling Apple's privacy nutrition labels and Google's Data safety form. Do not invent extra collection. If a row says off, leave it out of the form until that feature is turned on.

Bundle id: `ca.kidease.app`

Support: support@kidease.ca

## SDKs in the app

| SDK | What it is | Data | Linked to a person | Used to track | Notes |
| --- | --- | --- | --- | --- | --- |
| Better Auth | Sign-in | Email, name, session | Yes | No | Account data. Sign in with Apple is added only when its four env keys are set. |
| Neon Postgres | App database | Account, saved centres, messages, bookings | Yes | No | Hosted database. Not a phone SDK, but the data is collected. |
| Stripe | Website payments only | Payment status for plans bought on kidease.ca | Yes | No | The iOS and Android shells do not open Stripe or show plan prices. Billing rows are kept after account deletion. |
| PostHog | Product analytics | Pages and actions, approximate location from IP | Yes. When someone is signed in, usage is linked to the account id | No | Starts only after Allow. Health fields (allergies, medications, medical notes) are scrubbed. Native replay masks all text. Not tracking. |
| Account phone | Phone number on the parent or centre profile | Phone number | Yes | No | Not sold. A voice or video call does not show the other person's number. |
| Search | Searches and saved searches | Search history | Yes | No | Used to find licensed centres. Not used for ads. |
| Support | Messages to KidEase support | Customer support | Yes | No | The person and the support desk can read the thread. |
| Centre files | Licence and screening files a provider uploads | Other user content | Yes | No | Stored for that centre. Parents do not get the raw files. |
| Sentry | Crash reports | Crash logs, device type | No | No | Native shell waits for Allow. Health phrases in messages are scrubbed. No ads identifier. |
| Capacitor Geolocation | Near me | Precise location, only while searching | No | No | Not used in the background. City search works if permission is denied. |
| Capacitor Preferences | On-phone storage | Saved centre names saved for offline | Stays on the phone | No | Not sent to KidEase by itself. |
| Twilio Voice | In-app call | Audio data | Yes, the signed-in account | No | Loaded only on `/call`. Not recorded. Phone numbers stay hidden. |
| Twilio Video | Video tour | Audio data and video | Yes, the signed-in account | No | Loaded only on `/video`. Not recorded. No price and no subscribe button in the app. |

## Not collected in the store build

- SMS. `FEATURE_SMS` stays off. Voice and video calls are separate from SMS. Twilio is approved for those calls.
- Push. `@capacitor/push-notifications` and Firebase Messaging are not in this version. The app does not ask for notification permission.
- In-app chat with a person is not live. `FEATURE_INAPP_CHAT` stays off. A help bubble can show when the `parent-helper` flag is on. It answers from KidEase guides and does not send personal details to the model.
- Advertising ID, contacts, and background location. The microphone and camera are used only while a call is open. There is no background audio mode and no VoIP mode.
- Children's profiles are parent-entered. Do not put the app in the Kids category.

## Apple privacy manifest

`ios/App/App/PrivacyInfo.xcprivacy` declares:

- No tracking
- Precise and coarse location, email, name, phone number, user id, search history, customer support, other user content (including provider licence and screening uploads), health (allergies, medications, medical notes), product interaction linked to the account id when signed in, crash data, performance data, device id, audio data, photos or videos (the live video tour)
- No tracking (`NSPrivacyTracking` false)
- Required-reason APIs: UserDefaults `CA92.1`, file timestamps `C617.1`, disk space `E174.1`
- Google Maps and Places for search maps. Age rating 18+. Not the Kids category.
- Capacitor core ships its own privacy manifest. Plugins that do not (App, Browser, Geolocation, Haptics, Keyboard, Preferences, Share, Splash Screen, Status Bar, In-App Review), plus Sentry and PostHog, are in `ios/App/SdkPrivacy` and linked from the App target. Push is not in that package.

Add a new reason API only when a new native API is actually called.
