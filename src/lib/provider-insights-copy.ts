/**
 * Insights page copy. English and French only. Grade 6, short sentences.
 * Nav labels live in copy-en / copy-fr so the desk menu can translate them.
 */

export type InsightsCopy = {
  title: string;
  lead: string;
  next: string;
  rangeLabel: string;
  range7: string;
  range30: string;
  range90: string;
  range12: string;
  centreLabel: string;
  allCentres: string;
  offTitle: string;
  offBody: string;
  home: string;
  claimTitle: string;
  claimBody: string;
  claim: string;
  loading: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  notYours: string;
  listingTitle: string;
  listingBody: string;
  views: string;
  saves: string;
  inquiries: string;
  requests: string;
  conversion: string;
  conversionValue: string;
  conversionNone: string;
  listingEmpty: string;
  openListings: string;
  viewsChart: string;
  requestsChart: string;
  responseTitle: string;
  responseBody: string;
  yourReply: string;
  areaReply: string;
  areaNote: string;
  areaHidden: string;
  noReply: string;
  hours: string;
  oneHour: string;
  days: string;
  underHour: string;
  replies: string;
  waitTitle: string;
  waitBody: string;
  waitEmpty: string;
  waitCount: string;
  avgWait: string;
  daysShort: string;
  ageInfant: string;
  ageToddler: string;
  agePreschool: string;
  ageAny: string;
  openRequests: string;
  enrolTitle: string;
  enrolBody: string;
  enrolled: string;
  capacity: string;
  capacityPartial: string;
  capacityMissing: string;
  openSpots: string;
  spotsMissing: string;
  spotsPartial: string;
  enrolChart: string;
  openChart: string;
  enrolEmpty: string;
  updateListings: string;
  tourTitle: string;
  tourBody: string;
  booked: string;
  showRate: string;
  tourEnrol: string;
  tourAsked: string;
  tourEmpty: string;
  tourTimes: string;
  showUnknown: string;
  attendTitle: string;
  attendBody: string;
  attendEmpty: string;
  present: string;
  checkIns: string;
  attendChart: string;
  staffTitle: string;
  staffBody: string;
  ratioEmpty: string;
  certEmpty: string;
  certNone: string;
  staffEmpty: string;
  certTitle: string;
  expires: string;
  daysLeft: string;
  ratioChart: string;
  reviewsTitle: string;
  reviewsBody: string;
  reviewsEmpty: string;
  average: string;
  reviewCount: string;
  reviewChart: string;
  chartEmpty: string;
};

