/** Copy + metadata to paste into App Store Connect and Google Play Console. */

export const STORE = {
  name: "KidEase",
  subtitle: "Licensed child care nearby",
  subtitleFr: "Garde permise près de vous",
  bundleId: "ca.kidease.app",
  version: "1.0.0",
  build: "1",
  category: "Lifestyle",
  secondaryCategory: "Productivity",
  playCategory: "PARENTING",
  ageRating: "18+",
  price: "Free",
  privacyPolicyPath: "/privacy",
  supportPath: "/help",
  supportEmail: "support@kidease.ca",
  termsPath: "/terms",
  cookiesPath: "/cookies",
  /**
   * Numeric App Store ID from App Store Connect for ca.kidease.app
   * (`https://apps.apple.com/app/id6827660912`).
   * Override with `VITE_APPLE_APP_STORE_ID`. An empty override keeps this id.
   */
  appleAppStoreId: "6827660912",
  /**
   * Google Play application id. Same as the Capacitor `appId`: not a made-up
   * Play listing number. Override with `VITE_PLAY_PACKAGE_NAME` only if the
   * Play package ever differs from `ca.kidease.app`.
   */
  playPackageName: "ca.kidease.app",
  keywords:
    "daycare,childcare,Canada,licensed,preschool,infant,$10-a-day,garde,garderie,province",
  /** Google Play short description: max 80 characters. */
  shortDescription: "Find licensed Canadian daycares by km radius. Fees, spots, enrolment.",
  shortDescriptionFr: "Trouvez des garderies permises au Canada. Frais, places, inscription.",
  description: `KidEase helps Canadian parents and daycare providers find licensed child care within a kilometre radius they choose.

Search from your location or a postal code. See fees, open spots, hours, and languages only when that centre has entered them. A $10-a-day label appears only when the listing data says so.

Save centres for later, including when you are offline. Share a listing. Request a tour. Message the centre. Providers manage their listing from the same app.

This directory covers licensed centres in every Canadian province and territory.

What you can do
• Set a search radius in kilometres
• Switch map and list views
• Filter by infant, toddler, or preschool age groups
• Save centres and send a tour request
• Use the bottom navigation: Search, Saved, Messages, Account

Adults only
KidEase is for parents and daycare providers. Accounts are 18+. It is not in the Kids category.

Nothing is sold inside the app.
Support: support@kidease.ca

Privacy policy, terms, and account deletion are in the app.`,
  descriptionFr: `KidEase aide les parents et les garderies du Canada à trouver une garde permise dans un rayon en kilomètres.

Cherchez par position ou code postal. Les frais et les places s’affichent seulement si le centre les a inscrits.

Enregistrez des centres, même hors ligne. Partagez une fiche. Demandez une visite. Écrivez au centre.

Adultes seulement
KidEase est pour les parents et les garderies. Les comptes sont 18 ans et plus. Ce n’est pas une catégorie Enfants.

Rien ne se vend dans l’appli.
Soutien : support@kidease.ca

Politique de confidentialité, conditions et suppression du compte sont dans l’appli.`,
  ageRatingAnswers: {
    madeForKids: false,
    unrestrictedWebAccess: false,
    gambling: false,
    violence: false,
    sexualContent: false,
    userGeneratedContent: true,
    ugcModeration: "Centres are licensed listings. Parent messages are private to the family and centre. Report via Support.",
    location: "used to search nearby centres; not shared with other parents",
    camera: "optional, parent-initiated video check-in only",
  },
} as const;
