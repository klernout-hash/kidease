# KidEase Capacitor builds (iOS + Android)

Scaffolding so a Mac with Xcode and a machine with Android Studio can produce a **TestFlight** IPA and a **Play internal-testing** AAB that load the live site.

This repository does **not** enroll an Apple Developer Program or Google Play Console account. It does **not** upload builds. The App Store / Play listings are **not** live — `/get-app` still says coming soon.

Account enrollment, legal URLs, listing copy, and the remaining store checklist live in [`store-readiness.md`](store-readiness.md). Canada **1 Nov 2026** owner timeline: [`STORE-LAUNCH.md`](STORE-LAUNCH.md).

Live WebView URL: **https://www.kidease.ca**  
Bundle / application id: **ca.kidease.app**  
App name: **KidEase**

## What is checked in

- `capacitor.config.ts` — production `server.url` / `hostname` default to `www.kidease.ca`.
- `native-www/` — tiny fallback shell (production builds use the remote URL).
- `resources/` — icon + splash generated from the existing pin pipeline (`public/logo-transparent.png`).
- `ios/` and `android/` — Capacitor 8 native projects, permission strings, and icons. Regenerable (see below).
- `ios/App/App/App.entitlements` — Associated Domains and Sign in with Apple. This is the file the store archive signs. `aps-environment` is not in it. Archive with Xcode 27.1 or later and the iOS 27.1 SDK (iPhone Duo). This repo cannot archive on Linux. Deployment target stays iOS 15.0.
- `ios/App/App/Store.xcconfig` — the switch for push and calling declarations. The store lines are active. The push lines are comments. See below.
- `ios/App/App/Info.plist` — no `UIBackgroundModes` key. Do not add `voip`, `audio`, or `remote-notification` here. The build setting in `Store.xcconfig` adds them when you uncomment it.
- `AndroidManifest.xml` — App Links `autoVerify` for those hosts plus `KidEase://` / `ca.kidease.app://`.
- Location is **while-using only**. No background location permission, and no `UIBackgroundModes` key at all.

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
2. Xcode → App target → **Signing & Capabilities**: select Kyle’s team. Bundle ID must stay `ca.kidease.app`.
3. Confirm **Info** → Privacy — Location When In Use Usage Description is the parent daycare-finder string (when-in-use only). Do not add Always / Background Modes → Location.
4. Select **Any iOS Device (arm64)**. Use Xcode 27.1 or later (iOS 27.1 SDK). An iOS 26 SDK build is letterboxed on iPhone Duo, and Apple requires the iOS 27 SDK for every upload from April 2027.
5. **Product → Archive**. When the Organizer opens, **Distribute App → App Store Connect → Upload**.
6. App Store Connect → TestFlight → wait for processing → add internal testers. External TestFlight needs Beta App Review later — not this PR.

### iPhone Duo simulator pass (T1, before every archive)

Free: Xcode 27.1 on any Mac, no Apple Developer account. The app is a remote WebView, so this checks the live site inside the real shell.

1. `npm ci && npm run cap:sync && npm run cap:ios`, then run on the **iPhone Duo** simulator.
2. In Device Hub, switch between closed, partly open and open, and rotate each pose.
3. In Safari → Develop → Simulator → KidEase, paste this on each pose and record the numbers in the PR:
   `({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,ch:document.documentElement.dataset.channel,shape:document.documentElement.dataset.keShape,safe:['top','right','bottom','left'].map(s=>getComputedStyle(document.documentElement).getPropertyValue('--ke-safe-'+s))})`
4. Expected from simulator reports: closed portrait about 466×678 with right ≈ 84 and bottom ≈ 34; open landscape 951×669. If the numbers differ, update `DUO_POSES` in `scripts/store-viewports.mjs`.
5. Closed: one column, bottom tab bar. Open (landscape): a left rail with the same tabs, list and map side by side on Search. Open and rotated: one column, bottom bar. Nothing sits under the side status strip.
6. If one rotation of the inner display is refused or letterboxed, add `UIInterfaceOrientationPortraitUpsideDown` to the iPhone list in `Info.plist` and update `scripts/ipad-layout.test.mjs`. Never add `UIRequiresFullScreen`.

Xcode will ask you to register the bundle ID in the developer portal the first time. That is account work, not repo work.

### Push and calling declarations

The push and calling source stays in the app. `FEATURE_PUSH`, `FEATURE_CALL_PUSH`, `FEATURE_VOICE`, and `FEATURE_VIDEO` stay off. With those flags off the app does not ask for notification permission, does not show a call button, and does not start PushKit.

This archive also leaves the declarations off. `ios/App/App/Store.xcconfig` is the switch. Debug includes it from `ios/debug.xcconfig`. Release uses it as the App target base configuration. Do not set `CODE_SIGN_ENTITLEMENTS` on the target. A target value overrides the file.

Store archive, leave these as they are:

```
CODE_SIGN_ENTITLEMENTS = App/App.entitlements
// CODE_SIGN_ENTITLEMENTS = App/App.push.entitlements
// INFOPLIST_KEY_UIBackgroundModes = voip audio remote-notification
// INFOPLIST_KEY_KIDEASEPushCalling = YES
```