const en: InsightsCopy = {
  title: "Insights",
  lead: "KidEase Insights shows how families use your listing. The numbers come from your centres only.",
  next: "Choose a date range.",
  rangeLabel: "Date range",
  range7: "7 days",
  range30: "30 days",
  range90: "90 days",
  range12: "12 months",
  centreLabel: "Centre",
  allCentres: "All centres",
  offTitle: "Insights are off",
  offBody: "This page stays hidden until KidEase turns it on. Your other desk pages stay the same.",
  home: "Back to today",
  claimTitle: "No centre on this account yet",
  claimBody: "Claim your listing to see views, requests, and tours.",
  claim: "Claim a centre",
  loading: "Loading your numbers",
  errorTitle: "We could not load insights",
  errorBody: "Check your connection and try again.",
  retry: "Try again",
  notYours: "That centre is not on this account.",
  listingTitle: "Listing",
  listingBody: "Views, saves, inquiries, and spot requests in this range.",
  views: "Views",
  saves: "Saves",
  inquiries: "Inquiries",
  requests: "Requests",
  conversion: "Views that became requests",
  conversionValue: "{requests} of {views} views ({pct})",
  conversionNone: "No views in this range, so there is no rate yet.",
  listingEmpty: "No views, saves, inquiries, or requests in this range.",
  openListings: "Open listings",
  viewsChart: "Views over time",
  requestsChart: "Requests over time",
  responseTitle: "Reply time",
  responseBody: "Hours from a parent's first message to your first reply.",
  yourReply: "Your median",
  areaReply: "Area average",
  areaNote:
    "Other centres in {city}. Names stay hidden. Shown only when at least 5 centres replied.",
  areaHidden:
    "The area average stays hidden until one city has replies from at least 5 other centres.",
  noReply: "No replies in this range.",
  hours: "{n} hours",
  oneHour: "1 hour",
  days: "{n} days",
  underHour: "Under 1 hour",
  replies: "{n} replies",
  waitTitle: "Waitlist",
  waitBody:
    "Families waiting now, by age. This is the current list, not only people who joined in the range.",
  waitEmpty: "No one is on your waitlist yet.",
  waitCount: "Waiting",
  avgWait: "Average wait",
  daysShort: "{n} days",
  ageInfant: "Infant",
  ageToddler: "Toddler",
  agePreschool: "Preschool",
  ageAny: "Any age",
  openRequests: "Open requests",
  enrolTitle: "Enrolment and spots",
  enrolBody: "Children enrolled now, next to the capacity and open spots on your listing.",
  enrolled: "Enrolled",
  capacity: "Licensed capacity",
  capacityPartial: "Capacity on file for {known} of {total} centres.",
  capacityMissing: "Capacity is not on the listing yet.",
  openSpots: "Open spots",
  spotsMissing: "Open spots are not posted yet.",
  spotsPartial: "Open spots are posted for {known} of {total} centres.",
  enrolChart: "New enrolments",
  openChart: "Open spots recorded",
  enrolEmpty: "No enrolled children on file, and spots are not posted yet.",
  updateListings: "Update listings",
  tourTitle: "Tours",
  tourBody: "Booked visits, who came, and who enrolled after a tour.",
  booked: "Booked",
  showRate: "Show rate",
  tourEnrol: "Tours that enrolled",
  tourAsked: "Asked",
  tourEmpty: "No tours in this range.",
  tourTimes: "Tour times",
  showUnknown: "Not enough finished tours to show a rate.",
  attendTitle: "Attendance",
  attendBody: "Arrivals your centre recorded. Nothing is filled in for you.",
  attendEmpty: "No attendance in this range.",
  present: "Days marked here",
  checkIns: "Check-ins",
  attendChart: "Arrivals",
  staffTitle: "Staff",
  staffBody: "Ratio checks you logged, and certificates that expire in the next 90 days.",
  ratioEmpty: "No ratio checks in this range.",
  certEmpty: "No certificates expire in the next 90 days.",
  certNone: "No certificates on file.",
  staffEmpty: "No ratio checks or certificates on file.",
  certTitle: "Certificates expiring soon",
  expires: "Expires {date}",
  daysLeft: "{n} days left",
  ratioChart: "Children per staff",
  reviewsTitle: "Reviews",
  reviewsBody: "Published parent reviews only. KidEase does not add stars.",
  reviewsEmpty: "No published reviews in this range.",
  average: "Average",
  reviewCount: "Reviews",
  reviewChart: "Average rating",
  chartEmpty: "Nothing to chart in this range.",
};

