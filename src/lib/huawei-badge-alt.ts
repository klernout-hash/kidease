/**
 * Accessible name for the black AppGallery badge.
 * The public badge file is the English lockup. French pages still name it in French.
 */
export function huaweiBadgeAlt(locale: string): string {
  return locale === "fr" ? "Découvrez-le sur AppGallery" : "Explore it on AppGallery";
}
