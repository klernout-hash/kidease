/**
 * Copy for Google ratings and the verified-enrolment review prompt.
 * Kept out of copy.ts so a later merge does not fight the giant dictionary.
 * No invented ratings. No em dashes.
 */

export type TrustSurfaceCopy = {
  googleRating: string;
  verifiedReviewTitle: string;
  verifiedReviewLead: string;
  writeVerifiedReview: string;
  createListing: string;
  pathTitle: string;
  stepLicence: string;
  stepFirst: string;
  stepFunding: string;
  stepList: string;
};

const EN: TrustSurfaceCopy = {
  googleRating: "Google rating",
  verifiedReviewTitle: "Verified enrolment review",
  verifiedReviewLead:
    "Your child is enrolled here. Write a short review. It shows after KidEase publishes it. We do not invent star ratings.",
  writeVerifiedReview: "Write a verified review",
  createListing: "Create your KidEase listing",
  pathTitle: "Your path, step by step",
  stepLicence: "Read who issues the licence in your province.",
  stepFirst: "Take the first official step on the government page.",
  stepFunding: "Read the funding page. KidEase does not award these grants.",
  stepList: "When you have a licence, create your KidEase listing.",
};

const FR: TrustSurfaceCopy = {
  googleRating: "Note Google",
  verifiedReviewTitle: "Avis après inscription vérifiée",
  verifiedReviewLead:
    "Votre enfant est inscrit ici. Écrivez un court avis. Il s’affiche après publication par KidEase. Nous n’inventons pas de note.",
  writeVerifiedReview: "Écrire un avis vérifié",
  createListing: "Créez votre fiche KidEase",
  pathTitle: "Votre chemin, étape par étape",
  stepLicence: "Lisez qui délivre le permis dans votre province.",
  stepFirst: "Faites la première démarche sur la page officielle.",
  stepFunding: "Lisez la page de financement. KidEase n’accorde pas ces subventions.",
  stepList: "Quand vous avez un permis, créez votre fiche KidEase.",
};

export function trustSurfaceCopy(locale: string): TrustSurfaceCopy {
  return locale === "fr" ? FR : EN;
}