`App/App.entitlements` has Sign in with Apple and Associated Domains. It has no `aps-environment`. `Info.plist` has no `UIBackgroundModes`. `CallKitVoipPlugin.register` returns without creating a PushKit registry unless the built Info.plist has `KIDEASEPushCalling` set to YES.

To put the declarations back in a later archive, when push and calling are ready to ship:

1. Open `ios/App/App/Store.xcconfig`.
2. Comment out `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`.
3. Uncomment these three lines, in this order, below the store line:

```
CODE_SIGN_ENTITLEMENTS = App/App.push.entitlements
INFOPLIST_KEY_UIBackgroundModes = voip audio remote-notification
INFOPLIST_KEY_KIDEASEPushCalling = YES
```

4. Archive again with Xcode 27.1 or later and the iOS 27.1 SDK. Do not edit `Info.plist` to add the modes. Xcode merges `INFOPLIST_KEY_UIBackgroundModes` into the signed Info.plist. `App.push.entitlements` is the same as the store file plus `aps-environment` = `production`.
5. Turn `FEATURE_PUSH` and `FEATURE_CALL_PUSH` on only after the credentials exist and you mean to send. The declarations and the flags are separate. Flags stay off for this submission.

`npm run cap:permissions` rewrites `App.entitlements` without `aps-environment` and rewrites `App.push.entitlements` with it. It also strips any `UIBackgroundModes` array from the source `Info.plist`. It does not change `Store.xcconfig`.

### Android call and push permissions

The same hold applies to the Android store builds. Play, Samsung, Huawei, and Amazon do not declare `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `CAMERA`, `RECORD_AUDIO`, or `MODIFY_AUDIO_SETTINGS`. Location while you search, and vibration for haptics, stay. The push, call, and video source stays in the app. The feature flags stay off.

`scripts/patch-native-permissions.mjs` has `HOLD_CALL_AND_PUSH_PERMISSIONS = true`. `npm run cap:permissions` strips those five permissions from `android/app/src/main/AndroidManifest.xml` and from the Huawei overlay, so a later sync cannot put them back by accident.

#### Prepared, not released: calls without push (`KIDEASE_ANDROID_CALL_MEDIA=1`)

Video and voice calls only need the camera and microphone, not push. A build run with `KIDEASE_ANDROID_CALL_MEDIA=1 npm run cap:permissions` keeps the hold for push (`POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`) and adds back only `CAMERA`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`, with the camera and microphone features `required="false"`. Default runs are unchanged, and the committed manifests do not declare them.

`MainActivity` adds `KidEaseCallMedia` to the WebView User-Agent only when the installed package declares both `CAMERA` and `RECORD_AUDIO`. The site hides Call and Video in any Android store app without that token (`shellBlocksCallMedia` in `src/lib/call-match.ts`), so current store apps never show a dead button. iOS is not affected.

Before a store release with the switch: re-check the Play Data safety and permissions declarations (camera, microphone) and the Samsung, Huawei, and Amazon equivalents. Kyle approves the release.

When push and calling are ready to ship:

1. Set `HOLD_CALL_AND_PUSH_PERMISSIONS` to `false` in `scripts/patch-native-permissions.mjs`.
2. Run `npm run cap:permissions`. That writes the five permissions back into both manifests, plus the camera and microphone features with `required="false"`.
3. Turn `FEATURE_PUSH`, `FEATURE_CALL_PUSH`, `FEATURE_VOICE`, and `FEATURE_VIDEO` on only after the credentials exist and you mean to send. The declarations and the flags are separate.

### Native crash symbols

iOS dSYM upload and Android ProGuard mapping upload stay out of this store build. Do not archive or upload build 5 until Kyle approves that plan. JavaScript source maps for the website are a separate switch, `SENTRY_UPLOAD_SOURCEMAPS`, and it stays unset.

## Android — `bundleRelease` → Play internal

Play, Samsung Galaxy Store, and Huawei AppGallery are three flavours of the same application id. The Play command is `bundlePlayRelease`. Galaxy Store and AppGallery commands, and what each store allows for Stripe, are in [`other-stores.md`](other-stores.md).

Needs a Play Console account and an app created with application id `ca.kidease.app`. This PR does not sign up for Play.

1. Copy `android/key.properties.example` to `android/key.properties` and point at a **local** upload keystore you created (`keytool`). Never commit the keystore or passwords. `android/app/build.gradle` reads that file only when it exists.
2. Android Studio: `npm run cap:android`, or:

   ```bash
   cd android
   ./gradlew bundlePlayRelease
   ```

   The Play AAB lands at `android/app/build/outputs/bundle/playRelease/app-play-release.aab` (gitignored). The GitHub workflow job is still named bundleRelease. It runs this Play task, then the signed Amazon APK, then Huawei when the AppGallery secret is set.
3. Play Console → Testing → Internal testing → create a release → upload the AAB → add testers by email.

Debug USB installs (`./gradlew installDebug`) use the debug keystore and are enough for the physical-device smoke list below.

### Signed `app-release.aab` (upload keystore + GitHub Actions)

