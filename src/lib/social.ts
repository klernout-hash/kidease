/**
 * Public KidEase social profiles. Header / footer links only —
 * not Facebook Login or Instagram OAuth.
 */
export const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/kideasecanada/";
export const FACEBOOK_PROFILE_URL = "https://www.facebook.com/Kidease/";
/** Meta Page asset id — fallback if the vanity URL is retired. */
export const FACEBOOK_PAGE_ID = "107540987354875";
export const FACEBOOK_PAGE_ID_URL = `https://www.facebook.com/${FACEBOOK_PAGE_ID}`;

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
