# Store flavours and isolation

Each store gets its own build. A build only has its own store's SDKs. The website has no store at all.

| Target | How it is built | `STORE` constant | Push | Sign-in extras | Forbidden in the build |
| --- | --- | --- | --- | --- | --- |
| Website | Vite / Vercel | none (channel `web`) | none | Apple, Facebook | any store SDK, Amazon UI |
| Google Play | `assemblePlayRelease` / `bundlePlayRelease` | `play` | FCM | Google (hidden), Apple, Facebook | LWA, ADM, HMS |
| Samsung Galaxy Store | `assembleSamsungRelease` | `samsung` | FCM | Apple, Facebook | LWA, ADM, HMS |
| Huawei AppGallery | `assembleHuaweiRelease` / `bundleHuaweiRelease` | `huawei` | HMS Push (`FEATURE_CALL_PUSH`, off) | Apple, Facebook. Google hidden. Huawei ID off | LWA, ADM, GMS, FCM |
| Amazon Appstore | `assembleAmazonRelease` | `amazon` | ADM (`FEATURE_AMAZON_ADM`) | Login with Amazon (`FEATURE_LOGIN_AMAZON`) | GMS, FCM, HMS |
| iOS App Store | Xcode | iOS UA, no Android flavour | APNs | Sign in with Apple | LWA, ADM, GMS, HMS |
| Microsoft Store | PWA / MSIX (`KidEaseStoreMicrosoft`) | `microsoft` UA | none | Apple, Facebook | LWA, ADM |

## The STORE constant

`android/app/build.gradle` bakes `BuildConfig.STORE` per flavour (`play`, `samsung`, `huawei`, `amazon`). It always equals `BuildConfig.FLAVOR` (unit test `AmazonDeviceTokenTest.storeConstantMatchesFlavor`). `MainActivity.applyStoreUserAgent` adds `KidEaseNative` plus the store token (`KidEaseStoreAmazon`, …) to the WebView user agent. The server reads only these tokens (`storeChannelFromSignals`). The website never has them, so it is always `web`.

## Amazon features: two gates

Login with Amazon, ADM push and the Fire kiosk need **both**:

1. **Build gate:** the amazon flavour (`KidEaseStoreAmazon` token, `BuildConfig.STORE == "amazon"`).
2. **Device gate:** `Build.MANUFACTURER` equals `Amazon` at runtime. Only then does the shell add `KidEaseAmazonDevice` (`MainActivity.withAmazonDeviceToken`).

Plus the feature flag. A Silk browser or a Fire UA on the website is never enough. See `src/lib/amazon/gate.ts`.

## SDK stripping

- `AmazonAdmPlugin` and the ADM permissions live only in `android/app/src/amazon/`. Other flavours get a no-op `StorePlugins`.
- ADM is called by reflection. No ADM jar is bundled; Fire OS provides the classes at runtime. The Play, Samsung and Huawei dex has no `com/amazon/device/messaging`.
- Google Play services and Firebase are excluded for `huawei` and `amazon` (existing `configurations` excludes, plus the `FirebaseInitProvider` manifest removal).
- HMS Push (`com.huawei.hms:push`) and `KidEaseHmsMessageService` live only in `android/app/src/huawei`. The AppGallery plugin is applied only when `agconnect-services.json` is present. That file is not in git. `FEATURE_CALL_PUSH` stays off, so the token is not registered.
- LWA runs as a server-side OAuth web flow (`/api/auth/callback/amazon`), so there is no LWA SDK in any APK.

## CI guard

`.github/workflows/store-isolation.yml` and the `android-stores` job in `.github/workflows/ci.yml` run on every PR. Together they check all six stores (Play, Samsung, Huawei, Amazon, iOS, Microsoft):

1. Runs the Android unit tests for every flavour.
2. Runs `assemble{Play,Samsung,Huawei,Amazon}Debug`.
3. Runs `node scripts/check-store-isolation.mjs`. It unzips each APK and scans `classes*.dex` and `AndroidManifest.xml` for forbidden strings (the `FORBIDDEN` table in the script). A missing APK fails the job too. An amazon APK must contain `AmazonAdmPlugin`. A huawei APK must contain `KidEaseHmsMessageService`. The same script scans the iOS project and the Microsoft manifest for Huawei, Amazon, and Firebase files.
4. Runs `scripts/store-isolation.test.mjs`. For each store it asserts the sign-in buttons and Amazon UI that the server returns: no other store's buttons, and no Amazon UI off the Amazon build or off Amazon hardware.
5. `ci.yml` also runs `bundleHuaweiRelease` and `assembleHuaweiRelease` and uploads the AAB and APK. Pull requests do not have the upload keystore, so that artifact is unsigned. `android-release.yml` signs the Play AAB, then signs `assembleAmazonRelease` and uploads it as `app-amazon-release`, then signs the Huawei artifact when `AGCONNECT_SERVICES_JSON` is set. A missing AppGallery secret skips Huawei only.

Adding a store: add a flavour with `buildConfigField STORE`, a `StorePlugins.java` in its source set, a row in `FORBIDDEN`, and a row above.
