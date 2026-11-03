# Huawei AppGallery submission

This is the checklist for the `huawei` Android flavour (`ca.kidease.app`). Do not merge a store listing from this file. Kyle submits it in AppGallery Connect.

The Huawei build does not contain Google Play services, Play in-app review, Play in-app update, Firebase, or the Google Maps SDK. The map is OpenFreeMap in the WebView. Huawei ID sign-in stays off. Paid plans stay off. Call push is compiled in and is not sent while `FEATURE_CALL_PUSH` is off.

Do not commit `agconnect-services.json`, the upload keystore, or any of the secret values below. Do not paste those values into a pull request or a chat.

## What is already in the repo

| Item | Where |
| --- | --- |
| Package name | `ca.kidease.app` |
| Flavour | `huawei` |
| Release AAB | `./gradlew bundleHuaweiRelease` → `android/app/build/outputs/bundle/huaweiRelease/app-huawei-release.aab` |
| Release APK | `./gradlew assembleHuaweiRelease` → `android/app/build/outputs/apk/huawei/release/app-huawei-release.apk` |
| versionCode | `3`, unless `HUAWEI_VERSION_CODE` or `-PhuaweiVersionCode` is set |
| Push class | `android/app/src/huawei/java/ca/kidease/app/KidEaseHmsMessageService.java` |
| Push library | `com.huawei.hms:push` on `huaweiImplementation` only |
| AppGallery Connect plugin | Applied only when `android/app/src/huawei/agconnect-services.json` exists |

Play, Samsung, and Amazon do not get the HMS library. CI fails if Google, Play, or Firebase classes show up in the Huawei APK, and if HMS classes show up in the other three.

## 1. Create the app