const fr: InsightsCopy = {
  title: "Statistiques",
  lead: "Les statistiques KidEase montrent comment les familles utilisent votre fiche. Les chiffres viennent seulement de vos centres.",
  next: "Choisissez une période.",
  rangeLabel: "Période",
  range7: "7 jours",
  range30: "30 jours",
  range90: "90 jours",
  range12: "12 mois",
  centreLabel: "Centre",
  allCentres: "Tous les centres",
  offTitle: "Les statistiques sont désactivées",
  offBody:
    "Cette page reste cachée tant que KidEase ne l’active pas. Le reste du bureau ne change pas.",
  home: "Retour à aujourd’hui",
  claimTitle: "Aucun centre sur ce compte",
  claimBody: "Réclamez votre fiche pour voir les vues, les demandes et les visites.",
  claim: "Réclamer un centre",
  loading: "Chargement de vos chiffres",
  errorTitle: "Impossible de charger les statistiques",
  errorBody: "Vérifiez la connexion et réessayez.",
  retry: "Réessayer",
  notYours: "Ce centre n’est pas sur ce compte.",
  listingTitle: "Fiche",
  listingBody: "Vues, enregistrements, demandes et places demandées pour cette période.",
  views: "Vues",
  saves: "Enregistrements",
  inquiries: "Demandes",
  requests: "Places demandées",
  conversion: "Vues devenues des demandes",
  conversionValue: "{requests} demandes sur {views} vues ({pct})",
  conversionNone: "Aucune vue pour cette période, donc pas de taux.",
  listingEmpty: "Aucune vue, enregistrement, demande ou place pour cette période.",
  openListings: "Ouvrir les fiches",
  viewsChart: "Vues dans le temps",
  requestsChart: "Demandes de place dans le temps",
  responseTitle: "Délai de réponse",
  responseBody: "Heures entre le premier message d’un parent et votre première réponse.",
  yourReply: "Votre médiane",
  areaReply: "Moyenne du secteur",
  areaNote:
    "Autres centres à {city}. Les noms restent cachés. Affiché seulement si au moins 5 centres ont répondu.",
  areaHidden:
    "La moyenne du secteur reste cachée tant qu’une ville n’a pas au moins 5 autres centres qui ont répondu.",
  noReply: "Aucune réponse pour cette période.",
  hours: "{n} heures",
  oneHour: "1 heure",
  days: "{n} jours",
  underHour: "Moins d’une heure",
  replies: "{n} réponses",
  waitTitle: "Liste d’attente",
  waitBody:
    "Familles en attente maintenant, par âge. C’est la liste actuelle, pas seulement les inscriptions de la période.",
  waitEmpty: "Personne n’est sur votre liste d’attente.",
  waitCount: "En attente",
  avgWait: "Attente moyenne",
  daysShort: "{n} jours",
  ageInfant: "Nourrisson",
  ageToddler: "Tout-petit",
  agePreschool: "Préscolaire",
  ageAny: "Tout âge",
  openRequests: "Demandes ouvertes",
  enrolTitle: "Inscriptions et places",
  enrolBody:
    "Enfants inscrits maintenant, à côté de la capacité et des places libres sur votre fiche.",
  enrolled: "Inscrits",
  capacity: "Capacité permise",
  capacityPartial: "Capacité indiquée pour {known} centres sur {total}.",
  capacityMissing: "La capacité n’est pas encore sur la fiche.",
  openSpots: "Places libres",
  spotsMissing: "Les places libres ne sont pas encore publiées.",
  spotsPartial: "Places libres publiées pour {known} centres sur {total}.",
  enrolChart: "Nouvelles inscriptions",
  openChart: "Places libres enregistrées",
  enrolEmpty: "Aucun enfant inscrit au dossier, et les places ne sont pas encore publiées.",
  updateListings: "Mettre à jour les fiches",
  tourTitle: "Visites",
  tourBody: "Visites réservées, familles venues, et inscriptions après une visite.",
  booked: "Réservées",
  showRate: "Taux de présence",
  tourEnrol: "Visites devenues une inscription",
  tourAsked: "Demandées",
  tourEmpty: "Aucune visite pour cette période.",
  tourTimes: "Heures de visite",
  showUnknown: "Pas assez de visites terminées pour un taux.",
  attendTitle: "Présences",
  attendBody: "Arrivées que votre centre a notées. Rien n’est rempli à votre place.",
  attendEmpty: "Aucune présence pour cette période.",
  present: "Jours marqués présents",
  checkIns: "Arrivées",
  attendChart: "Arrivées",
  staffTitle: "Personnel",
  staffBody: "Ratios que vous avez notés, et certificats qui expirent dans les 90 prochains jours.",
  ratioEmpty: "Aucun contrôle de ratio pour cette période.",
  certEmpty: "Aucun certificat n’expire dans les 90 prochains jours.",
  certNone: "Aucun certificat au dossier.",
  staffEmpty: "Aucun contrôle de ratio ni certificat au dossier.",
  certTitle: "Certificats qui expirent bientôt",
  expires: "Expire le {date}",
  daysLeft: "{n} jours restants",
  ratioChart: "Enfants par adulte",
  reviewsTitle: "Avis",
  reviewsBody: "Seulement les avis de parents déjà publiés. KidEase n’ajoute pas d’étoiles.",
  reviewsEmpty: "Aucun avis publié pour cette période.",
  average: "Moyenne",
  reviewCount: "Avis",
  reviewChart: "Note moyenne",
  chartEmpty: "Rien à afficher pour cette période.",
};

export function insightsCopy(locale: string): InsightsCopy {
  return locale === "fr" ? fr : en;
}

export function fillInsight(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
