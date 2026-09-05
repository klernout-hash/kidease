# KidEase Capacitor builds (iOS + Android)

Scaffolding so a Mac with Xcode and a machine with Android Studio can produce a **TestFlight** IPA and a **Play internal-testing** AAB that load the live site.

This repository does **not** enroll an Apple Developer Program or Google Play Console account. It does **not** upload builds. The App Store / Play listings are **not** live — `/get-app` still says coming soon.

Live WebView URL: **https://www.kidease.ca**  
Bundle / application id: **ca.daycarenearme.app**  
App name: **KidEase**

## What is checked in

- `capacitor.config.ts` — production `server.url` / `hostname` default to `www.kidease.ca`.
- `native-www/` — tiny fallback shell (production builds use the remote URL).
- `resources/` — icon + splash generated from the existing pin pipeline (`public/logo-transparent.png`).
- `ios/` and `android/` — Capacitor 8 native projects, permission strings, and icons. Regenerable (see below).
- Location is **while-using only**. No background location permission, no `UIBackgroundModes: location`.

Do not commit signing secrets, `.p12`, keystores, `android/key.properties`, or `local.properties`.

## One-time machine setup

### Both

```bash
npm ci
npm run icons
npm run cap:assets
npm run cap:sync
```

`cap:sync` copies plugins + `native-www` into the native projects. Production phone builds still open **https://www.kidease.ca** (see `server.url`).

On-device live reload against a laptop (optional, never for store/TestFlight binaries):

```bash
CAP_SERVER_URL=http://192.168.1.10:8080 npm run cap:sync
```

### If `ios/` or `android/` are missing

```bash
npx cap add ios
npx cap add android
npm run cap:permissions
npm run cap:assets
npm run cap:sync
```

Capacitor 8 uses Swift Package Manager (`ios/App/CapApp-SPM`). Open `ios/App/App.xcodeproj` on a Mac — no CocoaPods step. If you re-add the platform with a CocoaPods template, run `pod install` inside `ios/App` and open the workspace instead.

## iOS — Xcode Archive → TestFlight

Needs Kyle’s Apple ID / paid Apple Developer Program. This PR does not create that account.

1. Mac: `npm ci && npm run cap:sync && npm run cap:ios` (opens `ios/App/App.xcodeproj`; SPM resolves plugin packages on first build).
2. Xcode → App target → **Signing & Capabilities**: select Kyle’s team. Bundle ID must stay `ca.daycarenearme.app`.
3. Confirm **Info** → Privacy — Location When In Use Usage Description is the parent daycare-finder string (when-in-use only). Do not add Always / Background Modes → Location.
4. Select **Any iOS Device (arm64)**.
5. **Product → Archive**. When the Organizer opens, **Distribute App → App Store Connect → Upload**.
6. App Store Connect → TestFlight → wait for processing → add internal testers. External TestFlight needs Beta App Review later — not this PR.

Xcode will ask you to register the bundle ID in the developer portal the first time. That is account work, not repo work.

## Android — `bundleRelease` → Play internal

Needs a Play Console account and an app created with application id `ca.daycarenearme.app`. This PR does not sign up for Play.

1. Copy `android/key.properties.example` to `android/key.properties` and point at a **local** upload keystore you created (`keytool`). Never commit the keystore or passwords. `android/app/build.gradle` reads that file only when it exists.
2. Android Studio: `npm run cap:android`, or:

   ```bash
   cd android
   ./gradlew bundleRelease
   ```

   The AAB lands at `android/app/build/outputs/bundle/release/app-release.aab` (gitignored).
3. Play Console → Testing → Internal testing → create a release → upload the AAB → add testers by email.

Debug USB installs (`./gradlew installDebug`) use the debug keystore and are enough for the physical-device smoke list below.

## Location permissions (when-in-use)

Purpose string (English), also in `fr.lproj` / `values-fr`:

> KidEase uses your location only while you search so we can show licensed daycares near you. Location is not used in the background.

| Platform | Present | Must not be present |
| --- | --- | --- |
| iOS | `NSLocationWhenInUseUsageDescription` | `NSLocationAlways*`, `UIBackgroundModes` location |
| Android | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | `ACCESS_BACKGROUND_LOCATION` |

Parents can still search by city / postal code if they tap Don’t Allow.

The `@capacitor/geolocation` plugin requests **when-in-use** at runtime. Do not add `NSLocationAlways*` or `ACCESS_BACKGROUND_LOCATION` to satisfy the plugin README. If App Store Connect later flags a missing Always purpose string because the plugin binary links Core Location, add the **same** when-in-use daycare-finder sentence — still no Background Modes → Location.

## Physical device smoke checklist

Install a **debug** or internal build on a real phone (not a simulator-only pass). The store listing is not live; this is engineering QA.

- [ ] App icon is the navy KidEase pin on white (not a Capacitor placeholder).
- [ ] Splash / first paint is white, then **https://www.kidease.ca** loads (licensed directory, not a blank `localhost`).
- [ ] Cold start reaches Home / Explore without a native crash.
- [ ] Location prompt appears **once**, wording matches the daycare-finder purpose, and the system sheet is **While Using** (iOS) / precise-or-approximate while in use (Android) — not Always / all the time.
- [ ] Allow location → nearby licensed centres appear; deny → typed city / postal code still works.
- [ ] Leaving the app does not keep a location indicator on (no background tracking).
- [ ] Sign-in / session cookie works against `www.kidease.ca` (same account as the website).
- [ ] A listing opens; map tiles render.
- [ ] Deep link / custom scheme `KidEase://` is registered (optional check from Notes).
- [ ] Android back button leaves a listing without exiting the WebView shell.
- [ ] Rotate / keyboard on search does not cover the field.

If the WebView is stuck on the `native-www` fallback page, `server.url` was lost — re-run `npm run cap:sync` without `CAP_SERVER_URL` and rebuild.

## Icons and splash

```bash
npm run icons          # public/ + public/icons/ from logo-transparent.png
npm run cap:assets     # resources/ + native AppIcon / mipmap / splash
```

Do not restyle the pin. Same pipeline as the PWA home-screen icons.

## Out of scope (deliberately)

- Apple Developer enrollment, certificates, or TestFlight upload.
- Google Play Console signup, Play App Signing, or production track.
- Claiming the App Store / Play listing is live.
- Push (APNs / FCM) — still `FEATURE_PUSH=0`.
- Shipping a production AAB/IPA from CI.