1. Sign in at [AppGallery Connect](https://developer.huawei.com/consumer/en/service/josp/agc/index.html) with the enterprise account for **10037493 MANITOBA LTD.** (D-U-N-S **243380273**, Winnipeg, support **support@kidease.ca**).
2. **My projects** → **Add project**. Name it KidEase.
3. **Add app**. Platform **Android**. App name **KidEase**. Package name **`ca.kidease.app`**. Use that package name exactly. Do not create a second package.
4. Leave Account Kit and Huawei IAP off. Do not turn on Huawei ID sign-in.

## 2. Enable Push Kit

1. In the project, open **Growing** → **Push Kit** → **Enable**.
2. Accept the Push Kit agreement.
3. Keep the data-storage region AppGallery Connect offers. Do not switch it later.
4. This only lets a future build receive tokens. `FEATURE_CALL_PUSH` stays off, so KidEase does not send call pushes yet. Do not write “notifications are live” in the store listing.

## 3. Download `agconnect-services.json`

1. **Project settings** → **General information**.
2. On the Android app card for `ca.kidease.app`, download **agconnect-services.json**.
3. For a local build, put that file at `android/app/src/huawei/agconnect-services.json`. It is gitignored. Do not commit it.
4. The same card shows the App ID. The json also has `client.app_id`, `client.client_id`, and `client.client_secret`. Those three values are the secrets in the next step. Do not copy them into this doc.

The Gradle plugin `com.huawei.agconnect` runs only when that file is present. A build without the file still succeeds. Push will not register on a phone until the file is in the build.

## 4. GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **Secrets**.

| Secret | Value |
| --- | --- |
| `AGCONNECT_SERVICES_JSON` | One line of base64 for the whole json file. Linux: `base64 -w 0 agconnect-services.json`. Mac: `base64 -i agconnect-services.json \| tr -d '\n'`. |
| `HMS_APP_ID` | `client.app_id` from the json |
| `HMS_CLIENT_ID` | `client.client_id` from the json |
| `HMS_CLIENT_SECRET` | `client.client_secret` from the json |

The Android release workflow already uses `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Do not create a new keystore in git.

Optional variable (not a secret): **Variables** → `HUAWEI_VERSION_CODE`. Leave it unset. The Huawei build then uses versionCode **3**. Set it only if AppGallery rejects 3 because a higher code was already uploaded. Do not change the shared Play `versionCode` for that.

`FEATURE_SIGNIN_HUAWEI` stays `0` in `.env.example`. Do not set it to `1`. `FEATURE_CALL_PUSH` stays unset.

## 5. Signing

Use the same upload keystore as Play. It already lives in 1Password and in the four `ANDROID_KEYSTORE_*` secrets.

**Choice A — AppGallery signs the app (use this).** Same idea as Play App Signing.

1. On the machine that has the keystore, export the certificate only (this is not the private key):

   ```bash
   keytool -exportcert -alias kidease -keystore kidease-upload.jks -rfc -file upload_certificate.pem
   ```

2. AppGallery Connect → the app → **App information** → **App signing**.
3. Choose the option where AppGallery Connect manages the app signature.
4. Upload `upload_certificate.pem` as the upload certificate.
5. Upload the AAB from the `app-huawei-release-aab` artifact. Huawei re-signs what users install.

**Choice B — upload a signed APK.** Use this only if the portal asks for an APK. Download `app-huawei-release-apk`. That APK is signed by the Android release workflow with the upload keystore. Do not make a second keystore.

Do not send the keystore password to anyone but the store upload step. Do not commit `upload_certificate.pem` unless you mean to publish the certificate.

## 6. Build and upload

GitHub → **Actions** → **Android release** → **Run workflow**.

When it finishes, download:

| Artifact | File inside it | Use |
| --- | --- | --- |
| `app-release-aab` | `app-play-release.aab` | Play only. Do not upload this one to AppGallery. |
| `app-huawei-release-aab` | `app-huawei-release.aab` | AppGallery, choice A |
| `app-huawei-release-apk` | `app-huawei-release.apk` | AppGallery, choice B |

Local commands, if you are not using Actions:

```bash
cd android
./gradlew bundleHuaweiRelease assembleHuaweiRelease
```

Then in AppGallery Connect:

1. Open the app → **Distribute** → **Version information**.
2. Create a draft (Software version).
3. Upload `app-huawei-release.aab` (choice A) or `app-huawei-release.apk` (choice B).
4. Confirm the package is `ca.kidease.app` and the version code is 3 (or the `HUAWEI_VERSION_CODE` you set).

## 7. Listing, then submit

- Privacy policy: `https://www.kidease.ca/privacy`
- Support email: `support@kidease.ca`
- Age **18+**. Not a kids app and not an education-for-children category.
- Screenshots from real KidEase screens, English and French if both listings exist. Do not draw fees, ratings, or open spots.
- Say that child health details (allergies, medications, medical notes) can be stored for a parent, and that this build does not send them to Google.

Permission purposes. Paste these if the form asks why the app uses each one. French is in `android/app/src/huawei/res/values-fr/strings.xml`.

| Permission | English purpose |
| --- | --- |
| Location | KidEase uses your location only while you search so we can show licensed daycares near you. Location is not used in the background. |
| Camera | KidEase uses the camera for video calls with a daycare. The camera stays off until you join a call. |
| Microphone | KidEase uses the microphone for voice and video calls with a daycare. The microphone stays off until you join a call. |
| Notifications | KidEase sends a notification when a daycare messages you or when a call comes in. |

Review notes you can paste:

> This version does not sell plans or upgrades. Google Play services are not in the app. Huawei ID sign-in is off. Call notifications are not sent yet. The map uses OpenFreeMap, not Google Maps and not Huawei Map Kit.

Submit the draft for review. Do not promise the iOS or Android apps as already in those stores. Phone apps are not in the stores yet. SMS and chat are not live. If a field asks, label them “coming soon”.

## Stay off

- `FEATURE_SIGNIN_HUAWEI` — Huawei ID button stays hidden.
- Huawei IAP and any paid product — parents do not see plan prices or Stripe in this build.
- `FEATURE_CALL_PUSH` — the HMS service is in the binary, and the server sends nothing until this flag is turned on after a real-device test.
- `google-services.json` under `android/app/src/huawei/`.
- A committed `agconnect-services.json`.
