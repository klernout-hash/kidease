# KidEase store reviews (native in-app + write-review links)

KidEase asks for an App Store / Play rating only after a real happy moment, using the **OS 1–5 sheet**. There is no custom star picker and no prompt on launch.

## What ships

| Surface | Behaviour |
| --- | --- |
| Happy moment (Capacitor iOS / Android) | `@capacitor-community/in-app-review` → `SKStoreReviewController` / Play In-App Review |
| Menu + Account + guest home “Rate KidEase” | Native: App Store / Play **write-review** URL. Web: `/get-app` |
| Website (logged-out `/`) | Same Account prompt on guest home. Footer + website drawer also expose it. No native sheet. `/get-app` unchanged |

Happy moments (only these call the native sheet):

1. Parent **saves a search**
2. Parent **shares** a listing (share sheet completes)
3. Parent **sends a spot request** (`/book/$slug` or the listing sheet)

`NativeBoot` never requests a review.

## OS quotas — do not work around them

Apple and Google decide whether the sheet appears. Typical limits:

- **iOS:** about three review prompts per 365 days per Apple ID
- **Play:** Play In-App Review quota (not documented as a fixed number)

KidEase also keeps a **90-day** cooldown in Capacitor Preferences (`kidease-store-review-last`) so we do not ask every happy moment. Recording the timestamp before `requestReview()` avoids a retry loop when the OS shows nothing.

Do **not**:

- Show a fake 1–5 control
- Prompt on every cold start
- Invent ratings or review counts
- Deep-link to a made-up App Store numeric ID

## Store IDs (placeholders)

| Constant | Today | When to set |
| --- | --- | --- |
| `STORE.appleAppStoreId` / `VITE_APPLE_APP_STORE_ID` | **empty** | After App Store Connect assigns the numeric id (`id1234567890`) |
| `STORE.playPackageName` / `VITE_PLAY_PACKAGE_NAME` | `ca.daycarenearme.app` | Already the Capacitor `appId`. Override only if the Play package differs |

Write-review URLs:

- Apple (only when the numeric id is set): `https://apps.apple.com/app/id{id}?action=write-review`
- Play: `https://play.google.com/store/apps/details?id=ca.daycarenearme.app`

If the Apple id is still empty, the native menu item falls back to the OS in-app sheet (no invented id). Web still goes to `/get-app`.

Set the public Vite vars on Vercel when Apple assigns the id. They are not secrets. Never commit a guessed number.

## Capacitor

```bash
npm i @capacitor-community/in-app-review
npx cap sync
```

The plugin is wired in `ios/` (SPM) and `android/` (Gradle). Production WebView still loads `https://www.kidease.ca` — a Vercel deploy is enough for the JS; a new TestFlight / Play binary is required for the native sheet.

## Device smoke (after a signed binary)

- [ ] Cold start does **not** show a review sheet
- [ ] Save a search on a native build → OS sheet may appear (or silently no-op under quota)
- [ ] Menu → Rate KidEase opens the store write-review page when IDs exist
- [ ] www.kidease.ca Menu / guest home / footer → Rate KidEase opens `/get-app` (no crash, no fake stars)

See also [`mobile-builds.md`](mobile-builds.md) and [`store-readiness.md`](store-readiness.md).
