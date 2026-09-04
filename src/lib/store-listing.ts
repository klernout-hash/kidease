/** Copy + metadata to paste into App Store Connect and Google Play Console. */

export const STORE = {
  name: "KidEase",
  subtitle: "Licensed childcare nearby",
  subtitleFr: "Garde permise près de chez vous",
  bundleId: "ca.daycarenearme.app",
  version: "1.0.0",
  build: "1",
  category: "Lifestyle",
  secondaryCategory: "Education",
  playCategory: "PARENTING",
  ageRating: "4+",
  price: "Free",
  privacyPolicyPath: "/privacy",
  supportPath: "/support",
  termsPath: "/terms",
  cookiesPath: "/cookies",
  keywords:
    "daycare,childcare,Canada,licensed,preschool,infant,$10-a-day,garde,garderie,province",
  /** Google Play short description — max 80 characters. */
  shortDescription: "Find licensed Canadian daycares by km radius. Fees, spots, enrolment.",
  shortDescriptionFr: "Trouvez des garderies permises au Canada. Frais, places, inscription.",
  description: `KidEase helps Canadian parents find licensed childcare within a kilometre radius they choose.

Search from GPS or a postal code. See monthly parent fees (including Manitoba $10-a-day funded spaces), open spots, hours, languages, and a street-level storefront photo of the building.

Request a spot, message the centre, and pay a first-month deposit in-app. Providers manage listings, capacity, and family conversations from the same app.

This directory covers licensed centres in every Canadian province and territory, sourced from provincial and territorial registries. Listings show the building storefront from street level.

What you can do
• Set a search radius in kilometres (5, 10, 15, 25, 50, or custom)
• Switch map and list views
• Filter by infant, toddler, or preschool
• Save centres, add children, and send enrolment requests
• Message educators and join a parent-initiated video check-in
• Pay deposits by card, Apple Pay, Google Pay, PayPal, or Interac e-Transfer

Child safety
KidEase is a parent and provider app — not a children’s app. Child first names and birthdates are visible only to you and to a centre you contact. We do not sell personal information. Video check-in is started by the parent; we do not livestream children.

Payments for childcare deposits are real-world services (not digital in-app purchases).

Privacy policy, terms, cookie policy, and account deletion live in the app.`,
  descriptionFr: `KidEase aide les parents canadiens à trouver une garde permise dans un rayon en kilomètres.

Cherchez par GPS ou code postal. Voyez les frais mensuels (y compris les places financées 10 $ par jour au Manitoba), les places ouvertes, les heures, les langues et une photo aérienne du bâtiment.

Demandez une place, écrivez au centre et versez un dépôt du premier mois. Les fournisseurs gèrent fiches, capacité et messages.

Le répertoire couvre les centres permis de chaque province et territoire, d’après les registres provinciaux.

Sécurité des enfants
Application pour parents et fournisseurs — pas une appli pour enfants. Les prénoms et dates de naissance ne sont visibles que par vous et le centre contacté. Pas de vente de données. Pas de diffusion continue d’enfants.

Les dépôts sont un service réel, pas un achat intégré numérique.`,
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
