# Microsoft Store, Samsung Galaxy Store, and Huawei AppGallery

KidEase is not in these stores yet. This file is the packaging and policy note for **10037493 MANITOBA LTD.** (Winnipeg, D-U-N-S **243380273**, support **support@kidease.ca**). It does not open the accounts and it does not upload a build.

Apple and Google Play stay on their own pull request. This work sits on top of that branch. After that pull request merges, retarget this one to `main`.

The website at [https://www.kidease.ca](https://www.kidease.ca) is unchanged for a normal browser. `/get-app` still says the phone apps are coming soon.

Application id for the Android flavours: `ca.kidease.app`. One id for Play, Galaxy Store, and AppGallery.

## Which stores can use Stripe

| Store | In-app Stripe for KidEase digital plans | What this repo does in v1 |
| --- | --- | --- |
| Microsoft Store (PWA) | Allowed by store policy | Payments off until every store has approved v1 |
| Samsung Galaxy Store | Allowed by store policy | Payments off until every store has approved v1 |
| Huawei AppGallery | Not allowed for digital goods | Payments off |
| Apple App Store / Google Play | Not allowed in v1 | Payments off |

`STORE_PAYMENTS_ENABLED` in `src/lib/native-entitlements.ts` is the switch. Every store is `false` in v1. A later version turns one store back on by setting that store to `true`. A normal browser is not in the list, so checkout on kidease.ca stays on.

Childcare fees printed on a listing are directory facts. Checkout buttons are a different thing. In every store app, checkout stays closed, including a childcare bill, until that store has its own billing. A centre that already paid on the website still unlocks after sign-in.

Nothing here adds Apple IAP, Google Play Billing, Microsoft IAP, Samsung IAP, or Huawei IAP. `parentPlusIap` stays null.

## Microsoft Store

### Policy

[Microsoft Store Policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies) **10.8.1** (policies 7.20, published 15 September 2026, effective 22 October 2026):

Games and Xbox products must use Microsoft’s purchase API. **Non-game products on PC may use a secure third-party purchase API or the Microsoft Store purchase API** for digital goods used inside the product.

KidEase is not a game. It is a childcare directory for parents and daycare providers. Store policy allows Stripe in this package. v1 still hides prices and Stripe here, the same as the other store apps, until every store has approved v1.

When a later version turns Microsoft payments on, follow **10.8.2**:

- The pay screen shows who takes the payment. Stripe Checkout already shows Stripe.
- The person is signed in, and they confirm the payment. KidEase sign-in plus Stripe do this.
- Card numbers are not typed into KidEase. They stay on Stripe, which is the PCI DSS path. Do not add a custom card form.
- In Partner Center, say that this product uses a third-party purchase API.
- If a future build required payment before the app could be used, that step would have to be inside the app. KidEase does not charge to install. After install, opening Stripe is fine.

A home-screen install of the normal site is not the Microsoft Store app. Only the packaged start URL is.

### Package

The live site is the app. [PWABuilder](https://www.pwabuilder.com) wraps it as an MSIX for Partner Center. Do not package `localhost`.

- Site manifest (browsers and “Add to home screen”): `public/manifest.webmanifest`, start URL `/`.
- Store manifest: `public/manifest.microsoft.webmanifest`, start URL `/?store=microsoft`.
- Icons already on the site: 192, 512, and a 512 maskable icon.
- Service worker `public/sw.js` (`kidease-shell-v8`) serves `public/offline.html` only for a real network failure or when the browser is offline. A 401 is not offline. It does not cache HTML, `/api/`, or `/_serverFn`. Hashed `/assets/` stay network-only. A standalone window and the Microsoft channel register it on load. The iOS and Android shells do not.
- The page at `/?store=microsoft` links `manifest.microsoft.webmanifest` (also when the user agent is `KidEaseStoreMicrosoft` or the `ke_store=microsoft` cookie is already set). A normal visit keeps `manifest.webmanifest`.
- The first launch sets a `ke_store=microsoft` cookie (`Path=/; Max-Age=31536000; SameSite=Lax; Secure` on https) so later pages still know this is the Store package. Prices and Stripe stay hidden on that package. The cookie is set only when the user agent is not `KidEaseNative`. An iOS or Play WebView ignores `?store=microsoft` and clears a leftover `ke_store` cookie.

PWABuilder steps:

1. Open [https://www.pwabuilder.com](https://www.pwabuilder.com).
2. Enter `https://www.kidease.ca/?store=microsoft`. That page links the Microsoft manifest.
3. Confirm the report uses `manifest.microsoft.webmanifest` and start URL `/?store=microsoft`.
4. Package **Windows** as MSIX.
5. Publisher identity (the `CN=` name) comes from Partner Center. Do not invent it.
6. Upload the MSIX. Mark the age rating **18+**. Audience is parents and daycare providers, not a kids category.
7. Privacy policy: `https://www.kidease.ca/privacy`.
8. Support: `support@kidease.ca`.
9. In the submission, note the third-party purchase API (Stripe).

### Partner Center account (Kyle)

1. Sign up at [Partner Center](https://partner.microsoft.com/dashboard) as a company, not a personal account.
2. Legal name: **10037493 MANITOBA LTD.**
3. D-U-N-S: **243380273**. Address: Winnipeg. Microsoft uses this for the company check.
4. Create the app. Product type: not a game.
5. Copy the publisher display name and the package identity into the PWABuilder Windows step.
6. Add English and French store copy, screenshots, and a 16:9 or square icon set from Partner Center’s current size list. The site icons are enough for the PWA. Partner Center still wants its own screenshots.

## Samsung Galaxy Store

### Policy

[Samsung Galaxy Store FAQ](https://developer.samsung.com/galaxy-store/faq.html): Samsung has always supported third-party payment systems.

[Distribution guide](https://developer.samsung.com/galaxy-store/distribution-guide.html) (section 1.1.10): Samsung In-App Purchase is **recommended**, not required, for non-game apps.

The Galaxy Store build is identifiable, and v1 hides prices and Stripe in it. A normal browser still shows checkout.

### Build

Same application id as Play. From `android/`:

```bash
./gradlew bundleSamsungRelease
```

AAB: `android/app/build/outputs/bundle/samsungRelease/app-samsung-release.aab`

`MainActivity` writes the user-agent on the WebView after the bridge starts. The Samsung asset config already asks Capacitor to append `KidEaseNative KidEaseStoreSamsung`, so the first request is the Galaxy Store channel. If that token is missing, the activity sets it and reloads. It does not swallow the failure. The iOS app and the Play flavour strip that token and do not set a `ke_store=samsung` cookie. A `?store=samsung` link does not switch them. The site sees the Samsung token first and hides checkout. The Play token hides checkout as well.

The Play review sheet and any `play.google.com` listing link stay off in this build. Rate KidEase sends the parent to `/get-app` until a Galaxy Store listing exists. Do not invent that URL.

Play’s `google-services.json` may be used for this flavour if you want FCM. Do not commit that file.

### Seller account (Kyle)

1. [Samsung Seller Portal](https://seller.samsungapps.com).
2. Company: **10037493 MANITOBA LTD.**, D-U-N-S **243380273**, Winnipeg.
3. Create the app with package name `ca.kidease.app`.
4. Upload the Samsung AAB (or the APK from `assembleSamsungRelease` if the portal asks for an APK). Sign with the upload keystore. Do not commit it.
5. Content rating, privacy policy `https://www.kidease.ca/privacy`, support `support@kidease.ca`.
6. Age **18+**. Not a kids app.
7. Screenshots and the icon sizes in the current seller guide. Typical set: 512 icon, phone screenshots, a feature graphic. Use real KidEase screens. Do not invent fees or ratings in the pictures.
8. You do not have to turn on Samsung IAP for this version.

## Huawei AppGallery

### Policy

Huawei’s AppGallery rules for digital goods require **Huawei In-App Purchases**. A developer’s own Stripe checkout is not the path for plans, upgrades, or other digital items sold inside the app. Paid distribution in Canada goes through Huawei’s payment kit (bank card, mobile payment, Huawei Points, or other methods **inside Huawei IAP**), not a separate Stripe account.

This build does **not** add Huawei IAP. That needs a merchant agreement and credentials Kyle does not have in the repo. Until that exists, the Huawei flavour **hides KidEase prices, upgrades, and Stripe** the same way the Apple and Play shells do. There is no “pay on the website” link.

Listing fees that are facts about a daycare can still show. The pay button does not.

### No Google Play Services

Huawei phones do not ship Google Play Services. This flavour degrades on purpose. No new Huawei SDK is compiled, because HMS Push and Map Kit need an `agconnect-services.json` that must not be committed, and the app has to open without it.

| Feature | Huawei build |
| --- | --- |
| Email and password sign-in | Stays |
| Facebook sign-in | Stays when `FEATURE_FACEBOOK_LOGIN` and the Facebook env vars are set |
| Sign in with Apple | Web redirect only (the native Apple sheet is iOS) |
| Google sign-in | Hidden. The button is not rendered. |
| FCM / Capacitor push | Not started. `registerPushDevice` returns disabled. `FirebaseInitProvider` is removed so launch does not crash. |
| HMS Push | Not in this build. Later, after Kyle adds AppGallery Connect and `agconnect-services.json`. |
| Google Maps and Places | Not loaded. Search by city still uses the local city list. The map panel says Google Maps is not on this device. |
| “Near me” | Uses the phone location through the WebView, not the Google location plugin. If the phone denies location, search by city still works. |
| Stripe | Blocked |

The user-agent token is `KidEaseStoreHuawei`, set in `android/app/src/huawei/assets/capacitor.config.json` and checked again on the WebView. A Huawei debug build crashes if that token is missing, so a broken build cannot fall through to the Play channel. A release build logs the same error. `google-services.json` must not be applied to this variant. The Gradle task that processes it is turned off for the Huawei flavour, and `android/app/src/huawei/AndroidManifest.xml` removes `FirebaseInitProvider`.

The Huawei flavour also drops `com.google.android.gms:play-services-location`, `com.google.android.play:review`, `com.google.firebase:firebase-messaging`, and the rest of `com.google.android.gms`, `com.google.android.play`, and `com.google.firebase`. Play and Samsung still compile geolocation, in-app review, and push. The AppGallery binary does not. There is no in-app review sheet on Huawei. Location uses the WebView geolocation API. HMS Location is only used if a later shell sets `window.HMSLocation`. No HMS SDK is compiled in. The first HTML does not dns-prefetch map tiles on Huawei. Other channels prefetch `tiles.openfreemap.org`. The website content security policy allows `tiles.openfreemap.org` and `tiles.maps.eox.at` for the map. It does not allow `maps.googleapis.com`. Huawei does not load that map. The Plans row in the phone menu stays hidden, the same as Apple and Play.

Trade-off to tell parents in the store listing: message alerts are not delivered on this Huawei build yet. Saved centres in the browser cache are not the same as the Capacitor offline shortlist. City search is the way to find a daycare.

### Build

```bash
cd android
./gradlew bundleHuaweiRelease
```

AAB: `android/app/build/outputs/bundle/huaweiRelease/app-huawei-release.aab`

Do not put `google-services.json` under `android/app/src/huawei/`. Do not commit `agconnect-services.json`.

### AppGallery Connect account (Kyle)

1. [Huawei Developer](https://developer.huawei.com/consumer/en/) → AppGallery Connect. Enterprise account for **10037493 MANITOBA LTD.**
2. D-U-N-S **243380273**, Winnipeg, support **support@kidease.ca**.
3. Create the app. Package name `ca.kidease.app`.
4. Upload the Huawei AAB. Register the signing certificate Huawei shows. Do not send the keystore password to anyone but the store.
5. Age **18+**. Not a kids or education-for-children category.
6. Privacy policy `https://www.kidease.ca/privacy`. Say that child health details (allergies, medications, medical notes) can be stored for a parent, and that this Huawei build does not send them to Google Maps.
7. In the review notes, say digital plans are not sold in this build and Google services are not used.
8. Leave Huawei IAP, HMS Push, and Map Kit off until a later version. Do not promise them as live.

## Play flavour (so the other two do not change Play)

```bash
cd android
./gradlew bundlePlayRelease
```

AAB: `android/app/build/outputs/bundle/playRelease/app-play-release.aab`

The GitHub workflow job is still named `bundleRelease`. It runs `bundlePlayRelease`. `STORE_UA_TOKEN` is empty on Play. Play and iOS never send `KidEaseStoreSamsung`. Stripe stays hidden.

## Required assets

| Asset | Microsoft | Samsung | Huawei |
| --- | --- | --- | --- |
| Icon 192 and 512 | On the site, including maskable 512 | Seller portal also wants its own 512 | AppGallery icon set from the current guide |
| Screenshots | Partner Center sizes, EN and FR if both listings exist | Phone screenshots from the seller guide | Phone screenshots from AppGallery Connect |
| Privacy policy URL | `https://www.kidease.ca/privacy` | same | same |
| Support email | `support@kidease.ca` | same | same |
| Age | 18+ | 18+ | 18+ |
| Package | MSIX from PWABuilder | `app-samsung-release.aab` | `app-huawei-release.aab` |
| Signing | Partner Center publisher identity | Upload keystore (not committed) | Upload certificate registered in AppGallery Connect |

Do not draw fake fees, ratings, or open spots into screenshots.

## Submission checklist

### Microsoft

- [ ] Partner Center company account for 10037493 MANITOBA LTD. is verified
- [ ] D-U-N-S 243380273 accepted
- [ ] PWABuilder MSIX uses `manifest.microsoft.webmanifest`
- [ ] Publisher `CN=` pasted from Partner Center, not typed from memory
- [ ] Third-party purchase API (Stripe) noted on the submission
- [ ] Age 18+, not a kids product
- [ ] Privacy policy and support email set
- [ ] Offline page checked: airplane mode shows “You’re offline” and a way back, and does not show a stale app shell
- [ ] A signed-in parent in the Microsoft package does not see prices or Stripe. The same parent in a normal browser still does.
- [ ] Store listing does not say the iOS or Android apps are already in those stores

### Samsung

- [ ] Seller account for 10037493 MANITOBA LTD. is verified
- [ ] `bundleSamsungRelease` uploaded
- [ ] Package name `ca.kidease.app`
- [ ] A signed-in parent in the Galaxy Store build does not see plan prices or Stripe. The same parent in a normal browser still does.
- [ ] Content rating and privacy policy set
- [ ] Age 18+
- [ ] No Samsung IAP product created for this version

### Huawei

- [ ] Enterprise developer account for 10037493 MANITOBA LTD. is verified
- [ ] `bundleHuaweiRelease` uploaded
- [ ] The bundle was built without baking `google-services.json` into that variant
- [ ] App opens on a phone with no Google Play Services
- [ ] Google sign-in button is absent
- [ ] Map panel explains that Google Maps is not available, and city search still works
- [ ] No Stripe button and no “pay on the website” line
- [ ] Push is described as not available on this version
- [ ] Age 18+
- [ ] Huawei IAP left off until a merchant agreement exists

## What Kyle needs to provide

No secret belongs in git or in a pull request.

- Microsoft Partner Center publisher id and package identity (`CN=…`)
- Samsung Seller Portal login for 10037493 MANITOBA LTD.
- Huawei AppGallery Connect enterprise account, plus the upload certificate fingerprint Huawei displays
- The existing upload keystore, kept in 1Password (already the Play plan). A store that demands its own key gets a new keystore on Kyle’s machine, still not committed
- Store screenshots and the English and French listing text he wants on each store
- Later, only if he wants Huawei push or Huawei billing: AppGallery Connect app id, `agconnect-services.json`, and a Huawei IAP merchant agreement

Enrolment id `B7UM5AC9JQ` is an Apple enrolment id. It is not a Microsoft, Samsung, or Huawei id.
