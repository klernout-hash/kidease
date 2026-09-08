/**
 * Public KidEase social profiles. Header / footer links only —
 * not Facebook Login or Instagram OAuth.
 *
 * Facebook: Kyle's KidEase Page (West St. Paul MB). The confirmed share
 * link https://www.facebook.com/share/181mPmxkyK/ canonicalizes to this
 * vanity. The old mixed-case Kidease vanity and the legacy numeric Page
 * id are the wrong Page.
 */
export const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/kideasecanada/";
export const FACEBOOK_PROFILE_URL = "https://www.facebook.com/KidEaseApp/";

export type SocialNetwork = "instagram" | "facebook";

export type SocialProfile = {
  network: SocialNetwork;
  href: string;
  labelKey: "socialInstagram" | "socialFacebook";
};

export const SOCIAL_PROFILES: readonly SocialProfile[] = [
  { network: "instagram", href: INSTAGRAM_PROFILE_URL, labelKey: "socialInstagram" },
  { network: "facebook", href: FACEBOOK_PROFILE_URL, labelKey: "socialFacebook" },
];
