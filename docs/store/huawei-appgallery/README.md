# Huawei AppGallery submission

Package `ca.kidease.app`. Privacy policy https://www.kidease.ca/privacy. Support support@kidease.ca.

Distribution: **Canada only**. Do not select all countries. Do not select the Chinese mainland.

Huawei ID sign-in stays off (`FEATURE_SIGNIN_HUAWEI` is not set). Huawei In-App Purchases stay off. `FEATURE_CALL_PUSH`, subscriptions, `SHOW_PAY_CTAS`, sponsored listings, and `FEATURE_PROVIDER_SUBSCRIPTIONS` stay off.

| File | What to paste |
| --- | --- |
| [listing.en.md](listing.en.md) | English name, brief introduction, full introduction |
| [listing.fr.md](listing.fr.md) | French listing |
| [age-rating.md](age-rating.md) | Age questionnaire. Expected rating 18+ |
| [data-and-permissions.md](data-and-permissions.md) | Data safety and permission purposes |
| [screenshots.md](screenshots.md) | Screenshot list. Pictures are captured from the real app. |
| [icon-216.png](icon-216.png) | 216 × 216 app icon |
| [reviewer-notes.md](reviewer-notes.md) | Reviewer notes. No password in the repo. |

Parents can search, save, and message at no charge. Daycares use the tools during the free founding period. KidEase is a private company. It is not a government service.

## Build

`android-release.yml` (manual) builds a signed Play AAB and uploads the `app-release-aab` artifact, then runs `assembleAmazonRelease` and uploads the signed `app-amazon-release` APK, before any Huawei step. Both are signed with the existing upload keystore secrets. If `AGCONNECT_SERVICES_JSON` is set, that job writes `agconnect-services.json` into the huawei source set, then runs `bundleHuaweiRelease` and `assembleHuaweiRelease`. If that secret is missing, the Huawei build step is skipped with a warning and the Play and Amazon artifacts stay. The file is not committed.

Pull-request CI (`android-stores` in `ci.yml`) builds all four Android debug APKs, scans them, scans the iOS project and the Microsoft manifest, and uploads an unsigned Huawei AAB and APK named `app-huawei-release`.

## What Kyle still does

1. In AppGallery Connect, create the app for **10037493 MANITOBA LTD.** Package name `ca.kidease.app`. D-U-N-S **243380273**. Support **support@kidease.ca**.
2. Turn **Push Kit** on for that app. Leave **Huawei ID** off. Leave **In-App Purchases** off.
3. Download `agconnect-services.json` from that app. Do not commit it. Base64-encode the file and save it as the GitHub Actions secret `AGCONNECT_SERVICES_JSON`.
4. Signing. Use the existing Play upload keystore (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), or create a separate AppGallery upload certificate. Register the certificate fingerprint AppGallery Connect shows. Do not commit the keystore or the passwords.
5. Run the **Android release** workflow. Download the `app-huawei-release` artifact (`app-huawei-release.aab`, and the APK if the portal asks for one).
6. Upload the AAB. Set distribution to **Canada only**. Paste the English and French listing, the age-rating answers, and the data and permission declarations. Privacy URL: https://www.kidease.ca/privacy
7. Upload `icon-216.png`. Capture the screenshots in [screenshots.md](screenshots.md) from the real app and upload 3 to 5 of them at 1080 × 1920.
8. Seed the reviewer accounts (`docs/store-review-notes.md`). Paste the emails and the password into the AppGallery reviewer notes only.
9. Submit. Do not merge the pull request until you say so.