Play re-signs uploads with its app signing key. `assetlinks.json` lists that Play App Signing cert and the upload key. Set `ANDROID_CERT_SHA256S` only to replace that list. Do not invent a fingerprint.

Create the upload keystore once, on a machine you control:

```bash
keytool -genkeypair -v \
  -keystore kidease-upload.jks \
  -alias kidease \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` asks for a store password and a key password. Store the `.jks` and both passwords in 1Password. Never commit them. `android/*.jks` and `android/key.properties` are gitignored.

Local signing uses `android/key.properties` (copy from `android/key.properties.example`):

```
storeFile=/absolute/path/to/kidease-upload.jks
storePassword=…
keyAlias=kidease
keyPassword=…
```

`android/app/build.gradle` signs `bundleRelease` only when that file exists. Without it the AAB is unsigned. Do not upload an unsigned bundle.

GitHub → Settings → Secrets and variables → Actions. Create these four secrets. Names must match the workflow:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Linux: `base64 -w 0 kidease-upload.jks`. Mac: `base64 -i kidease-upload.jks \| tr -d '\n'`. Paste the one line. |
| `ANDROID_KEYSTORE_PASSWORD` | store password from `keytool` |
| `ANDROID_KEY_ALIAS` | `kidease` (the `-alias` you used) |
| `ANDROID_KEY_PASSWORD` | key password from `keytool` |

CI does not run this on every pull request (the secrets are not required for check or e2e). When the four secrets exist, run **Actions → Android release → Run workflow**. That workflow (`.github/workflows/android-release.yml`):

1. Decodes `ANDROID_KEYSTORE_BASE64` to `android/kidease-upload.jks`.
2. Writes `android/key.properties` with the alias and passwords. `storeFile` is an absolute path so Gradle can see it from the app module.
3. Runs `./gradlew bundlePlayRelease` with Java 21.
4. Uploads `android/app/build/outputs/bundle/playRelease/app-play-release.aab` as the `app-release-aab` artifact.
5. Runs `./gradlew assembleAmazonRelease` with that same upload keystore and uploads `android/app/build/outputs/apk/amazon/release/app-amazon-release.apk` as the `app-amazon-release` artifact, before any Huawei step.
6. If `AGCONNECT_SERVICES_JSON` is set, writes `agconnect-services.json` and runs `bundleHuaweiRelease` and `assembleHuaweiRelease`. If that secret is missing, the Huawei build step is skipped with a warning. The Play and Amazon artifacts stay.

Download that artifact and upload it in Play Console. Do not upload `app-release.apk`.

## Location permissions (when-in-use)

Purpose string (English), also in `fr.lproj` / `values-fr`:

> KidEase uses your location only while you search so we can show licensed daycares near you. Location is not used in the background.

| Platform | Present | Must not be present |
| --- | --- | --- |
| iOS | `NSLocationWhenInUseUsageDescription` | `NSLocationAlways*`, any `UIBackgroundModes` entry (`location`, `voip`, `audio`, `remote-notification`) |
| Android | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | `ACCESS_BACKGROUND_LOCATION` |

Parents can still search by city / postal code if they tap Don’t Allow.

The `@capacitor/geolocation` plugin requests **when-in-use** at runtime. Do not add `NSLocationAlways*` or `ACCESS_BACKGROUND_LOCATION` to satisfy the plugin README. If App Store Connect later flags a missing Always purpose string because the plugin binary links Core Location, add the **same** when-in-use daycare-finder sentence — still no Background Modes → Location.

## Physical device smoke checklist

Install a **debug** or internal build on a real phone (not a simulator-only pass). The store listing is not live; this is engineering QA.

- [ ] App icon is the navy KidEase pin on white (not a Capacitor placeholder).
- [ ] Splash stays on the warm page colour (`#F6F3EE`) until the shell paints, then **https://www.kidease.ca** loads (licensed directory, not a blank `localhost`). It must not auto-hide onto a white WebView.
- [ ] Cold start reaches Home / Explore without a native crash.
- [ ] Location prompt appears **once**, wording matches the daycare-finder purpose, and the system sheet is **While Using** (iOS) / precise-or-approximate while in use (Android) — not Always / all the time.
- [ ] Allow location → nearby licensed centres appear; deny → typed city / postal code still works.
- [ ] Leaving the app does not keep a location indicator on (no background tracking).
- [ ] Sign-in / session cookie works against `www.kidease.ca` (same account as the website).
- [ ] A listing opens; map tiles render.
- [ ] Deep link / custom scheme `KidEase://` is registered (optional check from Notes).
- [ ] Android back button leaves a listing without exiting the WebView shell.
- [ ] Rotate / keyboard on search does not cover the field.
- [ ] Cold start does not show an App Store / Play review sheet. Menu → Rate KidEase is present (store write-review when IDs exist; see [`store-review.md`](store-review.md)).

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
- Push (APNs / FCM) — send helper is wired; `FEATURE_PUSH` stays `0` until Firebase + APNs exist. See `docs/push.md`.
- Shipping a production AAB/IPA from CI.
- Inventing an App Store numeric ID. In-app review + write-review links: [`store-review.md`](store-review.md).
