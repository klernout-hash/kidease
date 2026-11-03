# Data and permissions (AppGallery)

Privacy policy: https://www.kidease.ca/privacy

KidEase does not sell personal information. There are no ads. Analytics start only after the person taps Allow.

## Data the app can collect

| Data | Collected in this version | Linked to the account | Why |
| --- | --- | --- | --- |
| Name and email | Yes, when the person creates an account | Yes | Sign in and messages |
| Messages between a parent and a daycare | Yes | Yes | Tours and questions |
| Child profile, including allergies, medications, and medical notes | Yes, if a parent types them | Yes | The parent's own care notes. Not sent to analytics. |
| Search and saved centres | Yes | Yes | Find licensed daycares |
| Location while searching | Only after the person allows it. Not in the background. | Yes, for that search | Show centres near them. City search works without it. |
| Photos a daycare uploads | Yes, when a daycare adds a photo | Yes, to that listing | The listing photo. No photo is invented. |
| Camera and microphone during a call | Only while the call screen is open. Calls are not recorded. | No recording is stored | Voice and video tours |
| Push token (HMS) | No. `FEATURE_CALL_PUSH` is off, and the AppGallery file is not in the binary until Kyle adds it. | — | A later call ring. Not this version. |
| Advertising ID | No | No | KidEase does not show ads |

## Permissions in the Huawei manifest

These are declared. Location, camera, microphone, and notifications each have an English string and a French string in `android/app/src/huawei/res`.

| Permission | String name | English rationale |
| --- | --- | --- |
| Approximate and precise location | `location_permission_rationale` | KidEase uses your location only while you search so we can show licensed daycares near you. Location is not used in the background. |
| Camera | `camera_permission_rationale` | KidEase uses the camera only while a video call or video tour is open. The camera is not used in the background. |
| Microphone | `microphone_permission_rationale` | KidEase uses the microphone only while a voice or video call is open. Calls are not recorded. |
| Notifications | `notifications_permission_rationale` | KidEase uses notifications for an incoming call. KidEase does not send ads. |

French strings are in `android/app/src/huawei/res/values-fr/strings.xml`.

Internet is required to open the site. HMS Push Kit also adds signature permissions so a later call ring can be delivered. Those are not shown to the user. This version does not ask for notification permission, because the call ring is off.

The Huawei build removes phone-state, contacts, SMS, storage, background location, and the list of other apps if a library tries to add them.

Google Play services, Firebase, and Google sign-in are not in this build.
